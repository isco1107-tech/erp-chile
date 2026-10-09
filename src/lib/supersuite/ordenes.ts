import 'server-only';

import { revalidatePath } from 'next/cache';
import type { Company, CompanyFeatures, Role, WorkflowNotificationSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auth/audit';
import { toFeatureFlags, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { PLAN_NAMES, PLAN_PRESETS } from '@/lib/pricing/presets';
import { companyCreateSchema, companyPlanUpdateSchema } from '@/modules/platform/schema';
import * as platformService from '@/modules/platform/services/platform.service';
import type { ManejadorOrdenes, OrdenRecibida } from './cliente';
import { cuentaConPlan, flagsDeModulo, planDeAether } from './modulos';
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
  cambios: { planName?: string; maxUsers?: number; maxWarehouses?: number; features?: CompanyFeatureFlags }
): Promise<void> {
  const parsed = companyPlanUpdateSchema.safeParse({
    planName: cambios.planName ?? empresa.planName,
    maxUsers: cambios.maxUsers ?? empresa.maxUsers,
    maxWarehouses: cambios.maxWarehouses ?? empresa.maxWarehouses,
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
    metadata: { origen: QUIEN, orden: orden.id, tipo: orden.tipo, plan: parsed.data.planName, maxUsers: parsed.data.maxUsers, maxWarehouses: parsed.data.maxWarehouses },
  });
  // La empresa pidió módulos o un plan y ya se atendió: se cierra su alerta en la Supersuite.
  solicitudModulosAtendidaSupersuite(empresa.id);
  revalidar();
}

async function cambiarModulo(orden: OrdenRecibida, encender: boolean) {
  const modulo = String(orden.datos.modulo ?? '');
  const flags = flagsDeModulo(modulo);
  if (!flags.length) throw new Error(`Aether no tiene un módulo "${modulo}"`);
  const empresa = await empresaDe(orden);
  const features = toFeatureFlags(empresa.features);
  if (flags.every((flag) => features[flag] === encender)) return { mensaje: encender ? 'Ya estaba activo' : 'Ya estaba apagado' };
  for (const flag of flags) features[flag] = encender;
  await guardarCuenta(empresa, orden, { features });
  return { mensaje: encender ? 'Módulo activado en Aether' : 'Módulo desactivado en Aether' };
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

  const estado = textoDe(d.estado) || 'ACTIVE';
  const parsed = companyCreateSchema.safeParse({
    rut: textoDe(d.rut),
    businessName: textoDe(d.razonSocial),
    email: textoDe(d.correo),
    planName: plan,
    maxUsers: numeroDe(d.usuariosMax) ?? preset.maxUsers,
    maxWarehouses: numeroDe(d.bodegasMax) ?? preset.maxWarehouses,
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
    metadata: { origen: QUIEN, orden: orden.id, plan, adminEmail: parsed.data.adminEmail, adminVinculadoExistente: linkedExistingUser },
  });
  return {
    mensaje: linkedExistingUser
      ? `Empresa ${company.businessName} creada. ${parsed.data.adminEmail} ya tenía cuenta: entra con su contraseña de siempre y elige la empresa al iniciar sesión`
      : `Empresa ${company.businessName} creada`,
    datos: { empresaId: company.id },
  };
}

export const manejadoresOrdenes: ManejadorOrdenes = {
  'empresa.crear': crearEmpresa,

  'modulo.activar': (orden) => cambiarModulo(orden, true),
  'modulo.desactivar': (orden) => cambiarModulo(orden, false),

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
    const { usuariosMax, bodegasMax } = orden.datos;
    if (usuariosMax === null || bodegasMax === null) throw new Error('Aether exige un tope de usuarios y de bodegas (no admite "sin tope")');
    const empresa = await empresaDe(orden);
    await guardarCuenta(empresa, orden, {
      maxUsers: typeof usuariosMax === 'number' ? usuariosMax : undefined,
      maxWarehouses: typeof bodegasMax === 'number' ? bodegasMax : undefined,
    });
    return { mensaje: 'Límites actualizados' };
  },

  'cuenta.suspender': (orden) => cambiarEstado(orden, 'SUSPENDED'),
  'cuenta.reactivar': (orden) => cambiarEstado(orden, 'ACTIVE'),

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

  'ficha.sincronizar': async (orden) => {
    const empresas = orden.clienteId
      ? [(await empresaDe(orden)).id]
      : (await prisma.company.findMany({ select: { id: true } })).map((e) => e.id);
    for (const companyId of empresas) await sincronizarEmpresaSupersuite(companyId);
    return { mensaje: `Ficha reenviada (${empresas.length})` };
  },
};
