/**
 * Órdenes de la consola SaaS de la Supersuite (src/lib/supersuite/ordenes.ts y
 * el webhook /api/supersuite/ordenes): (1) sin firma válida no se aplica nada,
 * (2) cada orden usa los servicios del superadmin con su validación, (3) nunca
 * se quita un módulo de forma implícita y (4) lo que no se puede aplicar vuelve
 * como fallo con un mensaje claro, nunca en silencio.
 */
import { createHmac } from 'node:crypto';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/server', () => ({
  NextResponse: { json: (cuerpo: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => cuerpo }) },
  after: jest.fn(),
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/notifications/company-notification', () => ({ notifyCompany: jest.fn() }));
jest.mock('@/lib/supersuite', () => ({ sincronizarEmpresaSupersuite: jest.fn() }));
jest.mock('@/modules/platform/services/platform.service', () => ({ updateTenantPlan: jest.fn(), setTenantStatus: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn(), findMany: jest.fn() },
    userSession: { updateMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auth/audit';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { updateTenantPlan, setTenantStatus } from '@/modules/platform/services/platform.service';
import { cuentaConPlan, flagsDeModulo, planDeAether } from '@/lib/supersuite/modulos';
import { PLAN_PRESETS } from '@/lib/pricing/presets';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';
import { POST } from '@/app/api/supersuite/ordenes/route';

const SECRETO = 'whsec_prueba';
const findUnique = prisma.company.findUnique as jest.Mock;
const findMany = prisma.company.findMany as jest.Mock;
const sesiones = prisma.userSession.updateMany as jest.Mock;

function firmar(cuerpo: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', SECRETO).update(`${t}.${cuerpo}`).digest('hex')}`;
}

let siguienteId = 1;
async function enviar(tipo: string, datos: Record<string, unknown> = {}, clienteId: string | null = 'c1', firma?: string) {
  const cuerpo = JSON.stringify({ id: siguienteId++, proyecto: 'aether', tipo, clienteId, datos, creadaEn: new Date().toISOString(), intento: 1 });
  const req = new Request('https://aether.test/api/supersuite/ordenes', {
    method: 'POST',
    headers: { 'x-supersuite-firma': firma ?? firmar(cuerpo) },
    body: cuerpo,
  });
  const r = await POST(req);
  return { status: r.status, cuerpo: (await r.json()) as { ok: boolean; mensaje?: string } };
}

const empresa = (extra: Record<string, unknown> = {}) => ({
  id: 'c1', planName: 'Base', maxUsers: 2, maxWarehouses: 1, status: 'ACTIVE',
  features: { ...DEFAULT_FEATURES, hasPos: false, hasPayroll: false },
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPERSUITE_WEBHOOK_SECRET = SECRETO;
  findUnique.mockResolvedValue(empresa());
});

describe('equivalencias puras', () => {
  it('un módulo se reconoce por su nombre en la Supersuite o por su id del tarifario', () => {
    expect(flagsDeModulo('pos')).toEqual(['hasPos']);
    expect(flagsDeModulo('rrhh')).toEqual(flagsDeModulo('payroll'));
    expect(flagsDeModulo('no-existe')).toEqual([]);
    // Lo que se vende junto se activa junto (entradas y votación del público).
    expect(flagsDeModulo('entradas')).toContain('hasTicketing');
    expect(flagsDeModulo('entradas')).toEqual(flagsDeModulo('votacion'));
  });

  it('el plan se busca sin importar tildes ni mayúsculas', () => {
    expect(planDeAether('gestion')).toBe('Gestión');
    expect(planDeAether('TOTAL')).toBe('Total');
    expect(planDeAether('Platino')).toBeNull();
  });

  it('cambiar de plan suma sus módulos y límites sin quitar nada de lo que ya había', () => {
    const actual = { features: { ...PLAN_PRESETS.Base.features, hasPayroll: true }, maxUsers: 40, maxWarehouses: 1 };
    const r = cuentaConPlan('Comercio', actual)!;
    expect(r.features.hasPayroll).toBe(true);
    for (const [flag, valor] of Object.entries(PLAN_PRESETS.Comercio.features)) if (valor) expect(r.features[flag as keyof typeof r.features]).toBe(true);
    expect(r.maxUsers).toBe(40);
    expect(r.maxWarehouses).toBeGreaterThanOrEqual(PLAN_PRESETS.Comercio.maxWarehouses);
    expect(cuentaConPlan('Inventado', actual)).toBeNull();
  });
});

describe('webhook de órdenes', () => {
  it('sin secreto configurado no acepta nada', async () => {
    delete process.env.SUPERSUITE_WEBHOOK_SECRET;
    expect((await enviar('modulo.activar', { modulo: 'pos' })).status).toBe(503);
    expect(updateTenantPlan).not.toHaveBeenCalled();
  });

  it('una firma inválida o vencida se rechaza sin tocar nada', async () => {
    expect((await enviar('modulo.activar', { modulo: 'pos' }, 'c1', 't=1,v1=00')).status).toBe(401);
    const viejo = Math.floor(Date.now() / 1000) - 3600;
    const cuerpo = '{}';
    expect((await enviar('modulo.activar', { modulo: 'pos' }, 'c1', firmar(cuerpo, viejo))).status).toBe(401);
    expect(updateTenantPlan).not.toHaveBeenCalled();
  });

  it('activar un módulo usa el servicio del superadmin y queda en la bitácora', async () => {
    const r = await enviar('modulo.activar', { modulo: 'pos' });
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, mensaje: 'Módulo activado en Aether' } });
    const [companyId, input] = (updateTenantPlan as jest.Mock).mock.calls[0];
    expect(companyId).toBe('c1');
    expect(input).toMatchObject({ planName: 'Base', maxUsers: 2, maxWarehouses: 1 });
    expect(input.features.hasPos).toBe(true);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1', userEmail: 'supersuite', entity: 'CompanyFeatures' }));
  });

  it('activar algo que ya está activo no reescribe nada (idempotente)', async () => {
    findUnique.mockResolvedValue(empresa({ features: { ...DEFAULT_FEATURES, hasPos: true } }));
    expect((await enviar('modulo.activar', { modulo: 'pos' })).cuerpo).toEqual({ ok: true, mensaje: 'Ya estaba activo' });
    expect(updateTenantPlan).not.toHaveBeenCalled();
  });

  it('lo que Aether no puede aplicar vuelve como fallo con el motivo', async () => {
    expect((await enviar('modulo.activar', { modulo: 'teletransporte' })).cuerpo).toMatchObject({ ok: false, mensaje: expect.stringContaining('teletransporte') });
    expect((await enviar('plan.cambiar', { plan: 'Platino' })).cuerpo).toMatchObject({ ok: false, mensaje: expect.stringContaining('Platino') });
    expect((await enviar('limites.ajustar', { usuariosMax: null })).cuerpo.ok).toBe(false);
    expect((await enviar('limites.ajustar', { bodegasMax: 99 })).cuerpo.ok).toBe(false);
    findUnique.mockResolvedValue(null);
    expect((await enviar('modulo.activar', { modulo: 'pos' })).cuerpo).toMatchObject({ ok: false, mensaje: expect.stringContaining('no existe') });
    expect(updateTenantPlan).not.toHaveBeenCalled();
  });

  it('cambiar de plan no quita los módulos que ya tenía', async () => {
    findUnique.mockResolvedValue(empresa({ features: { ...DEFAULT_FEATURES, hasPayroll: true } }));
    expect((await enviar('plan.cambiar', { plan: 'comercio' })).cuerpo.ok).toBe(true);
    const [, input] = (updateTenantPlan as jest.Mock).mock.calls[0];
    expect(input.planName).toBe('Comercio');
    expect(input.features.hasPayroll).toBe(true);
  });

  it('suspender y reactivar cambian el estado; una cancelada no se toca', async () => {
    expect((await enviar('cuenta.suspender', { motivo: 'pago atrasado' })).cuerpo.ok).toBe(true);
    expect(setTenantStatus).toHaveBeenCalledWith('c1', 'SUSPENDED');
    findUnique.mockResolvedValue(empresa({ status: 'SUSPENDED' }));
    expect((await enviar('cuenta.reactivar')).cuerpo.ok).toBe(true);
    expect(setTenantStatus).toHaveBeenLastCalledWith('c1', 'ACTIVE');
    findUnique.mockResolvedValue(empresa({ status: 'CANCELLED' }));
    expect((await enviar('cuenta.reactivar')).cuerpo.ok).toBe(false);
    expect(setTenantStatus).toHaveBeenCalledTimes(2);
  });

  it('cerrar sesiones nunca toca las del superadmin', async () => {
    sesiones.mockResolvedValue({ count: 3 });
    expect((await enviar('sesiones.cerrar')).cuerpo).toMatchObject({ ok: true, mensaje: 'Se cerraron 3 sesiones' });
    expect(sesiones.mock.calls[0][0].where).toMatchObject({ revokedAt: null, user: { isSuperAdmin: false }, companyId: 'c1' });
  });

  it('un anuncio sin empresa va a todas las que operan, por la campanita', async () => {
    findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const r = await enviar('anuncio.publicar', { titulo: 'Mantención', mensaje: 'Domingo 02:00', nivel: 'aviso' }, null);
    expect(r.cuerpo).toMatchObject({ ok: true });
    expect(notifyCompany).toHaveBeenCalledTimes(2);
    expect(notifyCompany).toHaveBeenCalledWith('c2', expect.objectContaining({ severity: 'WARNING', title: 'Mantención' }));
  });

  it('el ping se responde solo y un tipo desconocido se informa como fallo', async () => {
    expect((await enviar('ping', {}, null)).cuerpo).toMatchObject({ ok: true, mensaje: 'pong' });
    expect((await enviar('borrar.todo')).cuerpo.ok).toBe(false);
  });
});
