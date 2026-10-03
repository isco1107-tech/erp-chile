/**
 * Telemetría hacia la Supersuite (src/lib/supersuite): lo importante es que
 * (1) sin configuración no haga nada, (2) nunca lance ni frene la operación de
 * negocio, (3) no saque datos personales, y (4) use los mismos nombres de
 * módulo que el conector de la Supersuite.
 */
jest.mock('next/server', () => ({ after: jest.fn((tarea: () => unknown) => { void tarea(); }) }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { company: { findFirst: jest.fn() } } }));

import { accionDeAuditoria, alertaDeFolios, empresaActiva, moduloDeEntidad, modulosContratados } from '@/lib/supersuite/modulos';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

type Supersuite = typeof import('@/lib/supersuite');
interface Carga { s: Supersuite; captureException: jest.Mock; findFirst: jest.Mock }

/**
 * Carga el módulo desde cero con las variables indicadas (el cliente se crea una
 * sola vez por carga). Los mocks se toman del mismo registro aislado, porque
 * `isolateModules` crea instancias nuevas de cada mock.
 */
function cargar(env: Record<string, string>): Carga {
  delete process.env.SUPERSUITE_URL;
  delete process.env.SUPERSUITE_KEY;
  Object.assign(process.env, env);
  let carga: Carga | undefined;
  jest.isolateModules(() => {
    carga = {
      s: jest.requireActual<Supersuite>('@/lib/supersuite'),
      captureException: jest.requireMock<{ captureException: jest.Mock }>('@/lib/observability').captureException,
      findFirst: jest.requireMock<{ prisma: { company: { findFirst: jest.Mock } } }>('@/lib/prisma').prisma.company.findFirst,
    };
  });
  return carga!;
}
const esperarEnvios = () => new Promise((r) => setTimeout(r, 20));
const cuerposEnviados = () => fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => ({ url, cuerpo: JSON.parse(String(init.body)) }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
});

describe('equivalencias con la Supersuite', () => {
  it('las entidades de negocio caen en su módulo y las de configuración no cuentan', () => {
    expect(moduloDeEntidad('SalesDocument')).toBe('ventas');
    expect(moduloDeEntidad('CashShift')).toBe('pos');
    expect(moduloDeEntidad('Candidate')).toBe('candidatas');
    expect(moduloDeEntidad('User')).toBeNull();
    expect(moduloDeEntidad('WorkflowRule')).toBeNull();
  });

  it('la acción se arma solo con entidad y tipo, sin datos del registro', () => {
    expect(accionDeAuditoria('SalesDocument', 'ISSUE_DTE')).toBe('sales_document_issue_dte');
    expect(accionDeAuditoria('PayrollPeriod', 'UPDATE')).toBe('payroll_period_update');
  });

  it('los módulos contratados salen de los flags, sin repetir', () => {
    expect(modulosContratados({ hasInventory: true, hasPos: true, hasPmpCosting: true, hasDteBilling: false })).toEqual(['pos', 'inventario']);
    expect(modulosContratados(null)).toEqual([]);
  });

  it('solo ACTIVE y TRIAL cuentan como empresa activa', () => {
    expect(empresaActiva('ACTIVE')).toBe(true);
    expect(empresaActiva('TRIAL')).toBe(true);
    expect(empresaActiva('SUSPENDED')).toBe(false);
  });

  it('sin folios la alerta es crítica; con pocos, alta; la clave es estable por tipo', () => {
    expect(alertaDeFolios('BOLETA_39', 0).severidad).toBe('critica');
    expect(alertaDeFolios('BOLETA_39', 12)).toMatchObject({ severidad: 'alta', clave: 'folios:BOLETA_39' });
    expect(alertaDeFolios('BOLETA_39', 12).mensaje).toContain('Boleta Electrónica');
  });
});

describe('sin configuración', () => {
  it('no envía nada ni consulta la base', async () => {
    const { s, findFirst } = cargar({});
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'SalesDocument', action: 'CREATE' });
    s.latidoCajaSupersuite('c1', { id: 'r1', name: 'Caja 1' });
    s.presenciaUsuarioSupersuite('c1', 'u1');
    await s.sincronizarEmpresaSupersuite('c1');
    await esperarEnvios();
    expect(s.supersuiteHabilitada()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('con configuración', () => {
  const env = { SUPERSUITE_URL: 'https://ss.test', SUPERSUITE_KEY: 'ss_aether_x' };

  it('una acción auditada se envía como evento de su módulo, con la API key', async () => {
    const { s } = cargar(env);
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'SalesDocument', action: 'ISSUE_DTE' });
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'User', action: 'CREATE' });
    await esperarEnvios();
    const [envio] = cuerposEnviados();
    expect(envio.url).toBe('https://ss.test/ingesta/eventos');
    expect(envio.cuerpo).toEqual([expect.objectContaining({ clienteId: 'c1', modulo: 'ventas', accion: 'sales_document_issue_dte' })]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'ss_aether_x' });
  });

  it('un cambio de la empresa manda su ficha con los módulos contratados', async () => {
    const { s, findFirst } = cargar(env);
    findFirst.mockResolvedValue({
      businessName: 'Ferretería Sur', rut: '76.111.111-1', ciudad: 'Temuco', comuna: null, planName: 'Profesional',
      status: 'SUSPENDED', createdAt: new Date('2025-01-10'), features: { hasPos: true, hasInventory: true },
    });
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'CompanyFeatures', action: 'UPDATE' });
    await esperarEnvios();
    const [envio] = cuerposEnviados();
    expect(envio.url).toBe('https://ss.test/ingesta/clientes');
    expect(envio.cuerpo[0]).toMatchObject({ clienteId: 'c1', nombre: 'Ferretería Sur', ciudad: 'Temuco', plan: 'Profesional', activo: false, modulos: ['pos', 'inventario'] });
  });

  it('la presencia manda solo el id de la empresa y el del usuario', async () => {
    const { s } = cargar(env);
    s.presenciaUsuarioSupersuite('c1', 'u1');
    await esperarEnvios();
    const [envio] = cuerposEnviados();
    expect(envio.url).toBe('https://ss.test/ingesta/presencia');
    expect(envio.cuerpo).toEqual([{ clienteId: 'c1', usuarioId: 'u1', fecha: expect.any(String) }]);
  });

  it('cerrar turno deja la caja apagada', async () => {
    const { s } = cargar(env);
    s.latidoCajaSupersuite('c1', { id: 'r1', name: 'Caja 1' }, true);
    await esperarEnvios();
    expect(cuerposEnviados()[0].cuerpo[0]).toMatchObject({ clienteId: 'c1', dispositivoId: 'caja-r1', tipo: 'pos', apagado: true });
  });

  it('folios: alerta los bajos y cierra el resto de los tipos', async () => {
    const { s } = cargar(env);
    await s.avisarFoliosSupersuite('c1', [{ dteType: 'BOLETA_39', remaining: 5 }]);
    const alertas = cuerposEnviados().find((e) => e.url.endsWith('/ingesta/alertas'))!.cuerpo as Record<string, unknown>[];
    expect(alertas[0]).toMatchObject({ severidad: 'alta', clave: 'folios:BOLETA_39', clienteId: 'c1' });
    expect(alertas.some((a) => a.resuelta === true && a.clave === 'folios:FACTURA_33')).toBe(true);
    expect(alertas.some((a) => a.resuelta === true && a.clave === 'folios:BOLETA_39')).toBe(false);
    expect(alertas.some((a) => a.clave === 'folios:COTIZACION')).toBe(false);
  });

  it('si la Supersuite está caída, nada lanza y el error va a observabilidad', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { s, captureException } = cargar(env);
    expect(() => s.registrarUsoSupersuite({ companyId: 'c1', entity: 'SalesDocument', action: 'CREATE' })).not.toThrow();
    await expect(s.avisarFoliosSupersuite('c1', [])).resolves.toBeUndefined();
    await esperarEnvios();
    expect(captureException).toHaveBeenCalled();
  });
});
