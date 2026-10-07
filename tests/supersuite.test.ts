/**
 * Telemetría hacia la Supersuite (src/lib/supersuite): lo importante es que
 * (1) sin configuración no haga nada, (2) nunca lance ni frene la operación de
 * negocio, (3) no saque datos personales, y (4) use los mismos nombres de
 * módulo que el conector de la Supersuite.
 */
jest.mock('next/server', () => ({ after: jest.fn((tarea: () => unknown) => { void tarea(); }) }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { company: { findFirst: jest.fn() } } }));

import { accionDeAuditoria, alertaDeFolios, alertaDeSolicitud, empresaActiva, fichaComercial, moduloDeEntidad, modulosContratados } from '@/lib/supersuite/modulos';
import { PLAN_PRESETS } from '@/lib/pricing/presets';

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

  it('solo CANCELLED es baja: una empresa suspendida sigue siendo cliente', () => {
    expect(empresaActiva('ACTIVE')).toBe(true);
    expect(empresaActiva('TRIAL')).toBe(true);
    expect(empresaActiva('SUSPENDED')).toBe(true);
    expect(empresaActiva('CANCELLED')).toBe(false);
  });

  it('sin folios la alerta es crítica; con pocos, alta; la clave es estable por tipo', () => {
    expect(alertaDeFolios('BOLETA_39', 0).severidad).toBe('critica');
    expect(alertaDeFolios('BOLETA_39', 12)).toMatchObject({ severidad: 'alta', clave: 'folios:BOLETA_39' });
    expect(alertaDeFolios('BOLETA_39', 12).mensaje).toContain('Boleta Electrónica');
  });
});

describe('lo que la empresa le paga a Aether', () => {
  const sinExtras = (plan: string) => fichaComercial({ planName: plan, features: PLAN_PRESETS[plan]!.features, maxUsers: PLAN_PRESETS[plan]!.maxUsers, maxWarehouses: 1 });

  it('un plan sin cambios cuesta exactamente su precio y no tiene extras ni usuarios adicionales', () => {
    const ficha = sinExtras('Gestión');
    expect(ficha.tarifaMensual).toBe(84990);
    expect(ficha.metadata).toMatchObject({ planVigente: true, modulosExtra: [], usuariosAdicionales: 0 });
  });

  it('el tope de usuarios heredado no infla la tarifa: va aparte', () => {
    const ficha = fichaComercial({ planName: 'Personalizado', features: PLAN_PRESETS.Base!.features, maxUsers: 50, maxWarehouses: 1 });
    expect(ficha.tarifaMensual).toBe(14990);
    expect(ficha.metadata).toMatchObject({ usuariosAdicionales: 48, tarifaUsuariosAdicionales: 48 * 2990 });
  });

  it('la ficha lista todo lo contratado según el tarifario, incluso lo que la Supersuite aún no mide', () => {
    const ficha = fichaComercial({ planName: 'Personalizado', features: { ...PLAN_PRESETS.Base!.features, hasOrgChart: true }, maxUsers: 2, maxWarehouses: 1 });
    expect(ficha.metadata.modulosAether).toEqual(['org-chart']);
  });

  it('la alerta de solicitud no se pasa de 500 caracteres ni lleva datos personales', () => {
    const alerta = alertaDeSolicitud({ planLabel: null, modulos: Array.from({ length: 40 }, (_, i) => `Módulo número ${i}`), net: 1, total: 1 });
    expect(alerta.mensaje.length).toBeLessThanOrEqual(500);
    expect(alerta.severidad).toBe('media');
  });
});

describe('sin configuración', () => {
  it('no envía nada ni consulta la base', async () => {
    const { s, findFirst } = cargar({});
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'SalesDocument', action: 'CREATE' });
    s.latidoCajaSupersuite('c1', { id: 'r1', name: 'Caja 1' });
    s.presenciaSupersuite('c1', 'u1');
    await s.sincronizarEmpresaSupersuite('c1');
    await esperarEnvios();
    expect(s.supersuiteHabilitada()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('con configuración', () => {
  const env = { SUPERSUITE_URL: 'https://ss.test', SUPERSUITE_KEY: 'ss_aether_x' };

  it('toda acción auditada se envía: la de un módulo como su uso y el resto como plataforma, con la API key', async () => {
    const { s } = cargar(env);
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'SalesDocument', action: 'ISSUE_DTE', userId: 'u7' });
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'User', action: 'CREATE' });
    await esperarEnvios();
    const envios = cuerposEnviados().filter((e) => e.url === 'https://ss.test/ingesta/eventos');
    const eventos = envios.flatMap((e) => e.cuerpo);
    expect(eventos).toEqual([
      expect.objectContaining({ clienteId: 'c1', modulo: 'ventas', accion: 'sales_document_issue_dte', usuarioId: 'u7', datos: { entidad: 'SalesDocument', operacion: 'ISSUE_DTE' } }),
      expect.objectContaining({ clienteId: 'c1', modulo: 'plataforma', accion: 'user_create', datos: { entidad: 'User', operacion: 'CREATE' } }),
    ]);
    // Solo la entidad y la operación: nunca el registro ni quién (más allá del id opaco).
    for (const evento of eventos) expect(Object.keys(evento.datos).sort()).toEqual(['entidad', 'operacion']);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'ss_aether_x' });
  });

  it('la presencia sale solo con el id de empresa y el id opaco del usuario', async () => {
    const { s } = cargar(env);
    s.presenciaSupersuite('c1', 'u1');
    await esperarEnvios();
    const [envio] = cuerposEnviados();
    expect(envio.url).toBe('https://ss.test/ingesta/presencia');
    expect(envio.cuerpo).toEqual([{ clienteId: 'c1', usuarioId: 'u1', fecha: expect.any(String) }]);
  });

  it('un cambio de la empresa manda su ficha con los módulos contratados', async () => {
    const { s, findFirst } = cargar(env);
    findFirst.mockResolvedValue({
      businessName: 'Ferretería Sur', rut: '76.111.111-1', ciudad: 'Temuco', comuna: null, planName: 'Profesional',
      status: 'SUSPENDED', createdAt: new Date('2025-01-10'), maxUsers: 10, maxWarehouses: 3, features: { hasPos: true, hasInventory: true },
    });
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'CompanyFeatures', action: 'UPDATE' });
    await esperarEnvios();
    const envio = cuerposEnviados().find((e) => e.url === 'https://ss.test/ingesta/clientes')!;
    expect(envio).toBeDefined();
    // El cambio también queda en la actividad, como plataforma.
    expect(cuerposEnviados().find((e) => e.url === 'https://ss.test/ingesta/eventos')?.cuerpo[0]).toMatchObject({ modulo: 'plataforma', accion: 'company_features_update' });
    expect(envio.cuerpo[0]).toMatchObject({ clienteId: 'c1', nombre: 'Ferretería Sur', ciudad: 'Temuco', plan: 'Profesional', activo: true, suspendida: true, modulos: ['pos', 'inventario'] });
    // Un plan anterior no tiene tarifa de lista: no se inventa una.
    expect(envio.cuerpo[0]).not.toHaveProperty('tarifaMensual');
    expect(envio.cuerpo[0].metadata).toMatchObject({ planVigente: false, usuariosMax: 10, bodegasMax: 3 });
  });

  it('la ficha lleva lo que la empresa le paga a Aether: tarifa, extras y usuarios adicionales', async () => {
    const { s, findFirst } = cargar(env);
    findFirst.mockResolvedValue({
      businessName: 'Ferretería Sur', rut: '76.111.111-1', ciudad: null, comuna: null, planName: 'Comercio',
      status: 'ACTIVE', createdAt: new Date('2025-01-10'), maxUsers: 5, maxWarehouses: 1,
      features: { ...PLAN_PRESETS.Comercio!.features, hasAccounting: true },
    });
    s.registrarUsoSupersuite({ companyId: 'c1', entity: 'CompanyFeatures', action: 'UPDATE' });
    await esperarEnvios();
    const envio = cuerposEnviados().find((e) => e.url === 'https://ss.test/ingesta/clientes')!;
    expect(envio.cuerpo[0]).toMatchObject({ plan: 'Comercio', tarifaMensual: 32990 + 17990 });
    expect(envio.cuerpo[0].metadata).toMatchObject({
      planVigente: true, tarifaIncluyeIva: false, modulosExtra: ['accounting'], usuariosAdicionales: 2, tarifaUsuariosAdicionales: 5980,
    });
  });

  it('una solicitud de módulos llega como alerta, cerrando antes la anterior, sin datos de la persona', async () => {
    const { s } = cargar(env);
    s.solicitudModulosSupersuite('c1', { planLabel: 'Gestión', modulos: ['Remuneraciones'], net: 97980, total: 116596 });
    await esperarEnvios();
    const alertas = cuerposEnviados().find((e) => e.url.endsWith('/ingesta/alertas'))!.cuerpo as Record<string, unknown>[];
    expect(alertas[0]).toMatchObject({ clave: 'solicitud-modulos', resuelta: true, clienteId: 'c1' });
    expect(alertas[1]).toMatchObject({ severidad: 'media', clave: 'solicitud-modulos', clienteId: 'c1' });
    expect(String(alertas[1]!.mensaje)).toContain('plan Gestión + Remuneraciones');
    expect(String(alertas[1]!.mensaje)).toContain('$97.980 + IVA');
  });

  it('atender la solicitud (cambio de plan o módulos) cierra su alerta', async () => {
    const { s } = cargar(env);
    s.solicitudModulosAtendidaSupersuite('c1');
    await esperarEnvios();
    const alertas = cuerposEnviados().find((e) => e.url.endsWith('/ingesta/alertas'))!.cuerpo as Record<string, unknown>[];
    expect(alertas).toEqual([{ clave: 'solicitud-modulos', resuelta: true, clienteId: 'c1' }]);
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
