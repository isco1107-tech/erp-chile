import 'server-only';

import { revalidatePath } from 'next/cache';
import type { Company, CompanyFeatures, WorkflowNotificationSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auth/audit';
import { toFeatureFlags, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { PLAN_NAMES } from '@/lib/pricing/presets';
import { companyPlanUpdateSchema } from '@/modules/platform/schema';
import * as platformService from '@/modules/platform/services/platform.service';
import type { ManejadorOrdenes, OrdenRecibida } from './cliente';
import { cuentaConPlan, flagsDeModulo, planDeAether } from './modulos';
import { sincronizarEmpresaSupersuite } from './index';

/**
 * Órdenes de la consola SaaS de la Supersuite: activar o desactivar módulos,
 * cambiar el plan, ajustar límites, suspender, cerrar sesiones, avisos y fichas.
 *
 * Cada orden se aplica con los MISMOS servicios que usa el superadmin en
 * /superadmin/companies (validación incluida) y queda en la bitácora de la
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

function revalidar(companyId: string): void {
  revalidatePath(`/superadmin/companies/${companyId}`);
  revalidatePath('/superadmin/companies');
  // El menú del cliente se arma desde los flags: sin esto seguiría mostrando lo anterior.
  revalidatePath('/dashboard', 'layout');
}

/** Guarda plan, límites y módulos con el servicio del superadmin y deja la huella en la bitácora. */
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
  revalidar(empresa.id);
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
  if (empresa.status === 'CANCELLED') throw new Error('La empresa está cancelada en Aether: se reactiva desde el superadmin');
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
  revalidar(empresa.id);
  return { mensaje: status === 'SUSPENDED' ? 'Cuenta suspendida: sus usuarios pierden el acceso de inmediato' : 'Cuenta reactivada' };
}

const SEVERIDAD: Record<string, WorkflowNotificationSeverity> = { info: 'INFO', aviso: 'WARNING', critico: 'CRITICAL' };

/** Empresas a las que va una orden "opcional": la indicada o todas las que siguen operando. */
async function destinatarias(orden: OrdenRecibida): Promise<string[]> {
  if (orden.clienteId) return [(await empresaDe(orden)).id];
  const empresas = await prisma.company.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } });
  return empresas.map((e) => e.id);
}

export const manejadoresOrdenes: ManejadorOrdenes = {
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

  'sesiones.cerrar': async (orden) => {
    // Las sesiones del personal de Aether (superadmin) nunca se cierran desde afuera.
    const r = await prisma.userSession.updateMany({
      where: { revokedAt: null, user: { isSuperAdmin: false }, ...(orden.clienteId ? { companyId: (await empresaDe(orden)).id } : {}) },
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
