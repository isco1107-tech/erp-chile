/**
 * `scripts/enviar-orden-supersuite.ts` (parte pura en `scripts/lib/supersuite-orders.ts`): firma y envía a Aether
 * las órdenes de reiniciar/eliminar una empresa. Lo importante no es que arme un JSON, sino que Aether LO
 * ACEPTE: por eso las órdenes armadas aquí se pasan por la ruta real `POST /api/supersuite/ordenes` (con los
 * servicios de borrado simulados) y por el verificador de firma del servidor.
 */
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/server', () => ({
  NextResponse: { json: (cuerpo: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => cuerpo }) },
  after: jest.fn(),
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/supersuite/index', () => ({ sincronizarEmpresaSupersuite: jest.fn(), solicitudModulosAtendidaSupersuite: jest.fn() }));
jest.mock('@/lib/notifications/company-notification', () => ({ notifyCompany: jest.fn() }));
jest.mock('@/modules/platform/services/platform.service', () => ({
  updateTenantPlan: jest.fn(),
  setTenantStatus: jest.fn(),
  createTenant: jest.fn(),
  disableTenantIpAllowlist: jest.fn(),
  grantCompanyMembership: jest.fn(),
  revokeCompanyMembership: jest.fn(),
}));
jest.mock('@/modules/platform/services/company-erasure.service', () => ({
  requestErasure: jest.fn(),
  confirmErasure: jest.fn(),
  cancelErasure: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn(), findMany: jest.fn() },
    userSession: { updateMany: jest.fn() },
    auditLog: { findFirst: jest.fn() },
    companyMembership: { findFirst: jest.fn() },
  },
}));

import { verificarFirma } from '@/lib/supersuite/cliente';
import { manejadoresOrdenes } from '@/lib/supersuite/ordenes';
import { POST } from '@/app/api/supersuite/ordenes/route';
import { prisma } from '@/lib/prisma';
import * as erasure from '@/modules/platform/services/company-erasure.service';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';
import {
  buildSignedOrder,
  businessNameMatches,
  companySelector,
  confirmCommandHint,
  describeHttpFailure,
  normalizeBaseUrl,
  orderType,
  parseOrderArgs,
  readRequestDetails,
} from '../scripts/lib/supersuite-orders';

const SECRET = 'whsec_prueba_script';
const NOW = Date.parse('2026-11-02T15:00:00.000Z');

async function postToAether(built: { body: string; signature: string }) {
  const res = await POST(new Request('https://aether.test/api/supersuite/ordenes', { method: 'POST', headers: { 'x-supersuite-firma': built.signature }, body: built.body }));
  return { status: res.status, body: (await res.json()) as { ok: boolean; mensaje?: string; datos?: Record<string, unknown> } };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPERSUITE_WEBHOOK_SECRET = SECRET;
  (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'c1', businessName: 'Chakra SpA', status: 'SUSPENDED', features: { ...DEFAULT_FEATURES } });
});

describe('firma', () => {
  it('Aether la verifica con su propio verificador', async () => {
    const { body, signature } = buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null });
    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(await verificarFirma(SECRET, signature, body, 300)).toBe(true);
    // La hora entra en la firma: con una hora fija el mismo verificador acepta si se le da esa tolerancia.
    const fixed = buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null }, NOW);
    expect(fixed.signature).toContain(`t=${Math.floor(NOW / 1000)},`);
    expect(await verificarFirma(SECRET, fixed.signature, fixed.body, Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('no sirve con otro secreto, con el cuerpo cambiado ni vieja', async () => {
    const { body, signature } = buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null });
    expect(await verificarFirma('otro-secreto', signature, body)).toBe(false);
    expect(await verificarFirma(SECRET, signature, body.replace('ping', 'pong'))).toBe(false);
    const old = buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null }, Date.now() - 10 * 60_000);
    expect(await verificarFirma(SECRET, old.signature, old.body)).toBe(false);
  });

  it('sin secreto no firma', () => {
    expect(() => buildSignedOrder('', { tipo: 'ping', clienteId: null })).toThrow(/SUPERSUITE_WEBHOOK_SECRET/);
  });

  it('el id de la orden cabe en el entero de 32 bits donde Aether lo guarda', () => {
    const { body } = buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null }, NOW);
    const id = (JSON.parse(body) as { id: number }).id;
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeLessThan(2 ** 31);
  });
});

describe('contra la ruta real de Aether', () => {
  const requested = {
    requestId: 'sol1',
    code: 'ABCDE-FGHJK',
    notBefore: new Date('2026-11-09T15:00:00Z'),
    expiresAt: new Date('2026-11-16T15:00:00Z'),
    preview: { rows: 321, tables: { Product: 12, SalesDocument: 40 }, signals: [] },
  };

  it('ping responde sin tocar ninguna empresa', async () => {
    const r = await postToAether(buildSignedOrder(SECRET, { tipo: 'ping', clienteId: null }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, mensaje: 'pong' });
  });

  it('con otro secreto Aether rechaza la orden y no ejecuta nada', async () => {
    const r = await postToAether(buildSignedOrder('secreto-equivocado', { tipo: orderType('reiniciar', 'solicitar'), clienteId: 'c1' }));
    expect(r.status).toBe(401);
    expect(erasure.requestErasure).not.toHaveBeenCalled();
  });

  it('solicitar reiniciar y eliminar llegan al servicio de borrado con el tipo correcto', async () => {
    (erasure.requestErasure as jest.Mock).mockResolvedValue(requested);
    const reset = await postToAether(buildSignedOrder(SECRET, { tipo: orderType('reiniciar', 'solicitar'), clienteId: 'c1' }));
    expect(reset.body.ok).toBe(true);
    expect(erasure.requestErasure).toHaveBeenLastCalledWith({ companyId: 'c1', kind: 'RESET', orderId: expect.any(Number) });
    expect(readRequestDetails(reset.body.datos)).toMatchObject({ code: 'ABCDE-FGHJK', rows: 321, requestId: 'sol1' });

    await postToAether(buildSignedOrder(SECRET, { tipo: orderType('eliminar', 'solicitar'), clienteId: 'c1' }));
    expect(erasure.requestErasure).toHaveBeenLastCalledWith({ companyId: 'c1', kind: 'DELETE', orderId: expect.any(Number) });
    expect(erasure.confirmErasure).not.toHaveBeenCalled();
  });

  it('confirmar lleva el código, la razón social y la aceptación tal como los pidió el script', async () => {
    (erasure.confirmErasure as jest.Mock).mockResolvedValue({ kind: 'RESET', alreadyDone: false, rows: 321, tables: 2, chartOfAccounts: false });
    const r = await postToAether(
      buildSignedOrder(SECRET, { tipo: orderType('reiniciar', 'confirmar'), clienteId: 'c1', datos: { codigo: 'ABCDE-FGHJK', razonSocial: 'Chakra SpA', aceptoDatosReales: true } })
    );
    expect(r.body.ok).toBe(true);
    expect(erasure.confirmErasure).toHaveBeenCalledWith({ companyId: 'c1', kind: 'RESET', code: 'ABCDE-FGHJK', businessName: 'Chakra SpA', acceptRealData: true });
  });

  it('cancelar llega al servicio', async () => {
    (erasure.cancelErasure as jest.Mock).mockResolvedValue(1);
    const r = await postToAether(buildSignedOrder(SECRET, { tipo: orderType('eliminar', 'cancelar'), clienteId: 'c1' }));
    expect(r.body).toMatchObject({ ok: true, datos: { canceladas: 1 } });
    expect(erasure.cancelErasure).toHaveBeenCalledWith({ companyId: 'c1', kind: 'DELETE' });
  });

  it('las seis órdenes que puede mandar el script existen en Aether', () => {
    const handlers = manejadoresOrdenes as Partial<Record<string, unknown>>;
    for (const action of ['reiniciar', 'eliminar'] as const) {
      for (const step of ['solicitar', 'confirmar', 'cancelar'] as const) {
        expect(handlers[orderType(action, step)]).toEqual(expect.any(Function));
      }
    }
  });
});

describe('argumentos', () => {
  it('reiniciar y eliminar piden empresa', () => {
    expect(parseOrderArgs(['reiniciar', '--empresa', '76.123.456-7'])).toMatchObject({ command: 'reiniciar', action: 'reiniciar', company: '76.123.456-7' });
    expect(parseOrderArgs(['eliminar', '--empresa-id', 'c1'])).toMatchObject({ command: 'eliminar', action: 'eliminar', companyId: 'c1' });
    expect(() => parseOrderArgs(['reiniciar'])).toThrow(/Falta la empresa/);
    expect(() => parseOrderArgs(['reiniciar', '--empresa', 'x', '--empresa-id', 'c1'])).toThrow(/no las dos/);
  });

  it('confirmar y cancelar dicen qué y confirmar exige el código', () => {
    expect(parseOrderArgs(['confirmar', 'eliminar', '--empresa', 'x', '--codigo', 'ABCDE-FGHJK', '--razon-social', 'Chakra SpA', '--acepto-datos-reales'])).toMatchObject({
      command: 'confirmar',
      action: 'eliminar',
      code: 'ABCDE-FGHJK',
      businessName: 'Chakra SpA',
      acceptRealData: true,
    });
    expect(() => parseOrderArgs(['confirmar', '--empresa', 'x', '--codigo', 'A'])).toThrow(/qué/);
    expect(() => parseOrderArgs(['confirmar', 'reiniciar', '--empresa', 'x'])).toThrow(/--codigo/);
    expect(parseOrderArgs(['cancelar', 'reiniciar', '--empresa', 'x'])).toMatchObject({ command: 'cancelar', action: 'reiniciar' });
  });

  it('ping no pide empresa y lo desconocido se rechaza', () => {
    expect(parseOrderArgs(['ping'])).toMatchObject({ command: 'ping' });
    expect(parseOrderArgs(['--ayuda']).help).toBe(true);
    expect(() => parseOrderArgs([])).toThrow(/Falta el comando/);
    expect(() => parseOrderArgs(['borrar', '--empresa', 'x'])).toThrow(/desconocido/);
    expect(() => parseOrderArgs(['reiniciar', '--empresa', 'x', '--forzar'])).toThrow(/Opción desconocida/);
    expect(() => parseOrderArgs(['reiniciar', '--empresa'])).toThrow(/Falta el valor/);
    expect(() => parseOrderArgs(['reiniciar', 'eliminar', '--empresa', 'x'])).toThrow(/Sobra/);
  });

  it('el secreto no se acepta por argumento', () => {
    expect(() => parseOrderArgs(['ping', '--secreto', 'abc'])).toThrow(/Opción desconocida/);
  });
});

describe('dirección de Aether', () => {
  it('exige https, salvo en la propia máquina', () => {
    expect(normalizeBaseUrl('https://aetherp.online/')).toBe('https://aetherp.online');
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(() => normalizeBaseUrl('http://aetherp.online')).toThrow(/https/);
    expect(() => normalizeBaseUrl('aetherp.online')).toThrow(/no es válida/);
    expect(() => normalizeBaseUrl('')).toThrow(/--url/);
    expect(() => normalizeBaseUrl(undefined)).toThrow(/APP_URL/);
  });
});

describe('lectura de la respuesta y mensajes', () => {
  it('ordena las tablas de mayor a menor y tolera datos incompletos', () => {
    const d = readRequestDetails({ solicitudId: 's', codigo: 'C', filas: 5, tablas: { A: 1, B: 3, C: 'x', D: 3 }, advertencias: ['2 CAF', 7] });
    expect(d.tables).toEqual([['B', 3], ['D', 3], ['A', 1]]);
    expect(d.warnings).toEqual(['2 CAF']);
    expect(readRequestDetails(undefined)).toMatchObject({ code: '', rows: 0, tables: [], warnings: [] });
  });

  it('la razón social escrita se compara como lo hace Aether', () => {
    expect(businessNameMatches('Chakra SpA', '  chakra   spa ')).toBe(true);
    expect(businessNameMatches('Chakra SpA', 'Chakra')).toBe(false);
    expect(businessNameMatches('Chakra SpA', null)).toBe(false);
  });

  it('cada fallo HTTP dice qué hacer, y un fallo al confirmar avisa que es seguro repetir', () => {
    expect(describeHttpFailure(401, 'solicitar')).toMatch(/firma.*5 minutos/);
    expect(describeHttpFailure(503, 'ping')).toMatch(/SUPERSUITE_WEBHOOK_SECRET/);
    expect(describeHttpFailure(404, 'ping')).toMatch(/--url/);
    expect(describeHttpFailure(502, 'confirmar')).toMatch(/seguro repetirlo|es seguro/);
    expect(describeHttpFailure(502, 'solicitar')).not.toMatch(/seguro/);
  });

  it('la línea para confirmar después queda lista para copiar', () => {
    const byName = companySelector({ company: 'Chakra "Sur" SpA', companyId: null });
    expect(byName).toBe('--empresa "Chakra \\"Sur\\" SpA"');
    const hint = confirmCommandHint('eliminar', byName, 'ABCDE-FGHJK', true);
    expect(hint).toContain('confirmar eliminar --empresa "Chakra \\"Sur\\" SpA"');
    expect(hint).toContain('--codigo ABCDE-FGHJK');
    expect(hint).toContain('--acepto-datos-reales');
    expect(confirmCommandHint('reiniciar', '--empresa-id c1', 'C', false)).not.toContain('--acepto-datos-reales');
  });

  it('la línea sugerida repite la opción con que se identificó la empresa (si se dio el id, el id)', () => {
    expect(companySelector({ company: null, companyId: 'c1' })).toBe('--empresa-id c1');
    const args = parseOrderArgs(['confirmar', 'reiniciar', ...companySelector({ company: null, companyId: 'c1' }).split(' '), '--codigo', 'C']);
    expect(args).toMatchObject({ companyId: 'c1', company: null });
  });
});
