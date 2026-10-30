import 'server-only';

import { revalidatePath } from 'next/cache';
import type { Company, CompanyFeatures, Role, WorkflowNotificationSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auth/audit';
import { toFeatureFlags, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { PLAN_NAMES, PLAN_PRESETS } from '@/lib/pricing/presets';
import { companyCreateSchema, companyPlanUpdateSchema } from '@/modules/platform/schema';
import * as platformService from '@/modules/platform/services/platform.service';
import { cancelErasure, confirmErasure, requestErasure } from '@/modules/platform/services/company-erasure.service';
import { whenLabel, type ErasureKind } from '@/lib/company-erasure/policy';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';
import { getSalesEmail } from '@/lib/marketing/sales-lead';
import { buildMarketingContext, copyReviewContext } from '@/lib/marketing/context';
import { reviewMarketingCopy } from '@/lib/marketing/copy-review';
import { MARKETING_CHANNELS, type MarketingChannel } from '@/lib/marketing/brand-voice';
import { LEAD_REF_RE } from '@/lib/marketing/supersuite-events';
import type { ManejadorOrdenes, OrdenRecibida } from './cliente';
import { catalogoDeModulos, catalogoDePlanes, cuentaConPlan, fichaComercial, flagsDeLaBase, flagsDeModulo, flagsParaEncender, planDeAether } from './modulos';
import { sincronizarEmpresaSupersuite, solicitudModulosAtendidaSupersuite } from './index';

/**
 * Órdenes de la consola SaaS de la Supersuite: crear empresas, activar o
 * desactivar módulos, cambiar el plan, ajustar límites, suspender, liberar una
 * lista de IPs que dejó a la empresa afuera, dar o quitar acceso multiempresa,
 * cerrar sesiones, avisos y fichas.
 *
 * Esta es la ÚNICA vía de administración de la plataforma: Aether no tiene
 * superusuarios ni consola propia (se quitó /superadmin y la bandera
 * `isSuperAdmin` ya no concede nada). Cada orden se aplica con los servicios de
 * `modules/platform` (validación incluida) y queda en la bitácora de la
 * empresa con `userEmail: 'supersuite'`. Esa misma bitácora hace que Aether
 * reenvíe la ficha de la empresa, así la Supersuite ve el resultado real.
 *
 * Reiniciar (`empresa.reiniciar.*`) y eliminar (`empresa.eliminar.*`) una empresa son
 * irreversibles y van en dos pasos con código de un solo uso (ver `company-erasure.service.ts`).
 *
 * Un manejador que lanza informa la orden como fallida con su mensaje (se ve
 * en la bitácora de órdenes de la Supersuite). Todos son idempotentes: si la
 * confirmación se pierde, la Supersuite reentrega la orden.
 */

const QUIEN = 'supersuite';

type EmpresaConFlags = Company & { features: CompanyFeatures | null };

async function empresaDe(orden: OrdenRecibida): Promise<EmpresaConFlags> {
  if (!orden.clienteId) throw new Error('La orden no indica la empresa');
  const empresa = await prisma.company.findUnique({ where: { id: orden.clienteId }, include: { features: true } });
  if (!empresa) throw new Error(`La empresa ${orden.clienteId} no existe en Aether`);
  return empresa;
}

function revalidar(): void {
  // El menú del cliente se arma desde los flags: sin esto seguiría mostrando lo anterior.
  revalidatePath('/dashboard', 'layout');
}

/** Guarda plan, límites y módulos con el servicio de la plataforma y deja la huella en la bitácora. */
async function guardarCuenta(
  empresa: EmpresaConFlags,
  orden: OrdenRecibida,
  cambios: { planName?: string; maxUsers?: number; maxWarehouses?: number; maxWebSites?: number; features?: CompanyFeatureFlags }
): Promise<void> {
  const parsed = companyPlanUpdateSchema.safeParse({
    planName: cambios.planName ?? empresa.planName,
    maxUsers: cambios.maxUsers ?? empresa.maxUsers,
    maxWarehouses: cambios.maxWarehouses ?? empresa.maxWarehouses,
    maxWebSites: cambios.maxWebSites ?? empresa.maxWebSites,
    features: cambios.features ?? toFeatureFlags(empresa.features),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos inválidos para Aether');
  await platformService.updateTenantPlan(empresa.id, parsed.data);
  await createAuditLog({
    companyId: empresa.id,
    userEmail: QUIEN,
    action: 'UPDATE',
    entity: 'CompanyFeatures',
    entityId: empresa.id,
    metadata: { origen: QUIEN, orden: orden.id, tipo: orden.tipo, plan: parsed.data.planName, maxUsers: parsed.data.maxUsers, maxWarehouses: parsed.data.maxWarehouses, maxWebSites: parsed.data.maxWebSites },
  });
  // La empresa pidió módulos o un plan y ya se atendió: se cierra su alerta en la Supersuite.
  solicitudModulosAtendidaSupersuite(empresa.id);
  revalidar();
}

/** Nombres de módulo de la orden: `modulo` (uno) o `modulos` (varios), sin repetir. */
function modulosPedidos(orden: OrdenRecibida): string[] {
  const lista = Array.isArray(orden.datos.modulos) ? orden.datos.modulos : [orden.datos.modulo];
  return [...new Set(lista.map((m) => String(m ?? '').trim()).filter(Boolean))];
}

/**
 * Enciende o apaga uno o varios módulos en una sola escritura. Se valida todo antes
 * de tocar nada (un nombre inexistente o un módulo de la base no deja la orden a
 * medias) y el resultado dice qué cambió y cuánto queda la tarifa mensual de lista.
 */
async function cambiarModulos(orden: OrdenRecibida, encender: boolean) {
  const pedidos = modulosPedidos(orden);
  if (!pedidos.length) throw new Error('La orden no indica qué módulo cambiar');
  const grupos = pedidos.map((nombre) => ({ nombre, flags: flagsDeModulo(nombre) }));
  const desconocidos = grupos.filter((g) => !g.flags.length).map((g) => g.nombre);
  if (desconocidos.length) throw new Error(`Aether no tiene ${desconocidos.length === 1 ? 'un módulo' : 'los módulos'} ${desconocidos.map((n) => `"${n}"`).join(', ')} (la lista completa la entrega la orden modulos.listar)`);
  if (!encender) {
    const deLaBase = grupos.filter((g) => flagsDeLaBase(g.flags).length);
    if (deLaBase.length) throw new Error(`${deLaBase.map((g) => `"${g.nombre}"`).join(', ')} ${deLaBase.length === 1 ? 'es parte' : 'son parte'} de la plataforma base: no se desactiva`);
  }

  const empresa = await empresaDe(orden);
  const features = toFeatureFlags(empresa.features);
  // Encender una funcionalidad que vive dentro de otro módulo enciende también al padre.
  const flagsDe = (g: { flags: FeatureKey[] }) => (encender ? flagsParaEncender(g.flags) : g.flags);
  const porCambiar = grupos.filter((g) => flagsDe(g).some((flag) => features[flag] !== encender));
  if (!porCambiar.length) return { mensaje: encender ? 'Ya estaba activo' : 'Ya estaba apagado' };
  for (const g of porCambiar) for (const flag of flagsDe(g)) features[flag] = encender;
  await guardarCuenta(empresa, orden, { features });

  const tarifaMensual = fichaComercial({ planName: empresa.planName, features, maxUsers: empresa.maxUsers, maxWarehouses: empresa.maxWarehouses, maxWebSites: empresa.maxWebSites }).tarifaMensual;
  const nombres = porCambiar.map((g) => g.nombre).join(', ');
  const ya = grupos.length - porCambiar.length;
  return {
    mensaje: `${encender ? 'Activado' : 'Desactivado'} en Aether: ${nombres}${ya ? ` (${ya} ya ${ya === 1 ? 'estaba' : 'estaban'} así)` : ''}`,
    // `undefined` = plan anterior o a medida: no hay lista que aplicar y no se inventa una tarifa.
    datos: { cambiados: porCambiar.map((g) => g.nombre), ...(tarifaMensual !== undefined ? { tarifaMensual } : {}) },
  };
}

async function cambiarEstado(orden: OrdenRecibida, status: 'ACTIVE' | 'SUSPENDED') {
  const empresa = await empresaDe(orden);
  if (empresa.status === 'CANCELLED') throw new Error('La empresa está cancelada en Aether: Aether no la reactiva por orden');
  const yaEsta = status === 'SUSPENDED' ? empresa.status === 'SUSPENDED' : empresa.status !== 'SUSPENDED';
  if (yaEsta) return { mensaje: status === 'SUSPENDED' ? 'Ya estaba suspendida' : 'Ya estaba activa' };
  await platformService.setTenantStatus(empresa.id, status);
  await createAuditLog({
    companyId: empresa.id,
    userEmail: QUIEN,
    action: 'UPDATE',
    entity: 'Company',
    entityId: empresa.id,
    metadata: { origen: QUIEN, orden: orden.id, status, motivo: typeof orden.datos.motivo === 'string' ? orden.datos.motivo : null },
  });
  revalidar();
  if (status === 'ACTIVE') {
    // Una empresa que vuelve a operar ya no es candidata a eliminarse: se descartan sus solicitudes de eliminación pendientes.
    const canceladas = await cancelErasure({ companyId: empresa.id, kind: 'DELETE', reason: 'la empresa volvió a operar' });
    if (canceladas > 0) return { mensaje: `Cuenta reactivada. Se canceló ${canceladas === 1 ? 'su solicitud' : `sus ${canceladas} solicitudes`} de eliminación pendiente${canceladas === 1 ? '' : 's'}` };
  }
  return { mensaje: status === 'SUSPENDED' ? 'Cuenta suspendida: sus usuarios pierden el acceso de inmediato' : 'Cuenta reactivada' };
}

const SEVERIDAD: Record<string, WorkflowNotificationSeverity> = { info: 'INFO', aviso: 'WARNING', critico: 'CRITICAL' };

/** Empresas a las que va una orden "opcional": la indicada o todas las que siguen operando. */
async function destinatarias(orden: OrdenRecibida): Promise<string[]> {
  if (orden.clienteId) return [(await empresaDe(orden)).id];
  const empresas = await prisma.company.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } });
  return empresas.map((e) => e.id);
}

const ROLES: readonly string[] = ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'];
const textoDe = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');
const numeroDe = (valor: unknown): number | undefined => (typeof valor === 'number' ? valor : undefined);

/**
 * Alta de una empresa nueva: plan, módulos extra, límites y su primer Dueño.
 * El plan trae sus módulos y topes (`PLAN_PRESETS`); `modulos` suma otros por
 * su nombre en la Supersuite. La clave inicial viaja en la orden, así que el
 * Dueño queda obligado a cambiarla en su primer ingreso, y la bitácora
 * guarda solo el correo.
 *
 * Idempotente: si el RUT ya existe y fue esta misma vía quien lo creó, la
 * reentrega de la orden responde como aplicada en vez de fallar.
 */
async function crearEmpresa(orden: OrdenRecibida) {
  const d = orden.datos;
  const pedido = textoDe(d.plan) || 'Base';
  const plan = planDeAether(pedido);
  if (!plan) throw new Error(`El plan "${pedido}" no existe en Aether (planes: ${PLAN_NAMES.join(', ')})`);
  const preset = PLAN_PRESETS[plan];
  if (!preset) throw new Error(`El plan ${plan} no tiene configuración en Aether`);

  const features: CompanyFeatureFlags = { ...preset.features };
  const extras = Array.isArray(d.modulos) ? d.modulos.map((m) => String(m)) : [];
  for (const modulo of extras) {
    const flags = flagsDeModulo(modulo);
    if (!flags.length) throw new Error(`Aether no tiene un módulo "${modulo}"`);
    for (const flag of flags) features[flag] = true;
  }

  // Referencia del lead que trajo a la empresa (marketing propio, ADR 0015): une la campaña con el cliente.
  const leadRef = textoDe(d.leadRef).toUpperCase();
  if (leadRef && !LEAD_REF_RE.test(leadRef)) throw new Error('La referencia del lead debe ser como L-ABCD2345 (viene en el correo de la solicitud de demo o cotización)');

  const estado = textoDe(d.estado) || 'ACTIVE';
  const parsed = companyCreateSchema.safeParse({
    rut: textoDe(d.rut),
    businessName: textoDe(d.razonSocial),
    email: textoDe(d.correo),
    planName: plan,
    maxUsers: numeroDe(d.usuariosMax) ?? preset.maxUsers,
    maxWarehouses: numeroDe(d.bodegasMax) ?? preset.maxWarehouses,
    maxWebSites: numeroDe(d.sitiosMax),
    status: estado,
    features,
    adminName: textoDe(d.adminNombre),
    adminEmail: textoDe(d.adminCorreo),
    adminPassword: textoDe(d.adminClave) || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos inválidos para crear la empresa');
  if (parsed.data.status !== 'ACTIVE' && parsed.data.status !== 'TRIAL') throw new Error('Una empresa nueva solo puede nacer activa o en prueba');

  const existente = await prisma.company.findUnique({ where: { rut: formatRut(cleanRut(parsed.data.rut)) }, select: { id: true } });
  if (existente) {
    const creadaPorOrden = await prisma.auditLog.findFirst({
      where: { companyId: existente.id, entity: 'Company', entityId: existente.id, action: 'CREATE', userEmail: QUIEN },
      select: { id: true },
    });
    if (creadaPorOrden) return { mensaje: 'La empresa ya estaba creada', datos: { empresaId: existente.id } };
  }

  const { company, linkedExistingUser } = await platformService.createTenant(parsed.data, { mustChangePassword: true });
  await createAuditLog({
    companyId: company.id,
    userEmail: QUIEN,
    action: 'CREATE',
    entity: 'Company',
    entityId: company.id,
    metadata: { origen: QUIEN, orden: orden.id, plan, adminEmail: parsed.data.adminEmail, adminVinculadoExistente: linkedExistingUser, ...(leadRef ? { leadRef } : {}) },
  });
  return {
    mensaje: linkedExistingUser
      ? `Empresa ${company.businessName} creada. ${parsed.data.adminEmail} ya tenía cuenta: entra con su contraseña de siempre y elige la empresa al iniciar sesión`
      : `Empresa ${company.businessName} creada`,
    datos: { empresaId: company.id, ...(leadRef ? { leadRef } : {}) },
  };
}

const ACCION: Record<ErasureKind, string> = { RESET: 'reiniciar', DELETE: 'eliminar' };

/** Paso 1 de reiniciar o eliminar: cuenta lo que se borraría y entrega el código. No borra nada. */
async function solicitarBorrado(orden: OrdenRecibida, kind: ErasureKind) {
  const empresa = await empresaDe(orden);
  const r = await requestErasure({ companyId: empresa.id, kind, orderId: orden.id });
  const tablas = Object.keys(r.preview.tables).length;
  const avisos = r.preview.signals.map((s) => `${s.count} ${s.label}`);
  const confirmar =
    kind === 'DELETE'
      ? `Se puede confirmar desde el ${whenLabel(r.notBefore)} y hasta el ${whenLabel(r.expiresAt)}.`
      : `Confirma antes del ${whenLabel(r.expiresAt)}.`;
  const alcance =
    kind === 'DELETE'
      ? `se borraría TODO de ${empresa.businessName} (${r.preview.rows} filas en ${tablas} tablas, con sus usuarios, módulos y archivos) y la empresa dejaría de existir`
      : `se borrarían ${r.preview.rows} filas en ${tablas} tablas de ${empresa.businessName}; se conservan sus usuarios, módulos y configuración`;
  return {
    mensaje: `Código ${r.code}: ${alcance}. ${confirmar} Para ejecutarlo hay que enviar el código y la razón social escrita.${avisos.length ? ` Aviso: hay ${avisos.join('; ')} (la confirmación debe llevar aceptoDatosReales).` : ''}`,
    datos: {
      solicitudId: r.requestId,
      codigo: r.code,
      confirmarDesde: r.notBefore.toISOString(),
      vence: r.expiresAt.toISOString(),
      filas: r.preview.rows,
      tablas: r.preview.tables,
      advertencias: avisos,
    },
  };
}

/** Paso 2: ejecuta la solicitud con su código y la razón social escrita. Idempotente: reentregada, responde que ya estaba hecha. */
async function confirmarBorrado(orden: OrdenRecibida, kind: ErasureKind) {
  // No se busca la empresa antes: tras eliminarla ya no existe y la reentrega debe poder responder igual.
  if (!orden.clienteId) throw new Error('La orden no indica la empresa');
  const r = await confirmErasure({
    companyId: orden.clienteId,
    kind,
    code: textoDe(orden.datos.codigo),
    businessName: textoDe(orden.datos.razonSocial),
    acceptRealData: orden.datos.aceptoDatosReales === true,
  });
  revalidar();
  const archivos = r.files ? ` Archivos borrados: ${r.files.deleted}${r.files.failed ? ` (${r.files.failed} no se pudieron borrar)` : ''}.` : '';
  const respaldo = r.backup ? ` Respaldo guardado (${Math.round(r.backup.bytes / 1024)} KB).` : '';
  return {
    mensaje: r.alreadyDone
      ? `Ya estaba ${kind === 'DELETE' ? 'eliminada' : 'reiniciada'}.`
      : kind === 'DELETE'
        ? `Empresa eliminada: ${r.rows} filas en ${r.tables} tablas.${respaldo}${archivos}`
        : `Empresa reiniciada: ${r.rows} filas en ${r.tables} tablas. Usuarios, módulos y configuración siguen igual${r.chartOfAccounts ? '; se volvió a sembrar el plan de cuentas' : ''}.${respaldo}`,
    datos: { filas: r.rows, tablas: r.tables, ...(r.backup ? { respaldo: r.backup } : {}), ...(r.files ? { archivos: r.files } : {}), yaEstaba: r.alreadyDone },
  };
}

async function cancelarBorrado(orden: OrdenRecibida, kind: ErasureKind) {
  if (!orden.clienteId) throw new Error('La orden no indica la empresa');
  const n = await cancelErasure({ companyId: orden.clienteId, kind });
  return { mensaje: n === 0 ? `No había solicitudes de ${ACCION[kind]} pendientes` : `${n} ${n === 1 ? 'solicitud cancelada' : 'solicitudes canceladas'}`, datos: { canceladas: n } };
}

const MAX_PIEZAS = 50;
const MAX_TEXTO = 10_000;

/** Piezas a revisar: `piezas: [{ id, canal, texto }]` (un calendario completo) o una sola con `canal` y `texto`. */
function piezasDe(orden: OrdenRecibida): { id: string; canal: MarketingChannel; texto: string }[] {
  const d = orden.datos;
  const lista: unknown[] = Array.isArray(d.piezas) ? d.piezas : [{ id: d.id, canal: d.canal, texto: d.texto }];
  if (!lista.length) throw new Error('La orden no trae piezas que revisar');
  if (lista.length > MAX_PIEZAS) throw new Error(`Se revisan hasta ${MAX_PIEZAS} piezas por orden (llegaron ${lista.length})`);
  return lista.map((p, i) => {
    const item = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
    const canal = textoDe(item.canal);
    if (!(MARKETING_CHANNELS as readonly string[]).includes(canal)) throw new Error(`Pieza ${i + 1}: el canal "${canal}" no existe (canales: ${MARKETING_CHANNELS.join(', ')})`);
    if (typeof item.texto !== 'string') throw new Error(`Pieza ${i + 1}: falta el texto`);
    if (item.texto.length > MAX_TEXTO) throw new Error(`Pieza ${i + 1}: el texto supera los ${MAX_TEXTO} caracteres`);
    return { id: textoDe(item.id) || String(i + 1), canal: canal as MarketingChannel, texto: item.texto };
  });
}

function marketingInput() {
  return { baseUrl: platformBaseUrl(), salesEmail: getSalesEmail() };
}

export const manejadoresOrdenes: ManejadorOrdenes = {
  'empresa.crear': crearEmpresa,

  'modulo.activar': (orden) => cambiarModulos(orden, true),
  'modulo.desactivar': (orden) => cambiarModulos(orden, false),

  // Lo que se puede encender o apagar, con precio de lista; con empresa, además su estado y si va incluido en su plan.
  'modulos.listar': async (orden) => {
    const empresa = orden.clienteId ? await empresaDe(orden) : null;
    const modulos = catalogoDeModulos(empresa ? { planName: empresa.planName, features: toFeatureFlags(empresa.features) } : undefined);
    return {
      mensaje: `${modulos.length} módulos${empresa ? ` · plan ${empresa.planName}` : ''}`,
      datos: { modulos, planes: catalogoDePlanes(), ...(empresa ? { plan: empresa.planName } : {}) },
    };
  },

  'plan.cambiar': async (orden) => {
    const pedido = String(orden.datos.plan ?? '');
    const plan = planDeAether(pedido);
    if (!plan) throw new Error(`El plan "${pedido}" no existe en Aether (planes: ${PLAN_NAMES.join(', ')})`);
    const empresa = await empresaDe(orden);
    if (empresa.planName === plan) return { mensaje: `Ya estaba en el plan ${plan}` };
    const cuenta = cuentaConPlan(plan, { features: toFeatureFlags(empresa.features), maxUsers: empresa.maxUsers, maxWarehouses: empresa.maxWarehouses });
    if (!cuenta) throw new Error(`El plan ${plan} no tiene configuración en Aether`);
    await guardarCuenta(empresa, orden, { planName: plan, ...cuenta });
    return { mensaje: `Plan ${plan}: se activaron sus módulos y se conservan los que ya tenía` };
  },

  'limites.ajustar': async (orden) => {
    const { usuariosMax, bodegasMax, sitiosMax } = orden.datos;
    if (usuariosMax === null || bodegasMax === null || sitiosMax === null) throw new Error('Aether exige un tope de usuarios, de bodegas y de sitios web (no admite "sin tope")');
    const empresa = await empresaDe(orden);
    const nuevo = {
      maxUsers: typeof usuariosMax === 'number' ? usuariosMax : undefined,
      maxWarehouses: typeof bodegasMax === 'number' ? bodegasMax : undefined,
      maxWebSites: typeof sitiosMax === 'number' ? sitiosMax : undefined,
    };
    if (nuevo.maxUsers === undefined && nuevo.maxWarehouses === undefined && nuevo.maxWebSites === undefined) {
      throw new Error('La orden no indica ningún límite (usuariosMax, bodegasMax o sitiosMax)');
    }
    await guardarCuenta(empresa, orden, nuevo);
    // Bajar el tope por debajo de lo que la empresa ya tiene no borra nada: solo impide crear más.
    return { mensaje: 'Límites actualizados', datos: { usuariosMax: nuevo.maxUsers ?? empresa.maxUsers, bodegasMax: nuevo.maxWarehouses ?? empresa.maxWarehouses, sitiosMax: nuevo.maxWebSites ?? empresa.maxWebSites } };
  },

  'cuenta.suspender': (orden) => cambiarEstado(orden, 'SUSPENDED'),
  'cuenta.reactivar': (orden) => cambiarEstado(orden, 'ACTIVE'),

  // Borrar los datos de la empresa (conserva usuarios, módulos y configuración) o la empresa entera. Irreversible:
  // dos pasos con código, respaldo antes de borrar y, para eliminar, empresa suspendida y 7 días de espera.
  'empresa.reiniciar.solicitar': (orden) => solicitarBorrado(orden, 'RESET'),
  'empresa.reiniciar.confirmar': (orden) => confirmarBorrado(orden, 'RESET'),
  'empresa.reiniciar.cancelar': (orden) => cancelarBorrado(orden, 'RESET'),
  'empresa.eliminar.solicitar': (orden) => solicitarBorrado(orden, 'DELETE'),
  'empresa.eliminar.confirmar': (orden) => confirmarBorrado(orden, 'DELETE'),
  'empresa.eliminar.cancelar': (orden) => cancelarBorrado(orden, 'DELETE'),

  'seguridad.ip.liberar': async (orden) => {
    // Válvula de emergencia: la empresa activó su lista de IPs sin agregar la propia y nadie puede entrar a corregirla.
    const empresa = await empresaDe(orden);
    await platformService.disableTenantIpAllowlist(empresa.id);
    await createAuditLog({
      companyId: empresa.id,
      userEmail: QUIEN,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: empresa.id,
      metadata: { origen: QUIEN, orden: orden.id, reason: 'ip_allowlist_disabled_by_supersuite' },
    });
    return { mensaje: 'Restricción por IP desactivada: la empresa debe revisar su lista antes de volver a activarla' };
  },

  'acceso.otorgar': async (orden) => {
    const correo = textoDe(orden.datos.correo);
    const rol = textoDe(orden.datos.rol);
    if (!correo) throw new Error('La orden no indica el correo de la persona');
    if (!ROLES.includes(rol)) throw new Error(`El rol "${rol}" no existe en Aether (roles: ${ROLES.join(', ')})`);
    const empresa = await empresaDe(orden);
    const membresia = await platformService.grantCompanyMembership(empresa.id, correo, rol as Role);
    await createAuditLog({
      companyId: empresa.id,
      userEmail: QUIEN,
      action: 'CREATE',
      entity: 'CompanyMembership',
      entityId: membresia.id,
      metadata: { origen: QUIEN, orden: orden.id, reason: 'multi_company_membership_granted', memberEmail: membresia.userEmail, role: rol },
    });
    revalidar();
    return { mensaje: `${membresia.userEmail} ahora puede administrar esta empresa (módulo multiempresa activado)` };
  },

  'acceso.revocar': async (orden) => {
    const correo = textoDe(orden.datos.correo);
    if (!correo) throw new Error('La orden no indica el correo de la persona');
    const empresa = await empresaDe(orden);
    const membresia = await prisma.companyMembership.findFirst({
      where: { companyId: empresa.id, user: { email: { equals: correo, mode: 'insensitive' } } },
      select: { id: true },
    });
    if (!membresia) return { mensaje: 'Esa persona ya no tenía acceso a la empresa' };
    await platformService.revokeCompanyMembership(empresa.id, membresia.id);
    await createAuditLog({
      companyId: empresa.id,
      userEmail: QUIEN,
      action: 'DELETE',
      entity: 'CompanyMembership',
      entityId: membresia.id,
      metadata: { origen: QUIEN, orden: orden.id, reason: 'multi_company_membership_revoked' },
    });
    revalidar();
    return { mensaje: 'Acceso revocado' };
  },

  'sesiones.cerrar': async (orden) => {
    const r = await prisma.userSession.updateMany({
      where: { revokedAt: null, ...(orden.clienteId ? { companyId: (await empresaDe(orden)).id } : {}) },
      data: { revokedAt: new Date() },
    });
    return { mensaje: `Se cerraron ${r.count} ${r.count === 1 ? 'sesión' : 'sesiones'}`, datos: { sesiones: r.count } };
  },

  'anuncio.publicar': async (orden) => {
    const titulo = String(orden.datos.titulo ?? '').trim();
    const mensaje = String(orden.datos.mensaje ?? '').trim();
    if (!titulo || !mensaje) throw new Error('El anuncio necesita título y mensaje');
    const empresas = await destinatarias(orden);
    for (const companyId of empresas) {
      await notifyCompany(companyId, { severity: SEVERIDAD[String(orden.datos.nivel)] ?? 'INFO', title: titulo, message: mensaje });
    }
    return { mensaje: `Aviso enviado a ${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'} (campanita y push)` };
  },

  // Marketing PROPIO de Aether (ADR 0015): lo que el agente de la Supersuite puede decir y mostrar, y la revisión de sus textos.
  // Solo leen datos públicos (los del landing): no tocan la base ni ninguna empresa.
  'marketing.contexto': async () => {
    const contexto = buildMarketingContext(marketingInput());
    return { mensaje: `Contexto de marketing ${contexto.version} · ${contexto.oferta.modulos.length} módulos`, datos: contexto };
  },

  'marketing.revisar': async (orden) => {
    const piezas = piezasDe(orden);
    const ctx = copyReviewContext(marketingInput());
    const revisiones = piezas.map((p) => ({ id: p.id, canal: p.canal, ...reviewMarketingCopy(p.texto, p.canal, ctx) }));
    const aprobadas = revisiones.filter((r) => r.aprobado).length;
    return {
      mensaje: `${aprobadas} de ${revisiones.length} ${revisiones.length === 1 ? 'pieza aprobada' : 'piezas aprobadas'} por la revisión automática`,
      datos: { aprobadas, total: revisiones.length, revisiones },
    };
  },

  'ficha.sincronizar': async (orden) => {
    const empresas = orden.clienteId
      ? [(await empresaDe(orden)).id]
      : (await prisma.company.findMany({ select: { id: true } })).map((e) => e.id);
    for (const companyId of empresas) await sincronizarEmpresaSupersuite(companyId);
    return { mensaje: `Ficha reenviada (${empresas.length})` };
  },
};
