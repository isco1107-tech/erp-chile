/**
 * Sitios web: servicio (web-sites.service.ts), dominio propio
 * (web-site-domain.service.ts), acciones (guards por permiso) y matriz de
 * permisos del módulo.
 *
 * Reglas que estos tests protegen:
 *  - multi-tenant: toda consulta lleva `companyId`; una empresa nunca lee ni
 *    modifica registros de otra aunque pase un ID ajeno;
 *  - lo que ve el público es la copia PUBLICADA, nunca el borrador, y solo si
 *    el sitio está publicado, la empresa operativa y el módulo contratado;
 *  - publicar exige la lista "qué falta" y sanea el HTML propio;
 *  - un dominio es de un solo destino (sitio o certamen) en toda la plataforma;
 *  - solo dueño/administrador publican; el equipo comercial arma y edita.
 *
 * Prisma: se espía el cliente real (DATABASE_URL falsa); cualquier consulta sin
 * simular lanza "Consulta no prevista" para que nada llegue a una base real.
 */

jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
// Solo se simula el chequeo de host; `blobPathnameStartsWith` (prefijo de empresa) es el real.
jest.mock('@/lib/security/blob-url', () => ({ ...jest.requireActual('@/lib/security/blob-url'), isAllowedBlobUrl: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/hosting/vercel-domains', () => ({
  ...jest.requireActual('@/lib/hosting/vercel-domains'),
  isVercelDomainsConfigured: jest.fn(),
  addProjectDomain: jest.fn(),
  removeProjectDomain: jest.fn(),
  getDomainStatus: jest.fn(),
}));
jest.mock('node:dns/promises', () => ({ resolve4: jest.fn(), resolveCname: jest.fn() }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ del: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/guards', () => {
  const actual = jest.requireActual('@/lib/auth/guards');
  return { ...actual, requireAuthWithPermission: jest.fn() };
});

import { resolve4, resolveCname } from 'node:dns/promises';
import { Prisma, type Role } from '@prisma/client';
import { resolvePermissions, sanitizePermissions } from '@/lib/auth/effective-permissions';
import { createAuditLog } from '@/lib/auth/audit';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import {
  DEFAULT_FEATURES,
  availablePermissionGroups,
  blockedModuleForRoute,
  moduleForPermission,
  type CompanyFeatureFlags,
} from '@/lib/auth/modules';
import { ALL_PERMISSIONS, checkPermission, permissionsForRole, rolesWithPermission, type Permission } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { del } from '@/lib/storage/blob';
import { isVercelDomainsConfigured } from '@/lib/hosting/vercel-domains';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { createBlock, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { MAX_HTML_BYTES } from '@/lib/web-sites/html';
import { homeOf, parseSiteDocument, type SiteDocument } from '@/lib/web-sites/site';
import { starterBlocks } from '@/lib/web-sites/templates';
import { parseTheme } from '@/lib/web-sites/theme';
import { siteSlugProblem } from '@/lib/web-sites/urls';
import * as actions from '@/modules/web-sites/actions/web-sites.actions';
import { WebSiteDomainError, setWebSiteDomain, refreshWebSiteDomain } from '@/modules/web-sites/services/web-site-domain.service';
import * as service from '@/modules/web-sites/services/web-sites.service';
import {
  MAX_ASSETS_PER_SITE,
  MAX_COMPANY_ASSET_BYTES,
  MAX_SITES_PER_COMPANY,
  WebSiteError,
  archiveWebSite,
  assertCanAddAsset,
  createWebSite,
  deleteAsset,
  deleteWebSite,
  deleteWebSiteMessage,
  duplicateWebSite,
  getPublicWebSite,
  getPublicWebSiteByDomain,
  getWebSite,
  listWebSiteMessages,
  listWebSites,
  publishWebSite,
  saveWebSiteContent,
  setMessageRead,
  unpublishWebSite,
  updateAssetAlt,
  updateWebSiteSettings,
} from '@/modules/web-sites/services/web-sites.service';

// ---------------------------------------------------------------------------
// Utilidades de prueba
// ---------------------------------------------------------------------------

type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: unknown[]) => unknown>;
type Row = Record<string, unknown>;

const MODEL_METHODS = {
  webSite: ['findFirst', 'findUnique', 'findMany', 'create', 'updateMany', 'deleteMany', 'count', 'groupBy'],
  webSiteAsset: ['findFirst', 'findMany', 'create', 'count', 'aggregate', 'updateMany', 'deleteMany'],
  webSiteMessage: ['findMany', 'create', 'count', 'updateMany', 'deleteMany', 'groupBy'],
  contact: ['findFirst'],
  project: ['findFirst'],
  company: ['findFirst'],
} as const;

interface Db {
  webSite: Mocks;
  webSiteAsset: Mocks;
  webSiteMessage: Mocks;
  contact: Mocks;
  project: Mocks;
  company: Mocks;
}

function delegateOf(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[model]!;
}

/** Espía cada método usado; lo que no se simule explícitamente lanza. */
function installDb(): Db {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODEL_METHODS)) {
    db[model] = {};
    for (const method of methods) {
      db[model]![method] = jest.spyOn(delegateOf(model), method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as unknown as Db;
}

function argsOf(mock: jest.Mock, call = 0): { where: Row; data: Row; select?: Row } {
  return mock.mock.calls[call]![0] as { where: Row; data: Row; select?: Row };
}

const COMPANY = 'company-a';
const OTHER_COMPANY = 'company-b';
const SITE = 'site-1';
const ASSET_URL = 'https://blob.test/web-sites/company-a/site-1/logo.png';

let db: Db;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
  db = installDb();
  jest.mocked(isAllowedBlobUrl).mockImplementation((url: string) => url.startsWith('https://blob.test/'));
  jest.mocked(isVercelDomainsConfigured).mockReturnValue(false);
});

afterAll(() => jest.restoreAllMocks());

const publishableBlocks = (): WebSiteBlock[] => [
  { ...createBlock('hero'), title: 'Paneles solares para tu casa' } as WebSiteBlock,
  { ...createBlock('contact'), heading: 'Contacto', email: 'hola@solar.cl', showForm: false } as WebSiteBlock,
];

/** Fila completa tal como la devuelve `getWebSite` (findFirst con include). */
function siteRow(over: Row = {}): Row {
  return {
    id: SITE,
    companyId: COMPANY,
    name: 'Solar Sur',
    slug: 'solar-sur',
    kind: 'LANDING',
    mode: 'GUIDED',
    status: 'DRAFT',
    contactId: null,
    contact: null,
    seoTitle: 'Solar Sur: paneles para tu hogar',
    seoDescription: null,
    indexable: true,
    logoUrl: null,
    ogImageUrl: null,
    theme: {},
    draftBlocks: publishableBlocks(),
    publishedBlocks: null,
    publishedTheme: null,
    draftHtml: null,
    publishedHtml: null,
    publishedAt: null,
    customDomain: null,
    customDomainVerifiedAt: null,
    createdByName: 'Ana',
    company: { businessName: 'Solar SpA', logoUrl: null },
    assets: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    // `updatedAt` cambia con cualquier escritura; `contentUpdatedAt` solo al guardar contenido.
    updatedAt: new Date('2026-09-02T10:00:00.123Z'),
    contentUpdatedAt: new Date('2020-01-01T00:00:00.123Z'),
    ...over,
  };
}

/** Fila con la forma de PUBLIC_SELECT. */
function publicRow(over: Row = {}): Row {
  return {
    id: SITE,
    companyId: COMPANY,
    name: 'Solar Sur',
    slug: 'solar-sur',
    mode: 'GUIDED',
    status: 'PUBLISHED',
    seoTitle: null,
    seoDescription: null,
    indexable: true,
    logoUrl: null,
    ogImageUrl: null,
    publishedBlocks: publishableBlocks(),
    publishedTheme: {},
    publishedHtml: null,
    publishedAt: new Date('2026-09-03T12:00:00.000Z'),
    customDomain: null,
    customDomainVerifiedAt: null,
    company: { businessName: 'Solar SpA', status: 'ACTIVE', features: { hasWebSites: true } },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// saveWebSiteContent
// ---------------------------------------------------------------------------

describe('saveWebSiteContent: guardar el borrador', () => {
  function guidedSite(over: Row = {}) {
    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT', ...over });
  }

  it('rechaza una imagen que no viene del almacenamiento propio y no escribe nada', async () => {
    guidedSite();
    const hero = { ...createBlock('hero'), imageUrl: 'https://tracker.evil.cl/pixel.png' } as WebSiteBlock;

    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [hero] })).rejects.toBeInstanceOf(WebSiteError);

    expect(isAllowedBlobUrl).toHaveBeenCalledWith('https://tracker.evil.cl/pixel.png');
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('valida también las imágenes de galerías y tarjetas: una sola ajena basta para rechazar', async () => {
    guidedSite();
    const gallery = {
      ...createBlock('gallery'),
      images: [
        { url: 'https://blob.test/web-sites/company-a/site-1/a.png', alt: 'a' },
        { url: 'http://hotlink.evil.cl/b.png', alt: 'b' },
      ],
    } as WebSiteBlock;
    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [gallery] })).rejects.toThrow(/biblioteca del sitio/);

    guidedSite();
    const features = {
      ...createBlock('features'),
      items: [{ title: 'Uno', text: 'x', imageUrl: 'https://cdn.evil.cl/c.png' }],
    } as WebSiteBlock;
    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [features] })).rejects.toBeInstanceOf(WebSiteError);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('acepta las imágenes de la biblioteca y guarda solo el borrador (nunca lo publicado)', async () => {
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const hero = { ...createBlock('hero'), title: 'Hola', imageUrl: ASSET_URL } as WebSiteBlock;

    await saveWebSiteContent(COMPANY, SITE, { blocks: [hero], theme: parseTheme({ primary: '#123456' }) });

    const { data } = argsOf(db.webSite.updateMany);
    // Solo campos de borrador, más la nueva versión del contenido.
    expect(Object.keys(data).sort()).toEqual(['contentUpdatedAt', 'draftBlocks', 'theme']);
    expect(data).not.toHaveProperty('publishedBlocks');
    expect(data).not.toHaveProperty('publishedTheme');
    expect(data).not.toHaveProperty('publishedHtml');
    expect(data).not.toHaveProperty('status');
  });

  it('detecta la edición simultánea con contentUpdatedAt (no con updatedAt) y siempre acota por empresa', async () => {
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    await saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}), expectedUpdatedAt: '2026-09-02T10:00:00.123Z' });
    const { where } = argsOf(db.webSite.updateMany);
    expect(where).toEqual({ id: SITE, companyId: COMPANY, contentUpdatedAt: new Date('2026-09-02T10:00:00.123Z') });
    // `updatedAt` cambia al publicar, tocar ajustes o recibir un mensaje: usarlo daría falsos conflictos.
    expect(where).not.toHaveProperty('updatedAt');

    guidedSite();
    await saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}) });
    expect(argsOf(db.webSite.updateMany, 1).where).toEqual({ id: SITE, companyId: COMPANY });
  });

  it('cada guardado estampa una nueva versión del contenido y la devuelve tal cual, sin releer la base', async () => {
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    const result = await saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}), expectedUpdatedAt: '2020-01-01T00:00:00.123Z' });

    const { data } = argsOf(db.webSite.updateMany);
    expect(data.contentUpdatedAt).toBeInstanceOf(Date);
    expect(result.version).toBe((data.contentUpdatedAt as Date).toISOString());
    expect(result.version).not.toBe('2020-01-01T00:00:00.123Z');
    expect((data.contentUpdatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(db.webSite.findFirst).toHaveBeenCalledTimes(1); // solo la lectura previa (modo y estado)
  });

  it('la lectura previa del sitio también va acotada a la empresa', async () => {
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    await saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}) });
    expect(db.webSite.findFirst).toHaveBeenCalledTimes(1);
    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: SITE, companyId: COMPANY });
  });

  it('si otra persona guardó antes (count 0) lanza el error de edición simultánea', async () => {
    guidedSite();
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 0 });

    await expect(saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}), expectedUpdatedAt: '2026-09-02T10:00:00.123Z' })).rejects.toThrow(
      /Otra persona guardó cambios en este sitio mientras lo editabas/
    );
    await expect(saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}), expectedUpdatedAt: '2026-09-02T10:00:00.123Z' })).rejects.toBeInstanceOf(
      WebSiteError
    );
  });

  it('un sitio de otra empresa (findFirst con companyId no lo encuentra) no se puede editar', async () => {
    db.webSite.findFirst.mockResolvedValueOnce(null);
    await expect(saveWebSiteContent(OTHER_COMPANY, SITE, { theme: parseTheme({}) })).rejects.toThrow('Sitio no encontrado');
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza secciones en un sitio de HTML propio', async () => {
    guidedSite({ mode: 'HTML' });
    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [createBlock('text')] })).rejects.toThrow(/HTML propio: no tiene secciones/);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza HTML propio en un sitio armado con secciones', async () => {
    guidedSite({ mode: 'GUIDED' });
    await expect(saveWebSiteContent(COMPANY, SITE, { html: '<p>hola</p>' })).rejects.toThrow(/se arma con secciones/);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza editar un sitio archivado, sea cual sea el contenido', async () => {
    guidedSite({ status: 'ARCHIVED' });
    await expect(saveWebSiteContent(COMPANY, SITE, { theme: parseTheme({}) })).rejects.toThrow(/archivado/);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza HTML sobre MAX_HTML_BYTES, midiendo bytes y no caracteres', async () => {
    guidedSite({ mode: 'HTML' });
    await expect(saveWebSiteContent(COMPANY, SITE, { html: 'a'.repeat(MAX_HTML_BYTES + 1) })).rejects.toThrow(/supera los 200 KB/);

    // 100.001 caracteres "ñ" son 200.002 bytes en UTF-8: pasarían un límite por caracteres.
    guidedSite({ mode: 'HTML' });
    const multibyte = 'ñ'.repeat(MAX_HTML_BYTES / 2 + 1);
    expect(multibyte.length).toBeLessThan(MAX_HTML_BYTES);
    await expect(saveWebSiteContent(COMPANY, SITE, { html: multibyte })).rejects.toBeInstanceOf(WebSiteError);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('acepta HTML justo en el límite y lo guarda como borrador', async () => {
    guidedSite({ mode: 'HTML' });
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const html = 'a'.repeat(MAX_HTML_BYTES);

    await saveWebSiteContent(COMPANY, SITE, { html });

    const { data } = argsOf(db.webSite.updateMany);
    expect(data).toEqual({ draftHtml: html, contentUpdatedAt: expect.any(Date) });
  });
});

describe('imágenes propias de la empresa: host permitido Y carpeta de la empresa de la sesión', () => {
  const OWN = [
    'https://blob.test/web-sites/company-a/site-1/logo.png',
    'https://blob.test/web-sites/company-a/otro-sitio-de-la-misma-empresa/x.png',
    'https://blob.test/branding/company-a/logo.png',
    'https://blob.test/products/company-a/foto.png',
  ];
  const FOREIGN = [
    ['la biblioteca de sitios de otra empresa', 'https://blob.test/web-sites/company-b/site-9/logo.png'],
    ['el logo de otra empresa', 'https://blob.test/branding/company-b/logo.png'],
    ['un producto de otra empresa', 'https://blob.test/products/company-b/foto.png'],
    ['un prefijo parcial sin la barra (company-ab)', 'https://blob.test/web-sites/company-ab/x.png'],
    ['una carpeta de otro módulo de la misma empresa (candidatas)', 'https://blob.test/candidates/company-a/photo.jpg'],
    ['un recorrido ../ hacia otra empresa', 'https://blob.test/web-sites/company-a/../company-b/x.png'],
    ['un recorrido %2e%2e/ hacia otra empresa', 'https://blob.test/web-sites/company-a/%2e%2e/company-b/x.png'],
    ['la carpeta correcta pero no al inicio de la ruta', 'https://blob.test/otra/web-sites/company-a/x.png'],
    ['la carpeta sin archivo ni barra final', 'https://blob.test/web-sites/company-a'],
  ] as const;

  it.each(FOREIGN)('saveWebSiteContent rechaza %s, aunque el host sea el del almacenamiento', async (_label, url) => {
    expect(isAllowedBlobUrl(url)).toBe(true); // el host pasa: lo único que la frena es el prefijo de la empresa
    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT' });
    const hero = { ...createBlock('hero'), imageUrl: url } as WebSiteBlock;

    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [hero] })).rejects.toThrow(/biblioteca del sitio/);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it.each(OWN)('saveWebSiteContent acepta la imagen propia %s', async (url) => {
    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT' });
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const gallery = { ...createBlock('gallery'), images: [{ url, alt: 'x' }] } as WebSiteBlock;

    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [gallery] })).resolves.toBeDefined();
    expect(db.webSite.updateMany).toHaveBeenCalledTimes(1);
  });

  it('la misma URL es propia para una empresa y ajena para otra (el prefijo sale de la empresa de la sesión)', async () => {
    const url = 'https://blob.test/web-sites/company-b/site-9/logo.png';
    const hero = { ...createBlock('hero'), imageUrl: url } as WebSiteBlock;

    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT' });
    await expect(saveWebSiteContent(COMPANY, SITE, { blocks: [hero] })).rejects.toBeInstanceOf(WebSiteError);

    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT' });
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    await expect(saveWebSiteContent(OTHER_COMPANY, SITE, { blocks: [hero] })).resolves.toBeDefined();
  });

  it.each(FOREIGN)('updateWebSiteSettings rechaza como logo u og:image %s y no escribe', async (_label, url) => {
    const base = { name: 'Solar Sur', slug: 'solar-sur', indexable: true };
    for (const field of ['logoUrl', 'ogImageUrl'] as const) {
      db.webSite.findFirst.mockResolvedValueOnce({ id: SITE, slug: 'solar-sur' });
      await expect(updateWebSiteSettings(COMPANY, SITE, { ...base, [field]: url })).rejects.toThrow(/biblioteca del sitio/);
    }
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('updateWebSiteSettings acepta el logo de la empresa (branding/) y guarda logo y og:image', async () => {
    db.webSite.findFirst.mockResolvedValueOnce({ id: SITE, slug: 'solar-sur' });
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    await updateWebSiteSettings(COMPANY, SITE, {
      name: 'Solar Sur',
      slug: 'solar-sur',
      indexable: true,
      logoUrl: 'https://blob.test/branding/company-a/logo.png',
      ogImageUrl: 'https://blob.test/web-sites/company-a/site-1/og.png',
    });

    expect(argsOf(db.webSite.updateMany).data).toMatchObject({ logoUrl: 'https://blob.test/branding/company-a/logo.png', ogImageUrl: 'https://blob.test/web-sites/company-a/site-1/og.png' });
  });
});

describe('assertCanAddAsset: cupos de la biblioteca', () => {
  const MB = 1024 * 1024;

  function library(over: { site?: Row | null; count?: number; used?: number | null } = {}) {
    db.webSite.findFirst.mockResolvedValue(over.site === undefined ? { id: SITE, status: 'DRAFT' } : over.site);
    db.webSiteAsset.count.mockResolvedValue(over.count ?? 0);
    db.webSiteAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: over.used === undefined ? 0 : over.used } });
  }

  it('todas las consultas van acotadas a la empresa: sitio, recuento por sitio y suma de bytes de la empresa', async () => {
    library();

    await assertCanAddAsset(COMPANY, SITE, 1000);

    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: SITE, companyId: COMPANY });
    expect(argsOf(db.webSiteAsset.count).where).toEqual({ companyId: COMPANY, siteId: SITE });
    expect(argsOf(db.webSiteAsset.aggregate)).toMatchObject({ where: { companyId: COMPANY }, _sum: { sizeBytes: true } });
  });

  it('un sitio ajeno o archivado no admite imágenes', async () => {
    library({ site: null });
    await expect(assertCanAddAsset(OTHER_COMPANY, SITE, 10)).rejects.toThrow('Sitio no encontrado');
    library({ site: { id: SITE, status: 'ARCHIVED' } });
    await expect(assertCanAddAsset(COMPANY, SITE, 10)).rejects.toThrow(/archivado/);
  });

  it(`una biblioteca con ${MAX_ASSETS_PER_SITE} imágenes está llena`, async () => {
    library({ count: MAX_ASSETS_PER_SITE });
    await expect(assertCanAddAsset(COMPANY, SITE, 10)).rejects.toThrow(new RegExp(`hasta ${MAX_ASSETS_PER_SITE} imágenes`));
    library({ count: MAX_ASSETS_PER_SITE - 1 });
    await expect(assertCanAddAsset(COMPANY, SITE, 10)).resolves.toBeUndefined();
  });

  it('rechaza cuando lo ya usado por la empresa (todos sus sitios, también archivados) más el archivo entrante supera el tope', async () => {
    library({ used: MAX_COMPANY_ASSET_BYTES - 10 * MB + 1 });
    await expect(assertCanAddAsset(COMPANY, SITE, 10 * MB)).rejects.toThrow(/límite de 300 MB/);
  });

  it('el tope es estricto: llegar justo al límite todavía se acepta', async () => {
    library({ used: MAX_COMPANY_ASSET_BYTES - 10 * MB });
    await expect(assertCanAddAsset(COMPANY, SITE, 10 * MB)).resolves.toBeUndefined();
  });

  it('una empresa sin imágenes (suma null) parte de cero, y sin bytes entrantes solo cuenta lo usado', async () => {
    library({ used: null });
    await expect(assertCanAddAsset(COMPANY, SITE, 4 * MB)).resolves.toBeUndefined();

    library({ used: MAX_COMPANY_ASSET_BYTES });
    await expect(assertCanAddAsset(COMPANY, SITE)).resolves.toBeUndefined(); // 0 bytes entrantes: no supera
    await expect(assertCanAddAsset(COMPANY, SITE, 1)).rejects.toThrow(/límite/);
  });
});

describe('unusedAssetUrls y countRecentMessages: siempre por empresa', () => {
  it('unusedAssetUrls solo mira las filas de biblioteca de la empresa: una fila ajena no bloquea ni revela nada', async () => {
    const fake = installTenantDb();

    const unused = await service.unusedAssetUrls('A', ['https://blob.test/a.png', 'https://blob.test/b.png']);

    // A usa a.png; b.png es de la biblioteca de B, que A no puede ver: no cuenta como "en uso".
    expect(unused).toEqual(['https://blob.test/b.png']);
    const [call] = fake.calls;
    expect(call).toMatchObject({ model: 'webSiteAsset', method: 'findMany' });
    expect(call!.where.companyId).toBe('A');
  });

  it('unusedAssetUrls sin URLs no consulta la base', async () => {
    await expect(service.unusedAssetUrls(COMPANY, [])).resolves.toEqual([]);
    expect(db.webSiteAsset.findMany).not.toHaveBeenCalled();
  });

  it('unusedAssetUrls consulta con companyId y las URLs pedidas', async () => {
    db.webSiteAsset.findMany.mockResolvedValue([{ url: 'https://blob.test/x.png' }]);
    await expect(service.unusedAssetUrls(COMPANY, ['https://blob.test/x.png', 'https://blob.test/y.png'])).resolves.toEqual(['https://blob.test/y.png']);
    expect(argsOf(db.webSiteAsset.findMany).where).toEqual({ companyId: COMPANY, url: { in: ['https://blob.test/x.png', 'https://blob.test/y.png'] } });
  });

  it('countRecentMessages cuenta los mensajes del sitio de esa empresa dentro de la ventana pedida', async () => {
    db.webSiteMessage.count.mockResolvedValue(7);
    const before = Date.now();

    await expect(service.countRecentMessages(COMPANY, SITE, 60)).resolves.toBe(7);

    const { where } = argsOf(db.webSiteMessage.count);
    expect(where).toMatchObject({ companyId: COMPANY, siteId: SITE });
    const since = (where.createdAt as { gte: Date }).gte.getTime();
    expect(since).toBeGreaterThanOrEqual(before - 60 * 60_000);
    expect(since).toBeLessThanOrEqual(Date.now() - 60 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// publishWebSite
// ---------------------------------------------------------------------------

describe('publishWebSite: publicar exige la lista "qué falta"', () => {
  it('con un sitio incompleto lanza un error que lista lo que falta y no publica', async () => {
    const incompleto = siteRow({ draftBlocks: [{ ...createBlock('hero'), title: '' }, { ...createBlock('contact'), showForm: false }] });
    db.webSite.findFirst.mockResolvedValue(incompleto);
    db.webSiteMessage.count.mockResolvedValue(0);

    const error = await publishWebSite(COMPANY, SITE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebSiteError);
    const message = (error as WebSiteError).message;
    expect(message).toMatch(/^Aún no se puede publicar\. Falta: /);
    expect(message).toContain('Portada con título');
    expect(message).toContain('Una forma de contacto');
    // Las recomendaciones (logo, imágenes, SEO) no bloquean y no se listan.
    expect(message).not.toContain('Logo');
    expect(message).not.toContain('Usas imágenes propias');
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('una plantilla recién creada, con sus textos de ejemplo, no se puede publicar', async () => {
    db.webSite.findFirst.mockResolvedValue(siteRow({ draftBlocks: starterBlocks('LANDING', { name: 'Mi negocio' }) }));
    db.webSiteMessage.count.mockResolvedValue(0);

    await expect(publishWebSite(COMPANY, SITE)).rejects.toThrow(/Reemplazaste los textos de ejemplo/);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('publica una copia del borrador (no lo ya publicado) con su tema, acotada a {id, companyId}', async () => {
    const oldPublished = [{ ...createBlock('hero'), title: 'Versión vieja publicada' }];
    db.webSite.findFirst.mockResolvedValue(siteRow({ theme: { primary: '#123456' }, publishedBlocks: oldPublished, publishedTheme: {} }));
    db.webSiteMessage.count.mockResolvedValue(0);
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    const { publishedAt, report } = await publishWebSite(COMPANY, SITE);

    expect(report.canPublish).toBe(true);
    expect(db.webSite.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = argsOf(db.webSite.updateMany);
    expect(where).toEqual({ id: SITE, companyId: COMPANY });
    expect(data.status).toBe('PUBLISHED');
    expect(data.publishedAt).toBe(publishedAt);
    // Lo publicado es el documento del sitio (formato multipágina), con la página de inicio del borrador.
    const publishedDoc = data.publishedBlocks as SiteDocument;
    expect(publishedDoc.version).toBe(2);
    expect(homeOf(publishedDoc).blocks.map((block) => (block.type === 'hero' ? block.title : block.type))).toEqual(['Paneles solares para tu casa', 'contact']);
    expect(data.publishedBlocks).not.toEqual(oldPublished);
    expect(data).not.toHaveProperty('contentUpdatedAt'); // publicar no cuenta como editar el contenido
    expect(data.publishedTheme).toEqual(parseTheme({ primary: '#123456' }));
    expect((data.publishedTheme as { primary: string }).primary).toBe('#123456');
    expect(data.publishedHtml).toBeNull();
  });

  it('el borrador publicado es idéntico al borrador guardado, bloque por bloque', async () => {
    const draft = publishableBlocks();
    db.webSite.findFirst.mockResolvedValue(siteRow({ draftBlocks: draft }));
    db.webSiteMessage.count.mockResolvedValue(0);
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    await publishWebSite(COMPANY, SITE);

    // Un borrador del formato antiguo (lista de secciones) se publica convertido, sin perder ni alterar ninguna sección.
    const published = argsOf(db.webSite.updateMany).data.publishedBlocks as SiteDocument;
    expect(homeOf(published).blocks).toEqual(JSON.parse(JSON.stringify(parseSiteDocument(draft).pages[0]!.blocks)));
    expect(homeOf(published).blocks.map((block) => block.id)).toEqual(draft.map((block) => block.id));
  });

  it('en modo HTML guarda publishedHtml YA sanitizado, sin scripts ni manejadores', async () => {
    const dirty = `<h1 onclick="robar()">Hola</h1><p>${'texto de prueba '.repeat(10)}</p><script>alert(document.cookie)</script><a href="javascript:alert(1)">x</a><a href="mailto:a@b.cl">Escríbenos</a>`;
    db.webSite.findFirst.mockResolvedValue(siteRow({ mode: 'HTML', draftBlocks: [], draftHtml: dirty }));
    db.webSiteMessage.count.mockResolvedValue(0);
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    await publishWebSite(COMPANY, SITE);

    const { data } = argsOf(db.webSite.updateMany);
    const published = data.publishedHtml as string;
    expect(published).not.toMatch(/<script/i);
    expect(published).not.toMatch(/onclick/i);
    expect(published).not.toMatch(/javascript:/i);
    expect(published).toContain('<h1>Hola</h1>');
    expect(published).toContain('mailto:a@b.cl');
    expect(data.publishedBlocks).toEqual([]);
  });

  it('no publica un sitio archivado ni uno ajeno', async () => {
    db.webSite.findFirst.mockResolvedValueOnce(siteRow({ status: 'ARCHIVED' }));
    db.webSiteMessage.count.mockResolvedValue(0);
    await expect(publishWebSite(COMPANY, SITE)).rejects.toThrow(/archivado/);

    db.webSite.findFirst.mockResolvedValueOnce(null);
    await expect(publishWebSite(OTHER_COMPANY, SITE)).rejects.toThrow('Sitio no encontrado');
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Lectura pública
// ---------------------------------------------------------------------------

describe('getPublicWebSite: lo que ve el público', () => {
  it.each(['ab', 'Mi-Sitio', 'mi sitio', 'mi_sitio', '../etc/passwd', 'a'.repeat(51), ''])(
    'devuelve null para el slug de formato inválido %p sin consultar la base',
    async (slug) => {
      await expect(getPublicWebSite(slug)).resolves.toBeNull();
      expect(db.webSite.findUnique).not.toHaveBeenCalled();
    }
  );

  it('consulta por slug y solo selecciona campos publicados (nunca el borrador)', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow());
    await getPublicWebSite('solar-sur');

    const { where, select } = argsOf(db.webSite.findUnique);
    expect(where).toEqual({ slug: 'solar-sur' });
    expect(select).toBeDefined();
    for (const draftField of ['draftBlocks', 'draftHtml', 'theme']) expect(select).not.toHaveProperty(draftField);
    expect(select).toMatchObject({ publishedBlocks: true, publishedTheme: true, publishedHtml: true });
  });

  it.each(['DRAFT', 'ARCHIVED'])('devuelve null si el sitio está en estado %s', async (status) => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ status }));
    await expect(getPublicWebSite('solar-sur')).resolves.toBeNull();
  });

  it('devuelve null si no existe', async () => {
    db.webSite.findUnique.mockResolvedValue(null);
    await expect(getPublicWebSite('solar-sur')).resolves.toBeNull();
  });

  it.each(['SUSPENDED', 'CANCELLED'])('devuelve null si la empresa está %s', async (status) => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ company: { businessName: 'X', status, features: { hasWebSites: true } } }));
    await expect(getPublicWebSite('solar-sur')).resolves.toBeNull();
  });

  it.each(['ACTIVE', 'TRIAL'])('publica el sitio de una empresa %s con el módulo contratado', async (status) => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ company: { businessName: 'X', status, features: { hasWebSites: true } } }));
    await expect(getPublicWebSite('solar-sur')).resolves.not.toBeNull();
  });

  it('devuelve null si la empresa no tiene el módulo Sitios web (hasWebSites=false o sin fila de features)', async () => {
    db.webSite.findUnique.mockResolvedValueOnce(publicRow({ company: { businessName: 'X', status: 'ACTIVE', features: { hasWebSites: false } } }));
    await expect(getPublicWebSite('solar-sur')).resolves.toBeNull();

    db.webSite.findUnique.mockResolvedValueOnce(publicRow({ company: { businessName: 'X', status: 'ACTIVE', features: null } }));
    await expect(getPublicWebSite('solar-sur')).resolves.toBeNull();
  });

  it('entrega los bloques PUBLICADOS parseados, no el borrador', async () => {
    const published = [{ ...createBlock('hero'), title: 'Título publicado' }, { ...createBlock('contact'), showForm: true }];
    db.webSite.findUnique.mockResolvedValue(
      publicRow({
        publishedBlocks: published,
        // Aunque la fila trajera el borrador, no debe usarse.
        draftBlocks: [{ ...createBlock('hero'), title: 'BORRADOR sin publicar' }],
        publishedTheme: { primary: '#abcdef' },
        seoTitle: '  Título SEO  ',
        seoDescription: '  ',
      })
    );

    const site = await getPublicWebSite('solar-sur');

    expect(site).not.toBeNull();
    expect(site!.blocks.map((block) => (block.type === 'hero' ? block.title : block.type))).toEqual(['Título publicado', 'contact']);
    expect(JSON.stringify(site)).not.toContain('BORRADOR');
    expect(site!.theme.primary).toBe('#abcdef');
    expect(site!.title).toBe('Título SEO');
    expect(site!.description).toBeNull();
    expect(site!.companyId).toBe(COMPANY);
  });

  it('descarta bloques dañados del JSON publicado sin tumbar el sitio', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ publishedBlocks: [{ id: 'x', type: 'inexistente' }, { ...createBlock('hero'), title: 'Ok' }] }));
    const site = await getPublicWebSite('solar-sur');
    expect(site!.blocks).toHaveLength(1);
  });

  describe('acceptsMessages', () => {
    const accepts = async (blocks: WebSiteBlock[]) => {
      db.webSite.findUnique.mockResolvedValueOnce(publicRow({ publishedBlocks: blocks }));
      return (await getPublicWebSite('solar-sur'))!.acceptsMessages;
    };
    const hero = { ...createBlock('hero'), title: 'Hola' } as WebSiteBlock;

    it('es true solo si hay un bloque contact NO oculto con showForm true', async () => {
      expect(await accepts([hero, { ...createBlock('contact'), showForm: true } as WebSiteBlock])).toBe(true);
    });

    it('es false sin bloque de contacto', async () => {
      expect(await accepts([hero])).toBe(false);
    });

    it('es false si el contacto no tiene formulario', async () => {
      expect(await accepts([hero, { ...createBlock('contact'), showForm: false, email: 'a@b.cl' } as WebSiteBlock])).toBe(false);
    });

    it('es false si el contacto con formulario está oculto', async () => {
      expect(await accepts([hero, { ...createBlock('contact'), showForm: true, hidden: true } as WebSiteBlock])).toBe(false);
    });

    it('es true si hay uno oculto y otro visible con formulario', async () => {
      const oculto = { ...createBlock('contact'), showForm: true, hidden: true } as WebSiteBlock;
      const visible = { ...createBlock('contact'), showForm: true } as WebSiteBlock;
      expect(await accepts([hero, oculto, visible])).toBe(true);
    });
  });
});

describe('getPublicWebSiteByDomain: dominio propio', () => {
  it('un dominio sin verificar NO publica si la visita no llegó por ese dominio, y no marca nada', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ customDomain: 'solar.cl', customDomainVerifiedAt: null }));

    await expect(getPublicWebSiteByDomain('solar.cl', false)).resolves.toBeNull();
    await expect(getPublicWebSiteByDomain('solar.cl')).resolves.toBeNull();

    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('al llegar por el propio dominio sin verificar, lo marca verificado (solo si sigue sin verificar) y devuelve el sitio', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ customDomain: 'solar.cl', customDomainVerifiedAt: null }));
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    const site = await getPublicWebSiteByDomain('solar.cl', true);

    expect(site).not.toBeNull();
    expect(site!.id).toBe(SITE);
    expect(argsOf(db.webSite.findUnique).where).toEqual({ customDomain: 'solar.cl' });
    expect(db.webSite.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = argsOf(db.webSite.updateMany);
    expect(where).toEqual({ id: SITE, companyId: COMPANY, customDomain: 'solar.cl', customDomainVerifiedAt: null });
    expect(data.customDomainVerifiedAt).toBeInstanceOf(Date);
  });

  it('un dominio ya verificado se sirve sin escribir en la base', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ customDomain: 'solar.cl', customDomainVerifiedAt: new Date('2026-09-01T00:00:00Z') }));
    await expect(getPublicWebSiteByDomain('solar.cl', false)).resolves.not.toBeNull();
    await expect(getPublicWebSiteByDomain('solar.cl', true)).resolves.not.toBeNull();
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('un dominio desconocido devuelve null', async () => {
    db.webSite.findUnique.mockResolvedValue(null);
    await expect(getPublicWebSiteByDomain('nadie.cl', true)).resolves.toBeNull();
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('aunque el dominio esté verificado, un sitio sin publicar o de una empresa suspendida no se sirve', async () => {
    const verified = new Date('2026-09-01T00:00:00Z');
    db.webSite.findUnique.mockResolvedValueOnce(publicRow({ status: 'DRAFT', customDomain: 'solar.cl', customDomainVerifiedAt: verified }));
    await expect(getPublicWebSiteByDomain('solar.cl', true)).resolves.toBeNull();

    db.webSite.findUnique.mockResolvedValueOnce(
      publicRow({ customDomain: 'solar.cl', customDomainVerifiedAt: verified, company: { businessName: 'X', status: 'SUSPENDED', features: { hasWebSites: true } } })
    );
    await expect(getPublicWebSiteByDomain('solar.cl', true)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteWebSite / deleteAsset
// ---------------------------------------------------------------------------

describe('deleteWebSite', () => {
  it('no elimina un sitio publicado: hay que despublicarlo antes', async () => {
    db.webSite.findFirst.mockResolvedValue({ status: 'PUBLISHED', customDomain: 'solar.cl', assets: [] });

    await expect(deleteWebSite(COMPANY, SITE)).rejects.toThrow(/Despublica el sitio antes de eliminarlo/);
    expect(db.webSite.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'ARCHIVED'])('elimina con deleteMany acotado a la empresa un sitio en estado %s y devuelve archivos y dominio', async (status) => {
    db.webSite.findFirst.mockResolvedValue({ status, customDomain: 'solar.cl', assets: [{ url: 'https://blob.test/a.png' }, { url: 'https://blob.test/b.png' }] });
    db.webSite.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteWebSite(COMPANY, SITE);

    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: SITE, companyId: COMPANY });
    expect(argsOf(db.webSite.deleteMany).where).toEqual({ id: SITE, companyId: COMPANY });
    expect(result).toEqual({ urls: ['https://blob.test/a.png', 'https://blob.test/b.png'], domain: 'solar.cl' });
  });

  it('un sitio que no es de la empresa no se elimina', async () => {
    db.webSite.findFirst.mockResolvedValue(null);
    await expect(deleteWebSite(OTHER_COMPANY, SITE)).rejects.toThrow('Sitio no encontrado');
    expect(db.webSite.deleteMany).not.toHaveBeenCalled();
  });
});

describe('deleteAsset: biblioteca de imágenes', () => {
  const emptySite = { draftBlocks: [], publishedBlocks: null, logoUrl: null, ogImageUrl: null, draftHtml: null, publishedHtml: null };
  const asset = (siteOver: Row = {}) => ({ id: 'asset-1', companyId: COMPANY, siteId: SITE, url: ASSET_URL, site: { ...emptySite, ...siteOver } });

  it.each([
    ['draftBlocks', { draftBlocks: [{ ...createBlock('hero'), imageUrl: ASSET_URL }] }],
    ['publishedBlocks', { publishedBlocks: [{ ...createBlock('image'), imageUrl: ASSET_URL }] }],
    ['logoUrl', { logoUrl: ASSET_URL }],
    ['ogImageUrl', { ogImageUrl: ASSET_URL }],
    ['draftHtml', { draftHtml: `<img src="${ASSET_URL}" alt="x">` }],
    ['publishedHtml', { publishedHtml: `<img src="${ASSET_URL}" alt="x">` }],
  ])('lanza y no borra si la URL sigue usándose en %s', async (_where, siteOver) => {
    db.webSiteAsset.findFirst.mockResolvedValue(asset(siteOver));

    await expect(deleteAsset(COMPANY, 'asset-1')).rejects.toThrow(/Esta imagen se usa en el sitio/);
    expect(db.webSiteAsset.deleteMany).not.toHaveBeenCalled();
  });

  it('si no se usa, borra con deleteMany {id, companyId} y devuelve la URL a borrar cuando nadie más la comparte', async () => {
    db.webSiteAsset.findFirst.mockResolvedValue(asset());
    db.webSiteAsset.deleteMany.mockResolvedValue({ count: 1 });
    db.webSiteAsset.count.mockResolvedValue(0);

    const result = await deleteAsset(COMPANY, 'asset-1');

    expect(argsOf(db.webSiteAsset.findFirst).where).toEqual({ id: 'asset-1', companyId: COMPANY });
    expect(argsOf(db.webSiteAsset.deleteMany).where).toEqual({ id: 'asset-1', companyId: COMPANY });
    // El recuento de "otra fila usa la misma URL" también es de la empresa: filas ajenas no bloquean ni revelan nada.
    expect(argsOf(db.webSiteAsset.count).where).toEqual({ url: ASSET_URL, companyId: COMPANY });
    expect(result).toEqual({ urlToDelete: ASSET_URL });
  });

  it('devuelve urlToDelete=null si otra fila de biblioteca (p. ej. una copia del sitio) comparte la URL', async () => {
    db.webSiteAsset.findFirst.mockResolvedValue(asset());
    db.webSiteAsset.deleteMany.mockResolvedValue({ count: 1 });
    db.webSiteAsset.count.mockResolvedValue(1);

    await expect(deleteAsset(COMPANY, 'asset-1')).resolves.toEqual({ urlToDelete: null });
    expect(db.webSiteAsset.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('una imagen de otra empresa no se encuentra ni se borra', async () => {
    db.webSiteAsset.findFirst.mockResolvedValue(null);
    await expect(deleteAsset(OTHER_COMPANY, 'asset-1')).rejects.toThrow('Imagen no encontrada');
    expect(db.webSiteAsset.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createWebSite
// ---------------------------------------------------------------------------

describe('createWebSite', () => {
  const base = { name: 'Taller Los Andes', kind: 'LANDING' as const, mode: 'GUIDED' as const };

  function happyPath() {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValue(null);
    db.webSite.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'new-site', slug: data.slug }));
  }

  it('rechaza una dirección (slug) ya tomada y no crea nada', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValue({ id: 'otro' });

    await expect(createWebSite(COMPANY, { name: 'Ana' }, { ...base, slug: 'taller' })).rejects.toThrow(/Esa dirección ya la usa otro sitio/);
    expect(argsOf(db.webSite.findFirst).where).toEqual({ slug: 'taller' });
    expect(db.webSite.create).not.toHaveBeenCalled();
  });

  it('rechaza un cliente (contactId) de otra empresa: la búsqueda va con companyId y no crea nada', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.contact.findFirst.mockResolvedValue(null);

    await expect(createWebSite(COMPANY, { name: 'Ana' }, { ...base, contactId: 'contacto-de-b' })).rejects.toThrow('El cliente seleccionado no existe');

    expect(argsOf(db.contact.findFirst).where).toEqual({ id: 'contacto-de-b', companyId: COMPANY });
    expect(db.webSite.create).not.toHaveBeenCalled();
  });

  it('sin slug genera uno desde el nombre (sin tildes ni símbolos)', async () => {
    happyPath();

    const created = await createWebSite(COMPANY, { name: 'Ana' }, { ...base, name: 'Ñandú Diseño & Café' });

    expect(created.slug).toBe('nandu-diseno-cafe');
    expect(argsOf(db.webSite.create).data).toMatchObject({ companyId: COMPANY, slug: 'nandu-diseno-cafe', name: 'Ñandú Diseño & Café', createdByName: 'Ana' });
  });

  it('si el slug generado está tomado agrega un sufijo aleatorio; si el nombre no tiene letras usa "sitio"', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValueOnce({ id: 'tomado' }).mockResolvedValueOnce(null);
    db.webSite.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'n', slug: data.slug }));
    const withSuffix = await createWebSite(COMPANY, { name: 'Ana' }, { ...base, name: 'Solar Sur' });
    expect(withSuffix.slug).toMatch(/^solar-sur-[0-9a-f]{5}$/);

    db.webSite.findFirst.mockReset().mockResolvedValue(null);
    const fallback = await createWebSite(COMPANY, { name: 'Ana' }, { ...base, name: '!!!' });
    expect(fallback.slug).toBe('sitio');
  });

  it('el slug de respaldo generado por uniqueSlug cumple la regla de direcciones del propio módulo (regresión: doble guion)', async () => {
    // Regresión: `root.slice(0, 44)` dejaba un guion final y el sufijo generaba "--", que `siteSlugProblem`
    // (el del formulario de ajustes) rechaza. Con un nombre cuyo carácter 44 es "-" se reproducía.
    const name = `${'a'.repeat(43)} ${'b'.repeat(6)}`; // slug: 43 "a" + "-" + 6 "b" = 50 caracteres
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValueOnce({ id: 'tomado' }).mockResolvedValueOnce(null);
    db.webSite.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'n', slug: data.slug }));

    const created = await createWebSite(COMPANY, { name: 'Ana' }, { ...base, name });

    expect(siteSlugProblem(created.slug)).toBeNull();
  });

  it(`respeta el máximo de ${MAX_SITES_PER_COMPANY} sitios activos por empresa`, async () => {
    db.webSite.count.mockResolvedValue(MAX_SITES_PER_COMPANY);

    await expect(createWebSite(COMPANY, { name: 'Ana' }, base)).rejects.toThrow(new RegExp(`máximo de ${MAX_SITES_PER_COMPANY} sitios activos`));
    expect(argsOf(db.webSite.count).where).toEqual({ companyId: COMPANY, status: { not: 'ARCHIVED' } });
    expect(db.webSite.create).not.toHaveBeenCalled();
    expect(db.contact.findFirst).not.toHaveBeenCalled();
  });

  it('con uno menos del máximo todavía deja crear', async () => {
    happyPath();
    db.webSite.count.mockResolvedValue(MAX_SITES_PER_COMPANY - 1);
    await expect(createWebSite(COMPANY, { name: 'Ana' }, base)).resolves.toMatchObject({ id: 'new-site' });
  });

  it('arma el borrador inicial según el modo: secciones (GUIDED) o HTML propio (HTML)', async () => {
    happyPath();
    await createWebSite(COMPANY, { name: 'Ana' }, base);
    const guided = argsOf(db.webSite.create).data;
    const starter = guided.draftBlocks as SiteDocument;
    expect(starter.version).toBe(2);
    expect(homeOf(starter).blocks[0]).toMatchObject({ type: 'hero', title: 'Taller Los Andes' });
    expect(parseSiteDocument(starter)).toEqual(JSON.parse(JSON.stringify(starter)));
    expect(guided.draftHtml).toBeNull();

    await createWebSite(COMPANY, { name: 'Ana' }, { ...base, mode: 'HTML' });
    const html = argsOf(db.webSite.create, 1).data;
    expect(html.draftBlocks).toEqual([]);
    expect(html.draftHtml).toEqual(expect.stringContaining('Taller Los Andes'));
  });

  it('traduce una colisión de slug en la base (carrera entre dos altas) al mismo mensaje de dirección tomada', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValue(null);
    db.webSite.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));

    await expect(createWebSite(COMPANY, { name: 'Ana' }, base)).rejects.toThrow(/Esa dirección ya la usa otro sitio/);
  });

  it('un error de base que no es de unicidad se propaga tal cual', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValue(null);
    db.webSite.create.mockRejectedValue(new Error('conexión perdida'));
    await expect(createWebSite(COMPANY, { name: 'Ana' }, base)).rejects.toThrow('conexión perdida');
  });
});

describe('duplicateWebSite', () => {
  it('el slug de la copia cumple la regla de direcciones del módulo aunque el original sea largo (regresión: doble guion)', async () => {
    // Regresión: `source.slug.slice(0, 40)` + "-copia" dejaba "--copia" si el carácter 40 del original era "-".
    const slug = `${'a'.repeat(39)}-${'b'.repeat(10)}`;
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst
      .mockResolvedValueOnce(siteRow({ slug, assets: [] })) // el original
      .mockResolvedValueOnce(null); // el slug de la copia está libre
    db.webSite.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'copia', slug: data.slug }));

    await duplicateWebSite(COMPANY, { name: 'Ana' }, SITE);

    const created = argsOf(db.webSite.create).data.slug as string;
    expect(siteSlugProblem(created)).toBeNull();
  });

  it('copia el sitio dentro de la misma empresa como borrador, con sus imágenes', async () => {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst
      .mockResolvedValueOnce(siteRow({ assets: [{ url: ASSET_URL, fileName: 'logo.png', mimeType: 'image/png', sizeBytes: 10, alt: 'Logo' }] }))
      .mockResolvedValueOnce(null);
    db.webSite.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'copia', slug: data.slug }));

    await duplicateWebSite(COMPANY, { name: 'Ana' }, SITE);

    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: SITE, companyId: COMPANY });
    const { data } = argsOf(db.webSite.create);
    expect(data).toMatchObject({ companyId: COMPANY, name: 'Solar Sur (copia)', slug: 'solar-sur-copia' });
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('customDomain');
    expect(data).not.toHaveProperty('publishedBlocks');
    expect((data.assets as { create: Row[] }).create[0]).toMatchObject({ companyId: COMPANY, url: ASSET_URL });
  });
});

// ---------------------------------------------------------------------------
// Aislamiento multi-tenant
// ---------------------------------------------------------------------------

interface Call {
  model: string;
  method: string;
  where: Row;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'NOT') return !matches(row, cond as Row);
    if (cond instanceof Date) return row[key] instanceof Date && (row[key] as Date).getTime() === cond.getTime();
    if (cond !== null && typeof cond === 'object') {
      const op = cond as Row;
      if ('not' in op) return row[key] !== op.not;
      if ('in' in op) return (op.in as unknown[]).includes(row[key]);
      throw new Error(`Operador no soportado por el fake: ${key}`);
    }
    return row[key] === cond;
  });
}

/**
 * Base en memoria con dos empresas. Respeta el `where` que recibe: si el
 * servicio omitiera `companyId`, devolvería o modificaría filas de la otra.
 */
function installTenantDb() {
  const calls: Call[] = [];
  const emptySite = { draftBlocks: [], publishedBlocks: null, logoUrl: null, ogImageUrl: null, draftHtml: null, publishedHtml: null };
  const tables: Record<string, Row[]> = {
    webSite: [
      siteRow({ id: 'site-a', companyId: 'A', slug: 'sitio-a', customDomain: null }),
      siteRow({ id: 'site-b', companyId: 'B', slug: 'sitio-b', customDomain: 'b.cl', status: 'PUBLISHED' }),
    ],
    webSiteAsset: [
      { id: 'asset-a', companyId: 'A', siteId: 'site-a', url: 'https://blob.test/a.png', alt: null, site: emptySite },
      { id: 'asset-b', companyId: 'B', siteId: 'site-b', url: 'https://blob.test/b.png', alt: null, site: emptySite },
    ],
    webSiteMessage: [
      { id: 'msg-a', companyId: 'A', siteId: 'site-a', readAt: null },
      { id: 'msg-b', companyId: 'B', siteId: 'site-b', readAt: null },
    ],
    contact: [
      { id: 'contact-a', companyId: 'A' },
      { id: 'contact-b', companyId: 'B' },
    ],
  };
  const snapshot = JSON.stringify(tables);

  const install = (model: string, method: string, impl: (args: { where?: Row; data?: Row; by?: string[] }) => unknown) => {
    jest.spyOn(delegateOf(model), method).mockImplementation(((args: { where?: Row; data?: Row; by?: string[] }) => {
      calls.push({ model, method, where: args?.where ?? {} });
      return Promise.resolve(impl(args ?? {}));
    }) as never);
  };

  for (const model of ['webSite', 'webSiteAsset', 'webSiteMessage', 'contact']) {
    const rows = tables[model]!;
    install(model, 'findFirst', ({ where }) => rows.find((row) => matches(row, where)) ?? null);
    install(model, 'findMany', ({ where }) => rows.filter((row) => matches(row, where)));
    install(model, 'count', ({ where }) => rows.filter((row) => matches(row, where)).length);
    install(model, 'updateMany', ({ where, data }) => {
      const hit = rows.filter((row) => matches(row, where));
      // Prisma estampa `@updatedAt` en cualquier escritura de WebSite.
      hit.forEach((row) => Object.assign(row, data, model === 'webSite' ? { updatedAt: new Date() } : {}));
      return { count: hit.length };
    });
    install(model, 'deleteMany', ({ where }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { count: hit.length };
    });
    install(model, 'groupBy', ({ where, by }) => {
      const key = by![0]!;
      const groups = new Map<unknown, number>();
      rows.filter((row) => matches(row, where)).forEach((row) => groups.set(row[key], (groups.get(row[key]) ?? 0) + 1));
      return [...groups].map(([value, count]) => ({ [key]: value, _count: { _all: count } }));
    });
  }
  // `findUnique` (público) no se usa en estos escenarios.
  const untouched = () => JSON.stringify(tables) === snapshot;
  const byId = (model: string, id: string) => tables[model]!.find((row) => row.id === id);
  return { calls, tables, untouched, byId };
}

function expectAllScoped(calls: Call[], companyId: string, isGlobalByDesign: (call: Call) => boolean = () => false) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    if (isGlobalByDesign(call)) continue;
    expect({ query: `${call.model}.${call.method}`, companyId: call.where.companyId }).toEqual({ query: `${call.model}.${call.method}`, companyId });
  }
}

describe('aislamiento multi-tenant: la sesión de A nunca toca registros de B', () => {
  let fake: ReturnType<typeof installTenantDb>;

  beforeEach(() => {
    // Sin restoreAllMocks: se conservan los espías que lanzan para lo que el fake no cubre.
    fake = installTenantDb();
  });

  it('listWebSites: solo devuelve, cuenta y suma no leídos de la empresa de la sesión', async () => {
    const { rows, counts } = await listWebSites('A');

    expect(rows.map((row) => row.id)).toEqual(['site-a']);
    expect(counts).toEqual({ DRAFT: 1, PUBLISHED: 0, ARCHIVED: 0 }); // el sitio PUBLISHED de B no cuenta
    expect(rows[0]!.unreadMessages).toBe(1);
    expect(fake.calls.map((call) => `${call.model}.${call.method}`).sort()).toEqual(['webSite.findMany', 'webSite.groupBy', 'webSiteMessage.groupBy']);
    expectAllScoped(fake.calls, 'A');
  });

  it('getWebSite: con el ID de un sitio de B devuelve null; con el propio, lo devuelve (todas las consultas con companyId)', async () => {
    await expect(getWebSite('A', 'site-b')).resolves.toBeNull();
    expectAllScoped(fake.calls, 'A');

    fake.calls.length = 0;
    const own = await getWebSite('A', 'site-a');
    expect(own?.id).toBe('site-a');
    expect(fake.calls.map((call) => `${call.model}.${call.method}`)).toEqual(['webSite.findFirst', 'webSiteMessage.count']);
    expectAllScoped(fake.calls, 'A');
  });

  it('updateWebSiteSettings: no modifica un sitio de B y, en el propio, todo va con companyId salvo la unicidad global del slug', async () => {
    const settings = { name: 'Nuevo', slug: 'nuevo-nombre', indexable: true, contactId: 'contact-a' };
    const before = JSON.stringify(fake.byId('webSite', 'site-b'));

    await expect(updateWebSiteSettings('A', 'site-b', settings)).rejects.toThrow('Sitio no encontrado');
    expect(JSON.stringify(fake.byId('webSite', 'site-b'))).toBe(before);
    expectAllScoped(fake.calls, 'A');

    fake.calls.length = 0;
    await expect(updateWebSiteSettings('A', 'site-a', settings)).resolves.toEqual({ slug: 'nuevo-nombre' });
    expect(fake.byId('webSite', 'site-a')).toMatchObject({ slug: 'nuevo-nombre', name: 'Nuevo', contactId: 'contact-a' });
    // El slug es único en TODA la plataforma: esa búsqueda es global a propósito y es la única.
    const globalLookups = fake.calls.filter((call) => call.where.companyId === undefined);
    expect(globalLookups).toHaveLength(1);
    expect(globalLookups[0]).toMatchObject({ model: 'webSite', method: 'findFirst' });
    expect(globalLookups[0]!.where).toMatchObject({ slug: 'nuevo-nombre' });
    expectAllScoped(fake.calls, 'A', (call) => call === globalLookups[0]);
  });

  it('updateWebSiteSettings: rechaza un contactId de B', async () => {
    await expect(updateWebSiteSettings('A', 'site-a', { name: 'Nuevo', slug: 'sitio-a', indexable: true, contactId: 'contact-b' })).rejects.toThrow(
      'El cliente seleccionado no existe'
    );
    expect(fake.byId('webSite', 'site-a')?.contactId).toBeNull();
  });

  it('setMessageRead: no marca como leído un mensaje de B', async () => {
    await expect(setMessageRead('A', 'msg-b', true)).rejects.toThrow('Mensaje no encontrado');
    expect(fake.byId('webSiteMessage', 'msg-b')?.readAt).toBeNull();
    expectAllScoped(fake.calls, 'A');

    fake.calls.length = 0;
    await setMessageRead('A', 'msg-a', true);
    expect(fake.byId('webSiteMessage', 'msg-a')?.readAt).toBeInstanceOf(Date);
    expectAllScoped(fake.calls, 'A');
  });

  it('deleteWebSiteMessage: no borra un mensaje de B', async () => {
    await expect(deleteWebSiteMessage('A', 'msg-b')).rejects.toThrow('Mensaje no encontrado');
    expect(fake.byId('webSiteMessage', 'msg-b')).toBeDefined();
    expectAllScoped(fake.calls, 'A');

    fake.calls.length = 0;
    await deleteWebSiteMessage('A', 'msg-a');
    expect(fake.byId('webSiteMessage', 'msg-a')).toBeUndefined();
    expectAllScoped(fake.calls, 'A');
  });

  it('updateAssetAlt: no cambia la descripción de una imagen de B', async () => {
    await expect(updateAssetAlt('A', 'asset-b', 'hackeado')).rejects.toThrow('Imagen no encontrada');
    expect(fake.byId('webSiteAsset', 'asset-b')?.alt).toBeNull();
    expectAllScoped(fake.calls, 'A');

    fake.calls.length = 0;
    await updateAssetAlt('A', 'asset-a', 'Logo de la empresa');
    expect(fake.byId('webSiteAsset', 'asset-a')?.alt).toBe('Logo de la empresa');
    expectAllScoped(fake.calls, 'A');
  });

  it('listWebSiteMessages: pasar el siteId de B no devuelve sus mensajes', async () => {
    await expect(listWebSiteMessages('A', 'site-b')).resolves.toEqual([]);
    expectAllScoped(fake.calls, 'A');
  });

  it('las operaciones destructivas y de publicación tampoco alcanzan un sitio o imagen de B', async () => {
    await expect(deleteWebSite('A', 'site-b')).rejects.toThrow('Sitio no encontrado');
    await expect(deleteAsset('A', 'asset-b')).rejects.toThrow('Imagen no encontrada');
    await expect(publishWebSite('A', 'site-b')).rejects.toThrow('Sitio no encontrado');
    await expect(unpublishWebSite('A', 'site-b')).rejects.toThrow('El sitio no está publicado'); // B sí está publicado, pero no es de A
    await expect(archiveWebSite('A', 'site-b', true)).rejects.toThrow('El sitio ya está archivado');
    await expect(saveWebSiteContent('A', 'site-b', { theme: parseTheme({}) })).rejects.toThrow('Sitio no encontrado');
    await expect(duplicateWebSite('A', { name: 'x' }, 'site-b')).rejects.toThrow('Sitio no encontrado');
    await expect(setWebSiteDomain('A', 'site-b', 'robado.cl')).rejects.toThrow('Sitio no encontrado');

    expect(fake.untouched()).toBe(true);
    expect(fake.byId('webSite', 'site-b')).toMatchObject({ status: 'PUBLISHED', customDomain: 'b.cl' });
  });

  it('createWebSite: no permite asociar un cliente de B', async () => {
    jest.spyOn(delegateOf('webSite'), 'create').mockImplementation((() => {
      throw new Error('no debería crear');
    }) as never);
    await expect(createWebSite('A', { name: 'x' }, { name: 'Sitio nuevo', kind: 'BLANK', mode: 'GUIDED', contactId: 'contact-b' })).rejects.toThrow(
      'El cliente seleccionado no existe'
    );
  });
});

describe('versión del contenido: la edición simultánea no se confunde con otros cambios del sitio', () => {
  it('getWebSite entrega como version la del contenido (contentUpdatedAt), no la de la última escritura (updatedAt)', async () => {
    db.webSite.findFirst.mockResolvedValue(siteRow());
    db.webSiteMessage.count.mockResolvedValue(0);

    const site = await getWebSite(COMPANY, SITE);

    expect(site!.version).toBe('2020-01-01T00:00:00.123Z');
    expect(site!.version).not.toBe('2026-09-02T10:00:00.123Z');
  });

  it('publicar, tocar ajustes, despublicar y archivar NO estampan una nueva versión de contenido', async () => {
    db.webSite.findFirst.mockResolvedValue({ id: SITE, slug: 'solar-sur' });
    db.webSite.updateMany.mockResolvedValue({ count: 1 });

    await updateWebSiteSettings(COMPANY, SITE, { name: 'Solar Sur', slug: 'solar-sur', indexable: true });
    await unpublishWebSite(COMPANY, SITE);
    await archiveWebSite(COMPANY, SITE, true);

    expect(db.webSite.updateMany).toHaveBeenCalledTimes(3);
    for (const [args] of db.webSite.updateMany.mock.calls) expect((args as { data: Row }).data).not.toHaveProperty('contentUpdatedAt');
  });

  it('despublicar y archivar filtran por empresa y por el estado esperado; sin coincidencia lanzan error', async () => {
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    await unpublishWebSite(COMPANY, SITE);
    expect(argsOf(db.webSite.updateMany, 0)).toEqual({ where: { id: SITE, companyId: COMPANY, status: 'PUBLISHED' }, data: { status: 'DRAFT' } });

    await archiveWebSite(COMPANY, SITE, true);
    expect(argsOf(db.webSite.updateMany, 1)).toEqual({ where: { id: SITE, companyId: COMPANY, status: { not: 'ARCHIVED' } }, data: { status: 'ARCHIVED' } });

    await archiveWebSite(COMPANY, SITE, false);
    expect(argsOf(db.webSite.updateMany, 2)).toEqual({ where: { id: SITE, companyId: COMPANY, status: 'ARCHIVED' }, data: { status: 'DRAFT' } });

    db.webSite.updateMany.mockResolvedValue({ count: 0 });
    await expect(unpublishWebSite(COMPANY, SITE)).rejects.toThrow('El sitio no está publicado');
    await expect(archiveWebSite(COMPANY, SITE, true)).rejects.toThrow('El sitio ya está archivado');
    await expect(archiveWebSite(COMPANY, SITE, false)).rejects.toThrow('El sitio no está archivado');
  });

  it('flujo completo: ajustes y publicación no provocan falso conflicto; dos guardados de contenido con la misma versión sí chocan y no se pisan', async () => {
    const fake = installTenantDb();
    const opened = (await getWebSite('A', 'site-a'))!;
    const v0 = opened.version;

    // Otra persona cambia ajustes y publica: `updatedAt` cambia (como @updatedAt), el contenido no.
    await updateWebSiteSettings('A', 'site-a', { name: 'Otro nombre', slug: 'sitio-a', indexable: true });
    await publishWebSite('A', 'site-a');
    expect(fake.byId('webSite', 'site-a')).toMatchObject({ name: 'Otro nombre', status: 'PUBLISHED' });
    expect((await getWebSite('A', 'site-a'))!.version).toBe(v0);

    // El primer editor guarda contenido con la versión que cargó: pasa y recibe una versión nueva.
    const first = await saveWebSiteContent('A', 'site-a', { theme: parseTheme({ primary: '#111111' }), expectedUpdatedAt: v0 });
    expect(first.version).not.toBe(v0);

    // El segundo editor también cargó v0: choca y NO pisa lo del primero.
    await expect(saveWebSiteContent('A', 'site-a', { theme: parseTheme({ primary: '#222222' }), expectedUpdatedAt: v0 })).rejects.toThrow(/Otra persona guardó cambios/);
    expect(fake.byId('webSite', 'site-a')?.theme).toEqual(parseTheme({ primary: '#111111' }));

    // Tras recargar (versión nueva) sí puede guardar.
    await saveWebSiteContent('A', 'site-a', { theme: parseTheme({ primary: '#222222' }), expectedUpdatedAt: first.version });
    expect(fake.byId('webSite', 'site-a')?.theme).toEqual(parseTheme({ primary: '#222222' }));
    // Lo publicado no cambió con ninguno de los dos guardados.
    expect((fake.byId('webSite', 'site-a')?.publishedTheme as { primary: string }).primary).toBe(parseTheme({}).primary);
  });
});

// ---------------------------------------------------------------------------
// Dominio propio
// ---------------------------------------------------------------------------

describe('setWebSiteDomain: dominio propio', () => {
  const ORIGINAL_APP_URL = process.env.APP_URL;
  const OWN_SITE = { id: SITE, customDomain: null as string | null, customDomainVerifiedAt: null as Date | null };

  beforeAll(() => {
    process.env.APP_URL = 'https://erp.aether.cl';
  });
  afterAll(() => {
    if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = ORIGINAL_APP_URL;
  });

  /** findFirst distingue la búsqueda del sitio propio de la de "dominio tomado". */
  function stubSite(site: typeof OWN_SITE | null, takenBy: { site?: boolean; project?: boolean } = {}) {
    db.webSite.findFirst.mockImplementation(async ({ where }: { where: Row }) => {
      if ('customDomain' in where) return takenBy.site ? { id: 'otro-sitio' } : null;
      return site;
    });
    db.project.findFirst.mockImplementation(async () => (takenBy.project ? { id: 'certamen-1' } : null));
  }

  beforeEach(() => {
    jest.mocked(resolve4).mockRejectedValue(Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' }));
    jest.mocked(resolveCname).mockRejectedValue(Object.assign(new Error('queryCname ENODATA'), { code: 'ENODATA' }));
  });

  it.each([
    ['una dirección IP', '192.168.0.10', /dirección IP/],
    ['localhost', 'localhost', /terminación|no es público/],
    ['un subdominio de localhost', 'app.localhost', /no es público/],
    ['un vercel.app', 'mi-sitio.vercel.app', /vercel\.app/],
    ['un vercel.sh', 'mi-sitio.vercel.sh', /vercel\.app/],
    ['un dominio sin terminación', 'sinpunto', /terminación/],
    ['una terminación de una letra', 'ejemplo.c', /terminación/],
    ['caracteres inválidos', 'mi_sitio.cl', /caracteres no válidos/],
    ['vacío', '   ', /Escribe el dominio/],
    ['el dominio de la propia plataforma', 'erp.aether.cl', /es el de la plataforma/],
    ['un subdominio de la plataforma', 'cliente.erp.aether.cl', /es el de la plataforma/],
  ])('rechaza %s (%p) sin escribir ni consultar si está tomado', async (_label, domain, message) => {
    stubSite(OWN_SITE);

    const error = await setWebSiteDomain(COMPANY, SITE, domain).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebSiteDomainError);
    expect((error as Error).message).toMatch(message);
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza un dominio que ya usa OTRO sitio web de la plataforma', async () => {
    stubSite(OWN_SITE, { site: true });

    await expect(setWebSiteDomain(COMPANY, SITE, 'minegocio.cl')).rejects.toThrow('Ese dominio ya lo usa otro sitio o certamen de la plataforma');

    const lookup = db.webSite.findFirst.mock.calls.map(([args]) => (args as { where: Row }).where).find((where) => 'customDomain' in where)!;
    expect(lookup).toEqual({ customDomain: 'minegocio.cl', NOT: { id: SITE } });
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza un dominio que ya usa un certamen (Project)', async () => {
    stubSite(OWN_SITE, { project: true });

    await expect(setWebSiteDomain(COMPANY, SITE, 'missuniversotemuco.cl')).rejects.toBeInstanceOf(WebSiteDomainError);

    expect(argsOf(db.project.findFirst).where).toEqual({ customDomain: 'missuniversotemuco.cl' });
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('un sitio que no es de la empresa de la sesión no puede tomar dominios', async () => {
    stubSite(null);
    await expect(setWebSiteDomain(OTHER_COMPANY, SITE, 'minegocio.cl')).rejects.toThrow('Sitio no encontrado');
    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: SITE, companyId: OTHER_COMPANY });
    expect(db.webSite.updateMany).not.toHaveBeenCalled();
  });

  it('guarda el dominio normalizado, sin verificar, acotado a {id, companyId}, y muestra los registros DNS a crear', async () => {
    const site = { ...OWN_SITE };
    stubSite(site);
    db.webSite.updateMany.mockImplementation(async ({ data }: { data: Row }) => {
      Object.assign(site, data);
      return { count: 1 };
    });

    const view = await setWebSiteDomain(COMPANY, SITE, ' https://WWW.MiNegocio.CL/contacto ');

    const { where, data } = argsOf(db.webSite.updateMany);
    expect(where).toEqual({ id: SITE, companyId: COMPANY });
    expect(data).toEqual({ customDomain: 'minegocio.cl', customDomainVerifiedAt: null });
    expect(view).toMatchObject({ domain: 'minegocio.cl', verifiedAt: null, automatic: false, dnsOk: false, statusError: null });
    expect(view.records.length).toBeGreaterThan(0);
    expect(resolve4).toHaveBeenCalledWith('minegocio.cl'); // apex: registro A, sin DNS real
  });

  it('si el mismo dominio ya estaba guardado no vuelve a escribir ni a preguntar si está tomado', async () => {
    stubSite({ ...OWN_SITE, customDomain: 'minegocio.cl' });

    await setWebSiteDomain(COMPANY, SITE, 'MiNegocio.cl');

    expect(db.webSite.updateMany).not.toHaveBeenCalled();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it('traduce una colisión de unicidad en la base (carrera) al mismo mensaje de dominio tomado', async () => {
    stubSite(OWN_SITE);
    db.webSite.updateMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));

    await expect(setWebSiteDomain(COMPANY, SITE, 'minegocio.cl')).rejects.toThrow('Ese dominio ya lo usa otro sitio o certamen de la plataforma');
  });

  it('cuando el DNS ya apunta a Vercel, marca el dominio verificado con updateMany acotado a la empresa', async () => {
    const site = { ...OWN_SITE, customDomain: 'minegocio.cl' };
    stubSite(site);
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    jest.mocked(resolve4).mockResolvedValue(['76.76.21.21']);

    const view = await refreshWebSiteDomain(COMPANY, SITE);

    expect(view.dnsOk).toBe(true);
    expect(view.verifiedAt).not.toBeNull();
    expect(view.records).toEqual([]);
    const { where, data } = argsOf(db.webSite.updateMany);
    expect(where).toEqual({ id: SITE, companyId: COMPANY });
    expect(data.customDomainVerifiedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Acciones: cada acción exige el permiso correcto según la matriz real de roles
// ---------------------------------------------------------------------------

describe('acciones de Sitios web: RBAC por rol', () => {
  const READ: Permission = 'websites:read';
  const WRITE: Permission = 'websites:write';
  const PUBLISH: Permission = 'websites:publish';

  const table: Array<[string, () => Promise<{ success: boolean; error?: string }>, Permission]> = [
    ['listWebSitesAction', () => actions.listWebSitesAction(), READ],
    ['getWebSiteAction', () => actions.getWebSiteAction('s'), READ],
    ['listWebSiteMessagesAction', () => actions.listWebSiteMessagesAction('s'), READ],
        ['createWebSiteAction', () => actions.createWebSiteAction({}), WRITE],
    ['saveWebSiteContentAction', () => actions.saveWebSiteContentAction('s', {}), WRITE],
    ['updateWebSiteSettingsAction', () => actions.updateWebSiteSettingsAction('s', {}), WRITE],
    ['duplicateWebSiteAction', () => actions.duplicateWebSiteAction('s'), WRITE],
    ['listCatalogProductsAction', () => actions.listCatalogProductsAction('x'), WRITE],
    ['updateWebSiteAssetAltAction', () => actions.updateWebSiteAssetAltAction('a', { alt: 'x' }), WRITE],
    ['deleteWebSiteAssetAction', () => actions.deleteWebSiteAssetAction('a'), WRITE],
    ['setWebSiteMessageReadAction', () => actions.setWebSiteMessageReadAction('m', true), WRITE],
    ['deleteWebSiteMessageAction', () => actions.deleteWebSiteMessageAction('m'), WRITE],
    ['publishWebSiteAction', () => actions.publishWebSiteAction('s'), PUBLISH],
    ['unpublishWebSiteAction', () => actions.unpublishWebSiteAction('s'), PUBLISH],
    ['archiveWebSiteAction', () => actions.archiveWebSiteAction('s', true), PUBLISH],
    ['deleteWebSiteAction', () => actions.deleteWebSiteAction('s'), PUBLISH],
    ['setWebSiteDomainAction', () => actions.setWebSiteDomainAction('s', { domain: 'minegocio.cl' }), PUBLISH],
    ['removeWebSiteDomainAction', () => actions.removeWebSiteDomainAction('s'), PUBLISH],
    // Revisar el estado del dominio escribe en la base (verificación) y registra el dominio en el hosting: es una acción de publicar.
    ['getWebSiteDomainAction', () => actions.getWebSiteDomainAction('s'), PUBLISH],
  ];

  const DENIED = 'No autorizado para esta acción';
  const ROLES: Role[] = ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'];
  let requested: Permission[];
  let currentRole: Role;

  beforeEach(() => {
    requested = [];
    jest.mocked(requireAuthWithPermission).mockImplementation(async (permission: Permission) => {
      requested.push(permission);
      if (!checkPermission(currentRole, permission)) throw new AuthError(DENIED, 403);
      return { id: 'u1', companyId: COMPANY, name: 'Ana', email: 'ana@x.cl', role: currentRole, permissions: resolvePermissions({ role: currentRole, customRolePermissions: null, features: { ...DEFAULT_FEATURES, hasWebSites: true } }) } as never;
    });
  });

  it('la tabla cubre TODAS las acciones exportadas (una acción nueva sin permiso declarado rompe este test)', () => {
    const exported = Object.entries(actions)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();
    expect(table.map(([name]) => name).sort()).toEqual(exported);
  });

  it.each(table)('%s exige el permiso esperado y ningún otro', async (_name, run, permission) => {
    currentRole = 'OWNER';
    await run();
    expect(requested).toEqual([permission]);
  });

  describe.each(ROLES)('rol %s', (role) => {
    it.each(table)('%s: se permite o se rechaza según la matriz, antes de tocar la base', async (_name, run, permission) => {
      currentRole = role;
      const result = await run();

      if (rolesWithPermission(permission).includes(role)) {
        // Pasó el guard: el error (si lo hay) viene de la base simulada o de la validación, no de la autorización.
        expect(result.error).not.toBe(DENIED);
      } else {
        expect(result).toEqual({ success: false, error: DENIED });
        for (const model of Object.values(db)) for (const mock of Object.values(model as Mocks)) expect(mock).not.toHaveBeenCalled();
      }
    });
  });

  it('un vendedor (SALES) arma y edita pero NO puede publicar, archivar, eliminar ni cambiar el dominio', async () => {
    currentRole = 'SALES';
    for (const [name, run, permission] of table) {
      const result = await run();
      if (permission === PUBLISH) expect({ name, result }).toEqual({ name, result: { success: false, error: DENIED } });
      else expect({ name, denied: result.error === DENIED }).toEqual({ name, denied: false });
    }
  });

  describe('updateWebSiteSettingsAction en un sitio PUBLICADO: cambiar nombre, dirección, SEO o logo es publicar', () => {
    const SETTINGS = { name: 'Solar Sur', slug: 'solar-sur', indexable: true };
    const BLOCKED = /Este sitio está publicado: solo dueño y administradores pueden cambiar/;

    function siteInState(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
      // getWebSite usa include; updateWebSiteSettings usa select.
      db.webSite.findFirst.mockImplementation(async (args: { include?: unknown }) => (args.include ? siteRow({ status }) : { id: SITE, slug: 'solar-sur' }));
      db.webSiteMessage.count.mockResolvedValue(0);
      db.webSite.updateMany.mockResolvedValue({ count: 1 });
    }

    it('SALES (websites:write sin websites:publish) NO puede cambiar los ajustes de un sitio publicado, y no se escribe nada', async () => {
      currentRole = 'SALES';
      siteInState('PUBLISHED');

      const result = await actions.updateWebSiteSettingsAction(SITE, SETTINGS);

      expect(result).toEqual({ success: false, error: expect.stringMatching(BLOCKED) });
      expect(db.webSite.updateMany).not.toHaveBeenCalled();
    });

    it.each(['OWNER', 'ADMIN'] as Role[])('%s sí puede cambiarlos', async (role) => {
      currentRole = role;
      siteInState('PUBLISHED');

      const result = await actions.updateWebSiteSettingsAction(SITE, SETTINGS);

      expect(result).toMatchObject({ success: true, data: { slug: 'solar-sur' } });
      expect(db.webSite.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each(['DRAFT', 'ARCHIVED'] as const)('SALES sí puede editar los ajustes de un sitio en estado %s (nadie lo ve en vivo)', async (status) => {
      currentRole = 'SALES';
      siteInState(status);

      const result = await actions.updateWebSiteSettingsAction(SITE, SETTINGS);

      expect(result.success).toBe(true);
      expect(db.webSite.updateMany).toHaveBeenCalledTimes(1);
    });

    it('la regla es por permiso, no por rol: un rol personalizado con websites:publish sí puede, y uno sin él no', async () => {
      currentRole = 'SALES';
      const custom = (permissions: Permission[]) =>
        jest.mocked(requireAuthWithPermission).mockResolvedValue({ id: 'u1', companyId: COMPANY, name: 'Ana', email: 'a@x.cl', role: 'SALES', permissions } as never);

      custom(['websites:read', 'websites:write', 'websites:publish']);
      siteInState('PUBLISHED');
      expect((await actions.updateWebSiteSettingsAction(SITE, SETTINGS)).success).toBe(true);

      db.webSite.updateMany.mockClear();
      custom(['websites:read', 'websites:write']);
      const denied = await actions.updateWebSiteSettingsAction(SITE, SETTINGS);
      expect(denied).toEqual({ success: false, error: expect.stringMatching(BLOCKED) });
      expect(db.webSite.updateMany).not.toHaveBeenCalled();
    });

    it('un sitio que no es de la empresa no se salta la regla: sigue fallando con "Sitio no encontrado" y sin escribir', async () => {
      currentRole = 'SALES';
      db.webSite.findFirst.mockResolvedValue(null);

      const result = await actions.updateWebSiteSettingsAction('site-de-otra-empresa', SETTINGS);

      expect(result).toEqual({ success: false, error: 'Sitio no encontrado' });
      expect(db.webSite.updateMany).not.toHaveBeenCalled();
    });

    it('sigue exigiendo websites:write: un rol sin él ni siquiera llega a leer el sitio', async () => {
      currentRole = 'ACCOUNTANT';
      siteInState('PUBLISHED');

      const result = await actions.updateWebSiteSettingsAction(SITE, SETTINGS);

      expect(result).toEqual({ success: false, error: DENIED });
      expect(db.webSite.findFirst).not.toHaveBeenCalled();
    });
  });

  it('un módulo fuera del plan responde con el mensaje de plan, no con "error inesperado"', async () => {
    const { ModuleNotEnabledError } = jest.requireActual('@/lib/auth/guards') as typeof import('@/lib/auth/guards');
    jest.mocked(requireAuthWithPermission).mockRejectedValue(new ModuleNotEnabledError('hasWebSites'));
    await expect(actions.publishWebSiteAction('s')).resolves.toEqual({
      success: false,
      error: 'Módulo no incluido en tu plan actual. Contacta al administrador para habilitarlo',
    });
  });
});

describe('acciones que eliminan: limpieza de archivos del almacenamiento', () => {
  const U1 = 'https://blob.test/web-sites/company-a/site-1/uno.png';
  const U2 = 'https://blob.test/web-sites/company-a/site-1/dos.png';

  beforeEach(() => {
    jest.mocked(requireAuthWithPermission).mockResolvedValue({
      id: 'u1',
      companyId: COMPANY,
      name: 'Ana',
      email: 'ana@x.cl',
      role: 'ADMIN',
      permissions: resolvePermissions({ role: 'ADMIN', customRolePermissions: null, features: { ...DEFAULT_FEATURES, hasWebSites: true } }),
    } as never);
  });

  /** getWebSite lee con include; deleteWebSite lee con select (estado, dominio y archivos). */
  function siteToDelete(assets: Array<{ url: string }>, over: Row = {}) {
    db.webSite.findFirst.mockImplementation(async (args: { include?: unknown }) => (args.include ? siteRow() : { status: 'DRAFT', customDomain: 'solar.cl', assets, ...over }));
    db.webSiteMessage.count.mockResolvedValue(0);
    db.webSite.deleteMany.mockResolvedValue({ count: 1 });
  }

  it('deleteWebSiteAction borra del almacenamiento solo las URL que ninguna otra fila DE LA EMPRESA usa', async () => {
    siteToDelete([{ url: U1 }, { url: U2 }]);
    db.webSiteAsset.findMany.mockResolvedValue([{ url: U1 }]); // una copia del sitio todavía usa U1
    jest.mocked(del).mockResolvedValue(undefined);

    const result = await actions.deleteWebSiteAction(SITE);

    expect(result).toMatchObject({ success: true });
    expect(argsOf(db.webSite.deleteMany).where).toEqual({ id: SITE, companyId: COMPANY });
    expect(argsOf(db.webSiteAsset.findMany).where).toEqual({ companyId: COMPANY, url: { in: [U1, U2] } });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith([U2]);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, action: 'DELETE', entity: 'WebSite', entityId: SITE }));
  });

  it('si otra fila sigue usando todas las URL, no se borra ningún archivo', async () => {
    siteToDelete([{ url: U1 }]);
    db.webSiteAsset.findMany.mockResolvedValue([{ url: U1 }]);

    await actions.deleteWebSiteAction(SITE);

    expect(del).not.toHaveBeenCalled();
  });

  it('un sitio sin imágenes no consulta la biblioteca ni borra archivos', async () => {
    siteToDelete([]);
    await actions.deleteWebSiteAction(SITE);
    expect(db.webSiteAsset.findMany).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('si falla el borrado de archivos, el sitio ya eliminado NO se convierte en error: se reporta y se responde éxito', async () => {
    siteToDelete([{ url: U2 }]);
    db.webSiteAsset.findMany.mockResolvedValue([]);
    jest.mocked(del).mockRejectedValue(new Error('R2 timeout'));

    const result = await actions.deleteWebSiteAction(SITE);

    expect(result).toMatchObject({ success: true });
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'R2 timeout' }), expect.objectContaining({ module: 'sitios-web', companyId: COMPANY }));
  });

  it('un sitio publicado no se elimina: no se borra ni fila ni archivo', async () => {
    siteToDelete([{ url: U2 }], { status: 'PUBLISHED' });

    const result = await actions.deleteWebSiteAction(SITE);

    expect(result).toEqual({ success: false, error: 'Despublica el sitio antes de eliminarlo.' });
    expect(db.webSite.deleteMany).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  describe('deleteWebSiteAssetAction', () => {
    const emptySite = { draftBlocks: [], publishedBlocks: null, logoUrl: null, ogImageUrl: null, draftHtml: null, publishedHtml: null };
    function asset(sharedByOthers: number) {
      db.webSiteAsset.findFirst.mockResolvedValue({ id: 'asset-1', companyId: COMPANY, siteId: SITE, url: U1, site: emptySite });
      db.webSiteAsset.deleteMany.mockResolvedValue({ count: 1 });
      db.webSiteAsset.count.mockResolvedValue(sharedByOthers);
    }

    it('borra el archivo del almacenamiento cuando ninguna otra fila lo comparte', async () => {
      asset(0);
      jest.mocked(del).mockResolvedValue(undefined);

      await expect(actions.deleteWebSiteAssetAction('asset-1')).resolves.toMatchObject({ success: true });

      expect(del).toHaveBeenCalledWith(U1);
    });

    it('conserva el archivo si otra fila (p. ej. una copia del sitio) lo comparte', async () => {
      asset(1);
      await expect(actions.deleteWebSiteAssetAction('asset-1')).resolves.toMatchObject({ success: true });
      expect(del).not.toHaveBeenCalled();
    });

    it('si el borrado del archivo falla, la imagen ya eliminada no se reporta como error', async () => {
      asset(0);
      jest.mocked(del).mockRejectedValue(new Error('R2 timeout'));

      await expect(actions.deleteWebSiteAssetAction('asset-1')).resolves.toMatchObject({ success: true });
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('una imagen que todavía se usa en el sitio no se elimina ni del almacenamiento', async () => {
      db.webSiteAsset.findFirst.mockResolvedValue({ id: 'asset-1', companyId: COMPANY, siteId: SITE, url: U1, site: { ...emptySite, logoUrl: U1 } });

      const result = await actions.deleteWebSiteAssetAction('asset-1');

      expect(result).toMatchObject({ success: false });
      expect(db.webSiteAsset.deleteMany).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Permisos del módulo y módulo contratado
// ---------------------------------------------------------------------------

describe('permisos de Sitios web con la matriz real', () => {
  const FULL: CompanyFeatureFlags = { ...DEFAULT_FEATURES, hasWebSites: true };
  const WITHOUT: CompanyFeatureFlags = { ...FULL, hasWebSites: false };
  const WEBSITE_PERMISSIONS: Permission[] = ['websites:read', 'websites:write', 'websites:publish'];

  it("'websites:publish' NO está disponible para SALES, WAREHOUSE ni ACCOUNTANT, pero sí para OWNER y ADMIN", () => {
    for (const role of ['SALES', 'WAREHOUSE', 'ACCOUNTANT'] as Role[]) expect(checkPermission(role, 'websites:publish')).toBe(false);
    for (const role of ['OWNER', 'ADMIN'] as Role[]) expect(checkPermission(role, 'websites:publish')).toBe(true);
    expect(rolesWithPermission('websites:publish').sort()).toEqual(['ADMIN', 'OWNER']);
  });

  it("'websites:read' y 'websites:write' incluyen a SALES (además de OWNER y ADMIN) y excluyen a bodega y contabilidad", () => {
    for (const permission of ['websites:read', 'websites:write'] as Permission[]) {
      expect(checkPermission('SALES', permission)).toBe(true);
      expect(checkPermission('OWNER', permission)).toBe(true);
      expect(checkPermission('ADMIN', permission)).toBe(true);
      expect(checkPermission('WAREHOUSE', permission)).toBe(false);
      expect(checkPermission('ACCOUNTANT', permission)).toBe(false);
    }
  });

  it('con hasWebSites=true, cada rol recibe exactamente sus permisos del módulo', () => {
    const granted = (role: Role) => resolvePermissions({ role, customRolePermissions: null, features: FULL }).filter((p) => p.startsWith('websites:'));
    expect(granted('OWNER').sort()).toEqual([...WEBSITE_PERMISSIONS].sort());
    expect(granted('ADMIN').sort()).toEqual([...WEBSITE_PERMISSIONS].sort());
    expect(granted('SALES').sort()).toEqual(['websites:read', 'websites:write']);
    expect(granted('WAREHOUSE')).toEqual([]);
    expect(granted('ACCOUNTANT')).toEqual([]);
  });

  it('con hasWebSites=false los permisos websites:* quedan deshabilitados para TODOS los roles, incluido el OWNER', () => {
    for (const role of ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'] as Role[]) {
      const permissions = resolvePermissions({ role, customRolePermissions: null, features: WITHOUT });
      for (const permission of WEBSITE_PERMISSIONS) expect({ role, permission, has: permissions.includes(permission) }).toEqual({ role, permission, has: false });
    }
    // Lo demás sigue: la empresa no queda inutilizable por no tener el módulo.
    expect(resolvePermissions({ role: 'OWNER', customRolePermissions: null, features: WITHOUT })).toContain('settings:users');
  });

  it('un rol personalizado no puede otorgar websites:* si el módulo no está contratado', () => {
    const custom = ['websites:read', 'websites:write', 'websites:publish', 'contacts:read'];
    expect(resolvePermissions({ role: 'SALES', customRolePermissions: custom, features: WITHOUT })).toEqual(['contacts:read']);
    expect(sanitizePermissions(custom, WITHOUT)).toEqual(['contacts:read']);
    expect(sanitizePermissions(custom, FULL).sort()).toEqual([...custom].sort());
  });

  it('los tres permisos pertenecen al módulo hasWebSites y existen en la matriz', () => {
    for (const permission of WEBSITE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(moduleForPermission(permission)).toBe('hasWebSites');
    }
    expect(permissionsForRole('SALES')).toEqual(expect.arrayContaining(['websites:read', 'websites:write']));
    expect(permissionsForRole('SALES')).not.toContain('websites:publish');
  });

  it('la ruta /dashboard/web-sites (y sus subrutas) figura bloqueada sin el módulo, y libre con él', () => {
    expect(blockedModuleForRoute('/dashboard/web-sites', WITHOUT)?.key).toBe('hasWebSites');
    expect(blockedModuleForRoute('/dashboard/web-sites/abc123', WITHOUT)?.key).toBe('hasWebSites');
    expect(blockedModuleForRoute('/dashboard/web-sites', FULL)).toBeUndefined();
    expect(blockedModuleForRoute('/dashboard/web-sites/abc123', FULL)).toBeUndefined();
    // No confunde prefijos parecidos.
    expect(blockedModuleForRoute('/dashboard/web-sites-report', WITHOUT)).toBeUndefined();
  });

  it('el plan mínimo no trae el módulo, y el constructor de roles solo ofrece sus casillas si está contratado', () => {
    expect(DEFAULT_FEATURES.hasWebSites).toBe(false);
    const offered = (features: CompanyFeatureFlags) => availablePermissionGroups(features).flatMap((group) => group.permissions.map((p) => p.key));
    for (const permission of WEBSITE_PERMISSIONS) {
      expect(offered(WITHOUT)).not.toContain(permission);
      expect(offered(FULL)).toContain(permission);
    }
  });

  it('el menú lateral muestra "Sitios web" solo con módulo contratado Y permiso de lectura', () => {
    const links = (role: Role, features: CompanyFeatureFlags) =>
      buildAvailableWorkspaceNav({ permissions: resolvePermissions({ role, customRolePermissions: null, features }), features, isSuperAdmin: false })
        .flatMap((group) => group.links)
        .map((link) => link.id);

    expect(links('SALES', FULL)).toContain('web-sites');
    expect(links('OWNER', FULL)).toContain('web-sites');
    expect(links('OWNER', WITHOUT)).not.toContain('web-sites');
    expect(links('ACCOUNTANT', FULL)).not.toContain('web-sites');
  });
});

// ---------------------------------------------------------------------------
// Sitios de varias páginas
// ---------------------------------------------------------------------------

describe('sitios de varias páginas', () => {
  const OTHER_COMPANY_ASSET = 'https://blob.test/web-sites/company-b/site-9/ajena.png';

  function multiPage(extra: WebSiteBlock[] = [], hidden = false): SiteDocument {
    const doc = parseSiteDocument(publishableBlocks());
    return {
      ...doc,
      pages: [
        ...doc.pages,
        { ...doc.pages[0]!, id: 'servicios', title: 'Servicios', slug: 'servicios', hidden, blocks: [{ ...createBlock('text'), heading: 'Servicios', body: 'Instalamos paneles.' } as WebSiteBlock, ...extra] },
      ],
    };
  }

  function guidedSite() {
    db.webSite.findFirst.mockResolvedValueOnce({ mode: 'GUIDED', status: 'DRAFT' });
  }

  it('guarda el documento completo y valida las imágenes de TODAS las páginas, fondos, equipo y logos', async () => {
    const cases: WebSiteBlock[] = [
      { ...createBlock('team'), items: [{ name: 'Ana', role: '', bio: '', photoUrl: 'https://cdn.evil.cl/ana.jpg' }] } as WebSiteBlock,
      { ...createBlock('logos'), items: [{ imageUrl: OTHER_COMPANY_ASSET, alt: 'x', href: '' }] } as WebSiteBlock,
      { ...createBlock('split'), heading: 'x', imageUrl: 'http://hotlink.cl/a.png' } as WebSiteBlock,
      { ...createBlock('text'), heading: 'x', style: { background: 'image', backgroundImage: 'https://tracker.evil.cl/p.png', overlay: 50, spacing: 'auto', align: 'auto' } } as WebSiteBlock,
    ];
    for (const bad of cases) {
      guidedSite();
      await expect(saveWebSiteContent(COMPANY, SITE, { document: multiPage([bad]) })).rejects.toThrow(/biblioteca del sitio/);
    }
    expect(db.webSite.updateMany).not.toHaveBeenCalled();

    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const good = { ...createBlock('team'), items: [{ name: 'Ana', role: '', bio: '', photoUrl: ASSET_URL }] } as WebSiteBlock;
    await saveWebSiteContent(COMPANY, SITE, { document: multiPage([good]) });
    const saved = argsOf(db.webSite.updateMany).data.draftBlocks as SiteDocument;
    expect(saved.pages.map((page) => page.slug)).toEqual(['', 'servicios']);
    expect(argsOf(db.webSite.updateMany).where).toMatchObject({ id: SITE, companyId: COMPANY });
  });

  it('repara al guardar lo que el navegador no debió mandar (inicio con dirección u oculta, direcciones repetidas o reservadas)', async () => {
    guidedSite();
    db.webSite.updateMany.mockResolvedValue({ count: 1 });
    const doc = multiPage();
    const broken: SiteDocument = {
      ...doc,
      pages: [{ ...doc.pages[0]!, slug: 'inicio', hidden: true }, doc.pages[1]!, { ...doc.pages[1]!, id: 'otra', slug: 'servicios', blocks: [] }, { ...doc.pages[1]!, id: 'login', title: 'Login', slug: 'login', blocks: [] }],
    };
    await saveWebSiteContent(COMPANY, SITE, { document: broken });
    const saved = argsOf(db.webSite.updateMany).data.draftBlocks as SiteDocument;
    expect(saved.pages[0]).toMatchObject({ slug: '', hidden: false });
    const slugs = saved.pages.slice(1).map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain('login');
  });

  it('el público recibe el documento PUBLICADO sin las páginas ocultas en el menú, y acepta mensajes si el formulario está en otra página', async () => {
    const published = multiPage([{ ...createBlock('contact'), heading: 'Escríbenos', showForm: true } as WebSiteBlock]);
    db.webSite.findUnique.mockResolvedValue(publicRow({ publishedBlocks: published, draftBlocks: [{ ...createBlock('hero'), title: 'BORRADOR' }] }));
    const site = await getPublicWebSite('solar-sur');
    expect(site!.document.pages.map((page) => page.slug)).toEqual(['', 'servicios']);
    expect(site!.acceptsMessages).toBe(true);
    expect(JSON.stringify(site)).not.toContain('BORRADOR');

    db.webSite.findUnique.mockResolvedValue(publicRow({ publishedBlocks: multiPage([{ ...createBlock('contact'), showForm: true } as WebSiteBlock], true) }));
    // El formulario vive en una página oculta: no se publica, así que no se aceptan mensajes.
    expect((await getPublicWebSite('solar-sur'))!.acceptsMessages).toBe(false);
  });

  it('un sitio antiguo (lista de secciones) guardado de nuevo en el formato nuevo no cuenta como "cambios sin publicar"', async () => {
    const legacy = publishableBlocks();
    db.webSite.findFirst.mockResolvedValue(siteRow({ status: 'PUBLISHED', publishedBlocks: legacy, publishedTheme: {}, draftBlocks: JSON.parse(JSON.stringify(parseSiteDocument(legacy))) }));
    db.webSiteMessage.count.mockResolvedValue(0);
    const site = await service.getWebSite(COMPANY, SITE);
    expect(site!.pendingChanges).toBe(false);
    expect(homeOf(site!.document).blocks).toHaveLength(2);
  });
});

describe('createWebSite por rubro', () => {
  const input = { name: 'Gasfitería Rápida', kind: 'LANDING' as const, mode: 'GUIDED' as const, industry: 'restaurant' };

  function allowCreate() {
    db.webSite.count.mockResolvedValue(0);
    db.webSite.findFirst.mockResolvedValue(null);
    db.webSite.create.mockResolvedValue({ id: 'new-site', slug: 'gasfiteria-rapida' });
  }

  it('arma el sitio del rubro con los datos de la ficha de ESTA empresa (consulta acotada por id)', async () => {
    allowCreate();
    db.company.findFirst.mockResolvedValue({ email: 'hola@rapida.cl', phone: '+56 9 8765 4321', address: 'Los Aromos 12', comuna: 'Maipú' });
    await createWebSite(COMPANY, { name: 'Ana' }, input);

    expect(argsOf(db.company.findFirst).where).toEqual({ id: COMPANY });
    const { data } = argsOf(db.webSite.create);
    const doc = data.draftBlocks as SiteDocument;
    expect(doc.pages.length).toBeGreaterThan(1);
    const contact = doc.pages.flatMap((page) => page.blocks).find((block) => block.type === 'contact');
    expect(contact).toMatchObject({ email: 'hola@rapida.cl', phone: '+56 9 8765 4321', address: 'Los Aromos 12, Maipú' });
    expect(doc.header.ctaLabel).not.toBe('');
    expect(data.kind).toBe('CORPORATE');
  });

  it('para un cliente usa la ficha del cliente, siempre de la misma empresa', async () => {
    allowCreate();
    db.contact.findFirst.mockResolvedValueOnce({ id: 'contact-1' }).mockResolvedValueOnce({ email: 'cliente@x.cl', phone: null, address: null, comuna: null });
    await createWebSite(COMPANY, { name: 'Ana' }, { ...input, contactId: 'contact-1' });
    expect(argsOf(db.contact.findFirst, 1).where).toEqual({ id: 'contact-1', companyId: COMPANY });
    expect(db.company.findFirst).not.toHaveBeenCalled();
    const doc = argsOf(db.webSite.create).data.draftBlocks as SiteDocument;
    expect(doc.pages.flatMap((page) => page.blocks).find((block) => block.type === 'contact')).toMatchObject({ email: 'cliente@x.cl' });
  });

  it('un rubro desconocido o el modo HTML no consultan la ficha y usan el armado normal', async () => {
    allowCreate();
    await createWebSite(COMPANY, { name: 'Ana' }, { ...input, industry: 'no-existe' });
    await createWebSite(COMPANY, { name: 'Ana' }, { ...input, mode: 'HTML' });
    expect(db.company.findFirst).not.toHaveBeenCalled();
    expect(argsOf(db.webSite.create, 1).data.draftBlocks).toEqual([]);
  });
});

describe('productos del inventario para el catálogo', () => {
  it('acota por empresa, no expone costos ni stock y descarta fotos que no son de la empresa', async () => {
    const spy = jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      { id: 'p1', name: 'Mesa', sku: 'M1', description: null, brand: 'Roble', grossPrice: 119000, imageUrl: 'https://blob.test/products/company-a/m1.jpg' },
      { id: 'p2', name: 'Silla', sku: 'S1', description: 'x', brand: null, grossPrice: 0, imageUrl: 'https://blob.test/products/company-b/ajena.jpg' },
    ] as never);
    const rows = await service.listCatalogProducts(COMPANY, '  me  ');
    const args = spy.mock.calls[0]![0] as { where: Row; select: Row };
    expect(args.where).toMatchObject({ companyId: COMPANY });
    expect(Object.keys(args.select)).not.toEqual(expect.arrayContaining(['costPricePMP']));
    expect(args.select).not.toHaveProperty('costPricePMP');
    expect(args.select).not.toHaveProperty('stocks');
    expect(rows[0]).toMatchObject({ imageUrl: 'https://blob.test/products/company-a/m1.jpg', description: '' });
    expect(rows[1]!.imageUrl).toBeNull();
  });

  it('la acción exige editar sitios y además ver productos', async () => {
    jest.mocked(requireAuthWithPermission).mockResolvedValue({ id: 'u1', companyId: COMPANY, email: 'a@b.cl', name: 'Ana', permissions: ['websites:write'] } as never);
    const denied = await actions.listCatalogProductsAction('x');
    expect(denied).toEqual({ success: false, error: expect.stringMatching(/productos/) });
    expect(requireAuthWithPermission).toHaveBeenCalledWith('websites:write');
  });
});
