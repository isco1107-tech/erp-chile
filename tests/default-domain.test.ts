/**
 * Dominio predeterminado de la empresa (`CompanySettings.defaultDomain`): el que ya
 * compró y con el que nacen sus páginas nuevas, cada una en `<dirección>.<dominio>`.
 *
 * Reglas que estos tests protegen:
 *  - la etiqueta del subdominio sale de la dirección y NUNCA es una reservada (correo, DNS…);
 *  - una página que ya tiene dominio (comprado aparte) jamás se pisa, y un subdominio ocupado
 *    por otra página no se le quita a nadie;
 *  - asignar el dominio a una página nueva nunca hace fallar su creación;
 *  - un dominio no puede ser de dos empresas, y todo se limita a la empresa de la sesión;
 *  - guardarlo exige el permiso de configuración de la empresa.
 */

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/auth/guards', () => {
  class AuthError extends Error {}
  return { AuthError, requireAuthWithPermission: jest.fn(), authErrorMessage: (error: unknown) => (error instanceof AuthError ? error.message : null) };
});
jest.mock('@/lib/prisma', () => {
  const pageModel = () => ({ findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() });
  const prisma: Record<string, unknown> = {
    project: pageModel(),
    webSite: pageModel(),
    academySite: pageModel(),
    companySettings: { findFirst: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});
jest.mock('@/lib/hosting/vercel-domains', () => ({
  ...jest.requireActual('@/lib/hosting/vercel-domains'),
  isVercelDomainsConfigured: jest.fn(),
  addProjectDomain: jest.fn(),
  removeProjectDomain: jest.fn(),
}));
jest.mock('@/lib/security/turnstile-hostnames', () => ({ addTurnstileHostname: jest.fn(), removeTurnstileHostname: jest.fn(), turnstileHostnameMode: jest.fn() }));
jest.mock('node:dns/promises', () => ({ resolve4: jest.fn(), resolveCname: jest.fn() }));

import { resolve4, resolveCname } from 'node:dns/promises';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { createAuditLog } from '@/lib/auth/audit';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { addProjectDomain, isVercelDomainsConfigured } from '@/lib/hosting/vercel-domains';
import { addTurnstileHostname } from '@/lib/security/turnstile-hostnames';
import { defaultDomainExample, defaultDomainLabel, defaultSiteDomain, parseDefaultDomain, wildcardRecordName } from '@/lib/hosting/default-domain';
import {
  DefaultDomainError,
  assertDefaultDomainAvailable,
  assignDefaultDomain,
  checkDefaultDomainDns,
  removeDefaultDomain,
  setDefaultDomain,
  wildcardPointsToPlatform,
} from '@/lib/hosting/default-domain.service';
import { checkDefaultDomainAction, removeDefaultDomainAction, setDefaultDomainAction } from '@/lib/actions/default-domain';

const db = prisma as unknown as {
  project: { findUnique: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  webSite: { findUnique: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  academySite: { findUnique: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  companySettings: { findFirst: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
};
const vercelConfigured = isVercelDomainsConfigured as jest.Mock;
const attachToVercel = addProjectDomain as jest.Mock;
const attachToTurnstile = addTurnstileHostname as jest.Mock;
const report = captureException as jest.Mock;
const cname = resolveCname as jest.Mock;
const a = resolve4 as jest.Mock;

const COMPANY = 'empresa-1';

/** Dominio predeterminado de la empresa de la sesión en cada prueba (`null` = no tiene). */
let ownDomain: string | null = 'miempresa.cl';

beforeEach(() => {
  ownDomain = 'miempresa.cl';
  jest.resetAllMocks();
  // Por defecto nada está ocupado, la página aún no tiene dominio y Vercel responde.
  for (const model of [db.project, db.webSite, db.academySite]) {
    model.findUnique.mockResolvedValue(null);
    model.findFirst.mockResolvedValue(null);
    model.updateMany.mockResolvedValue({ count: 1 });
  }
  // Dos consultas distintas usan este mismo método: la fila de la propia empresa (por `companyId`) y la
  // búsqueda del dominio en OTRAS empresas (por `defaultDomain`); esta última no encuentra a nadie.
  db.companySettings.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    'defaultDomain' in where ? null : { id: 's1', defaultDomain: ownDomain }
  );
  db.companySettings.upsert.mockResolvedValue({ id: 's1' });
  db.companySettings.updateMany.mockResolvedValue({ count: 1 });
  vercelConfigured.mockReturnValue(true);
  attachToVercel.mockResolvedValue(undefined);
  attachToTurnstile.mockResolvedValue(undefined);
  cname.mockRejectedValue(new Error('ENODATA'));
  a.mockRejectedValue(new Error('ENODATA'));
});

describe('etiqueta y dominio de una página nueva (puro)', () => {
  it('la etiqueta sale de la dirección, en minúsculas y solo con letras, números y guiones', () => {
    expect(defaultDomainLabel('miss-temuco')).toBe('miss-temuco');
    expect(defaultDomainLabel('Mi_Sitio  Nuevo')).toBe('mi-sitio-nuevo');
    expect(defaultDomainLabel('--tienda--2027--')).toBe('tienda-2027');
  });

  it('una etiqueta no pasa de 63 caracteres ni termina en guion', () => {
    const label = defaultDomainLabel(`${'a'.repeat(62)}-${'b'.repeat(20)}`);
    expect(label).toHaveLength(62);
    expect(label?.endsWith('-')).toBe(false);
  });

  it('los nombres que una empresa usa para correo o DNS nunca se le asignan a una página', () => {
    for (const reserved of ['www', 'mail', 'webmail', 'smtp', 'ftp', 'ns1', 'autodiscover']) {
      expect(defaultDomainLabel(reserved)).toBeNull();
      expect(defaultSiteDomain('miempresa.cl', reserved)).toBeNull();
    }
    expect(defaultDomainLabel('')).toBeNull();
    expect(defaultDomainLabel('!!!')).toBeNull();
  });

  it('el dominio de la página es dirección + dominio de la empresa', () => {
    expect(defaultSiteDomain('miempresa.cl', 'miss-temuco')).toBe('miss-temuco.miempresa.cl');
    expect(defaultSiteDomain('sitios.miempresa.cl', 'tienda')).toBe('tienda.sitios.miempresa.cl');
    expect(defaultDomainExample('miempresa.cl')).toBe('mi-pagina.miempresa.cl');
  });

  it('nunca resulta un host de la plataforma ni un dominio demasiado largo', () => {
    const env = { APP_URL: 'https://app.miempresa.cl' };
    expect(defaultSiteDomain('miempresa.cl', 'app', env)).toBeNull();
    expect(defaultSiteDomain('miempresa.cl', 'otra', env)).toBe('otra.miempresa.cl');
    expect(defaultSiteDomain(`${'x'.repeat(60)}.${'y'.repeat(60)}.${'z'.repeat(60)}.${'w'.repeat(60)}.cl`, 'a'.repeat(50))).toBeNull();
  });

  it('lo que escribe la persona se normaliza o se rechaza con el motivo', () => {
    expect(parseDefaultDomain('https://www.MiEmpresa.CL/')).toEqual({ domain: 'miempresa.cl' });
    expect(parseDefaultDomain('  sitios.miempresa.cl ')).toEqual({ domain: 'sitios.miempresa.cl' });
    expect(parseDefaultDomain('localhost')).toHaveProperty('problem');
    expect(parseDefaultDomain('203.0.113.5')).toHaveProperty('problem');
    expect(parseDefaultDomain('sinterminacion')).toHaveProperty('problem');
    expect(parseDefaultDomain('mi-sitio.vercel.app')).toHaveProperty('problem');
    expect(parseDefaultDomain('aether.test', { APP_URL: 'https://aether.test' })).toHaveProperty('problem');
  });

  it('el comodín del DNS es relativo a lo que el cliente compró', () => {
    expect(wildcardRecordName('miempresa.cl')).toBe('*');
    expect(wildcardRecordName('sitios.miempresa.cl')).toBe('*.sitios');
    expect(wildcardRecordName('a.b.miempresa.cl')).toBe('*.a.b');
  });
});

describe('assignDefaultDomain: la página nueva nace en el dominio de la empresa', () => {
  it('sin dominio predeterminado no escribe nada ni toca Vercel', async () => {
    ownDomain = null;
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).toBeNull();
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
    expect(attachToVercel).not.toHaveBeenCalled();
  });

  it('guarda <dirección>.<dominio> en la página de ESTA empresa y la registra en Vercel', async () => {
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).toBe('mi-sitio.miempresa.cl');
    expect(db.companySettings.findFirst.mock.calls[0]![0].where).toEqual({ companyId: COMPANY });
    expect(db.webSite.updateMany).toHaveBeenCalledWith({
      // `customDomain: null`: el dominio comprado aparte jamás se pisa.
      where: { id: 'w1', companyId: COMPANY, customDomain: null },
      data: { customDomain: 'mi-sitio.miempresa.cl', customDomainVerifiedAt: null },
    });
    // Un subdominio no suma `www.`: se registra una sola vez.
    expect(attachToVercel).toHaveBeenCalledTimes(1);
    expect(attachToVercel).toHaveBeenCalledWith('mi-sitio.miempresa.cl');
  });

  it('un certamen también entra al Turnstile de su formulario de postulación; una academia o un sitio no', async () => {
    expect(await assignDefaultDomain(COMPANY, { kind: 'project', id: 'p1' }, 'miss-temuco')).toBe('miss-temuco.miempresa.cl');
    expect(db.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', companyId: COMPANY, customDomain: null } }));
    expect(attachToTurnstile).toHaveBeenCalledWith('miss-temuco.miempresa.cl');

    attachToTurnstile.mockClear();
    expect(await assignDefaultDomain(COMPANY, { kind: 'academySite', id: 'a1' }, 'mi-academia')).toBe('mi-academia.miempresa.cl');
    expect(db.academySite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a1', companyId: COMPANY, customDomain: null } }));
    expect(attachToTurnstile).not.toHaveBeenCalled();
  });

  it('una página que ya tiene su propio dominio lo conserva: no se escribe ni se registra nada', async () => {
    db.webSite.updateMany.mockResolvedValue({ count: 0 });
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).toBeNull();
    expect(attachToVercel).not.toHaveBeenCalled();
  });

  it('si otra página ya usa ese subdominio no se le quita: la nueva queda en la dirección de la plataforma', async () => {
    db.webSite.findUnique.mockResolvedValue({ id: 'otra-pagina' });
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).toBeNull();
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
    expect(attachToVercel).not.toHaveBeenCalled();
  });

  it('una dirección reservada (mail, www…) no recibe dominio', async () => {
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mail')).toBeNull();
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('sin dirección no hace nada', async () => {
    expect(await assignDefaultDomain(COMPANY, { kind: 'project', id: 'p1' }, null)).toBeNull();
    expect(db.companySettings.findFirst).not.toHaveBeenCalled();
  });

  it('si Vercel falla el dominio queda guardado y se informa, sin romper la creación', async () => {
    attachToVercel.mockRejectedValue(new Error('Vercel caído'));
    expect(await assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).toBe('mi-sitio.miempresa.cl');
    expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ module: 'dominios', companyId: COMPANY }));
  });

  it('nunca lanza: un error de la base se informa y la página sigue sin dominio', async () => {
    db.companySettings.findFirst.mockRejectedValue(new Error('base caída'));
    await expect(assignDefaultDomain(COMPANY, { kind: 'webSite', id: 'w1' }, 'mi-sitio')).resolves.toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe('dominio predeterminado de la empresa: guardar y quitar', () => {
  it('guarda el dominio normalizado en la configuración de ESTA empresa', async () => {
    const view = await setDefaultDomain(COMPANY, 'https://www.MiEmpresa.CL/');
    expect(db.companySettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY }, update: { defaultDomain: 'miempresa.cl' }, create: { companyId: COMPANY, defaultDomain: 'miempresa.cl' } })
    );
    expect(view).toMatchObject({ domain: 'miempresa.cl', example: 'mi-pagina.miempresa.cl', automatic: true });
    // Un solo registro de comodín: toda página nueva queda apuntando a la plataforma.
    expect(view.record).toEqual({ type: 'CNAME', name: '*', value: 'cname.vercel-dns.com' });
  });

  it('rechaza lo que no es un dominio público, sin guardar nada', async () => {
    await expect(setDefaultDomain(COMPANY, 'localhost')).rejects.toBeInstanceOf(DefaultDomainError);
    await expect(setDefaultDomain(COMPANY, '')).rejects.toBeInstanceOf(DefaultDomainError);
    expect(db.companySettings.upsert).not.toHaveBeenCalled();
  });

  it('no deja tomar el dominio de otra empresa: ni el predeterminado ni el de sus páginas ni un subdominio suyo', async () => {
    await assertDefaultDomainAvailable('miempresa.cl', COMPANY);
    // Solo mira a las OTRAS empresas: el dominio propio nunca choca consigo mismo.
    expect(db.companySettings.findFirst).toHaveBeenLastCalledWith({ where: { defaultDomain: 'miempresa.cl', companyId: { not: COMPANY } }, select: { id: true } });
    expect(db.webSite.findFirst).toHaveBeenLastCalledWith({
      where: { OR: [{ customDomain: 'miempresa.cl' }, { customDomain: { endsWith: '.miempresa.cl' } }], companyId: { not: COMPANY } },
      select: { id: true },
    });

    for (const model of [db.companySettings, db.project, db.webSite, db.academySite]) {
      const normal = model.findFirst.getMockImplementation();
      model.findFirst.mockResolvedValue({ id: 'ajeno' });
      await expect(assertDefaultDomainAvailable('miempresa.cl', COMPANY)).rejects.toThrow('otra empresa');
      if (normal) model.findFirst.mockImplementation(normal);
      else model.findFirst.mockResolvedValue(null);
    }
    expect(db.companySettings.upsert).not.toHaveBeenCalled();
  });

  it('al crear la empresa (aún sin id) se revisa contra todas', async () => {
    await assertDefaultDomainAvailable('miempresa.cl', null);
    expect(db.companySettings.findFirst).toHaveBeenLastCalledWith({ where: { defaultDomain: 'miempresa.cl' }, select: { id: true } });
  });

  it('si dos empresas lo piden a la vez, el índice único de la base lo traduce a un mensaje claro', async () => {
    db.companySettings.upsert.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: '7' }));
    await expect(setDefaultDomain(COMPANY, 'miempresa.cl')).rejects.toThrow('otra empresa');
  });

  it('quitarlo solo afecta a la empresa de la sesión', async () => {
    const view = await removeDefaultDomain(COMPANY);
    expect(db.companySettings.updateMany).toHaveBeenCalledWith({ where: { companyId: COMPANY }, data: { defaultDomain: null } });
    expect(view).toMatchObject({ domain: null, record: null, example: null });
  });
});

describe('revisión del DNS de comodín', () => {
  it('se consulta una etiqueta que no es de ninguna página', async () => {
    cname.mockResolvedValue(['cname.vercel-dns.com']);
    expect(await wildcardPointsToPlatform('miempresa.cl')).toBe(true);
    expect(cname).toHaveBeenCalledWith('aether-dns-check.miempresa.cl');
  });

  it('acepta también un registro A con una dirección de Vercel', async () => {
    a.mockResolvedValue(['76.76.21.21']);
    expect(await wildcardPointsToPlatform('miempresa.cl')).toBe(true);
  });

  it('un comodín que apunta a otro lado, o que no existe, no cuenta', async () => {
    cname.mockResolvedValue(['hosting.otro-proveedor.com']);
    a.mockResolvedValue(['203.0.113.9']);
    expect(await wildcardPointsToPlatform('miempresa.cl')).toBe(false);
    cname.mockRejectedValue(new Error('ENOTFOUND'));
    a.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await wildcardPointsToPlatform('miempresa.cl')).toBe(false);
  });

  it('sin dominio predeterminado no hay nada que revisar', async () => {
    ownDomain = null;
    await expect(checkDefaultDomainDns(COMPANY)).rejects.toThrow('no tiene un dominio predeterminado');
  });
});

describe('acciones: solo quien administra la empresa', () => {
  const session = { companyId: COMPANY, id: 'u1', email: 'dueno@miempresa.cl' };

  it('exigen el permiso de configuración de la empresa y no tocan nada sin él', async () => {
    (requireAuthWithPermission as jest.Mock).mockRejectedValue(new AuthError('No tienes permiso', 403));
    expect(await setDefaultDomainAction('miempresa.cl')).toEqual({ success: false, error: 'No tienes permiso' });
    expect(await removeDefaultDomainAction()).toEqual({ success: false, error: 'No tienes permiso' });
    expect(await checkDefaultDomainAction()).toEqual({ success: false, error: 'No tienes permiso' });
    expect(requireAuthWithPermission).toHaveBeenCalledWith('settings:company');
    expect(db.companySettings.upsert).not.toHaveBeenCalled();
    expect(db.companySettings.updateMany).not.toHaveBeenCalled();
  });

  it('guardar deja constancia en la bitácora de la empresa', async () => {
    (requireAuthWithPermission as jest.Mock).mockResolvedValue(session);
    const result = await setDefaultDomainAction('MiEmpresa.cl');
    expect(result).toMatchObject({ success: true, data: { domain: 'miempresa.cl' } });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, userId: 'u1', entity: 'CompanySettings', action: 'UPDATE', metadata: { changes: { defaultDomain: 'miempresa.cl' } } })
    );
  });

  it('un dominio inválido vuelve como mensaje en español, sin detalle técnico', async () => {
    (requireAuthWithPermission as jest.Mock).mockResolvedValue(session);
    expect(await setDefaultDomainAction('203.0.113.5')).toEqual({ success: false, error: 'Usa un nombre de dominio, no una dirección IP' });
    expect(await setDefaultDomainAction(42)).toMatchObject({ success: false });
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('un error inesperado se informa a observabilidad y la persona recibe un mensaje accionable', async () => {
    (requireAuthWithPermission as jest.Mock).mockResolvedValue(session);
    db.companySettings.upsert.mockRejectedValue(new Error('conexión rota'));
    expect(await setDefaultDomainAction('miempresa.cl')).toEqual({ success: false, error: 'No se pudo guardar el dominio predeterminado' });
    expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ module: 'dominios', companyId: COMPANY }));
  });
});
