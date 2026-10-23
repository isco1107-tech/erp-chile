/** Real integration checks, only against an explicitly isolated local *_test database. */
import type { PrismaClient } from '@prisma/client';
import { storefrontDesign } from '@/lib/ecommerce/storefront-design';
import { allBlocks, parseSiteDocument } from '@/lib/web-sites/site';
const testUrl = process.env.WAREHOUSE_TEST_DATABASE_URL;
const safe = (() => {
  try {
    const u = new URL(testUrl ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && /_test$/.test(u.pathname);
  } catch {
    return false;
  }
})();
let session: {
  id: string;
  email: string;
  name: string;
  companyId: string;
  permissions: string[];
  features: { hasEcommerce: boolean; hasWebSites: boolean };
} | null = null;
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/auth/guards', () => {
  const actual = jest.requireActual('@/lib/auth/guards');
  return {
    ...actual,
    requireAuthWithPermission: jest.fn(async (permission: string) => {
      if (!session?.permissions.includes(permission)) throw new actual.AuthError('No autorizado', 403);
      return session;
    }),
  };
});
const describeDb = safe ? describe : describe.skip;
describeDb('creador Ecommerce: permisos, borrador y publicación independientes de ventas', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let actions: typeof import('@/modules/ecommerce/actions/store-editor.actions');
  let sites: typeof import('@/modules/web-sites/services/web-sites.service');
  let webActions: typeof import('@/modules/web-sites/actions/web-sites.actions');
  let stores: typeof import('@/modules/ecommerce/services/store-settings.service');
  let forms: typeof import('@/modules/web-sites/services/web-site-forms.service');
  let workspace: typeof import('@/modules/ecommerce/services/store-workspace.service');
  const suffix = Math.random().toString(36).slice(2, 10);
  const ids = { company: '', otherCompany: '', site: '', other: '', informative: '', product: '', asset: '' };
  const slug = `builder-${suffix}`;
  const asOwner = (companyId = ids.company, permissions = ['store:read', 'store:manage']) => {
    session = { companyId, id: 'test-owner', name: 'Dueña', email: 'test@example.cl', permissions, features: { hasEcommerce: true, hasWebSites: true } };
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    ({ prisma } = await import('@/lib/prisma'));
    actions = await import('@/modules/ecommerce/actions/store-editor.actions');
    sites = await import('@/modules/web-sites/services/web-sites.service');
    webActions = await import('@/modules/web-sites/actions/web-sites.actions');
    stores = await import('@/modules/ecommerce/services/store-settings.service');
    forms = await import('@/modules/web-sites/services/web-site-forms.service');
    workspace = await import('@/modules/ecommerce/services/store-workspace.service');
    const company = (n: string) =>
      prisma.company.create({
        data: {
          rut: `builder-${suffix}-${n}`,
          businessName: 'Aurea',
          status: 'ACTIVE',
          maxWebSites: 10,
          features: { create: { hasEcommerce: true, hasWebSites: false } },
        },
      });
    ids.company = (await company('a')).id;
    ids.otherCompany = (await company('b')).id;
    ids.site = (await workspace.createStorefront(ids.company, 'Dueña', { name: 'Aurea', slug })).id;
    ids.other = (await workspace.createStorefront(ids.otherCompany, 'Otra', { name: 'Otra', slug: `other-${suffix}` })).id;
    ids.informative = (await prisma.webSite.create({ data: { companyId: ids.company, name: 'Informativo', slug: `info-${suffix}`, draftBlocks: [] } })).id;
  });
  beforeEach(() => asOwner());
  afterAll(async () => {
    if (!prisma) return;
    const companies = [ids.company, ids.otherCompany].filter(Boolean);
    await prisma.webSite.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.product.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.$disconnect();
  });
  it('offers all visual tools with Ecommerce alone and keeps the two module lists separate', async () => {
    const editor = await actions.getStoreEditorAction(ids.site);
    expect(editor.success).toBe(true);
    if (!editor.success) throw new Error(editor.error);
    expect(editor.data.status).toBe('DRAFT');
    expect(allBlocks(editor.data.document).some((block) => block.type === 'catalog' && block.store)).toBe(true);
    const informative = await sites.listWebSites(ids.company);
    expect(informative.rows.map((row) => row.id)).toEqual([ids.informative]);
    expect(informative.counts).toEqual({ DRAFT: 1, PUBLISHED: 0, ARCHIVED: 0 });
    expect((await stores.listStoreSites(ids.company)).map((row) => row.id)).toEqual([ids.site]);
  });
  it('rejects foreign resources, informative resources, missing write permission and disabled Ecommerce', async () => {
    expect((await actions.getStoreEditorAction(ids.other)).success).toBe(false);
    expect((await actions.getStoreEditorAction(ids.informative)).success).toBe(false);
    asOwner(ids.company, ['store:read']);
    expect((await actions.saveStoreContentAction(ids.site, { document: storefrontDesign('Intruso').document })).success).toBe(false);
    expect((await actions.publishStorePagesAction(ids.site)).success).toBe(false);
    expect((await actions.hideStorePagesAction(ids.site)).success).toBe(false);
    await prisma.companyFeatures.update({ where: { companyId: ids.company }, data: { hasEcommerce: false, hasWebSites: true } });
    asOwner();
    expect((await actions.getStoreEditorAction(ids.site)).success).toBe(false);
    expect(await sites.getPublicWebSite(slug)).toBeNull();
    await prisma.companyFeatures.update({ where: { companyId: ids.company }, data: { hasEcommerce: true } });
  });
  it('website permissions cannot edit or unpublish a merchant storefront', async () => {
    asOwner(ids.company, ['websites:read', 'websites:write', 'websites:publish']);
    expect((await webActions.getWebSiteAction(ids.site)).success).toBe(false);
    expect((await webActions.saveWebSiteContentAction(ids.site, { document: storefrontDesign('Intruso').document })).success).toBe(false);
    expect((await webActions.unpublishWebSiteAction(ids.site)).success).toBe(false);
    expect((await prisma.webSite.findUniqueOrThrow({ where: { id: ids.site } })).status).toBe('PUBLISHED');
  });
  it('publishes the brand while closed, isolates subsequent drafts and hides pages without changing the commerce resource', async () => {
    expect((await actions.publishStorePagesAction(ids.site)).success).toBe(true);
    const published = await sites.getPublicWebSite(slug);
    expect(published).toMatchObject({ standaloneStore: true, storefrontHome: true, acceptsMessages: true });
    expect(allBlocks(published!.document).find((block) => block.type === 'hero')).toMatchObject({ title: 'Aurea' });
    const editor = await actions.getStoreEditorAction(ids.site);
    if (!editor.success) throw new Error(editor.error);
    const changed = storefrontDesign('Colección secreta');
    const saved = await actions.saveStoreContentAction(ids.site, { document: changed.document, theme: changed.theme, expectedUpdatedAt: editor.data.version });
    expect(saved.success).toBe(true);
    expect(allBlocks((await sites.getPublicWebSite(slug))!.document).find((block) => block.type === 'hero')).toMatchObject({ title: 'Aurea' });
    expect((await actions.saveStoreContentAction(ids.site, { document: changed.document, expectedUpdatedAt: editor.data.version })).success).toBe(false);
    expect((await actions.publishStorePagesAction(ids.site)).success).toBe(true);
    expect(allBlocks((await sites.getPublicWebSite(slug))!.document).find((block) => block.type === 'hero')).toMatchObject({ title: 'Colección secreta' });
    await prisma.webSiteStore.update({ where: { siteId: ids.site }, data: { enabled: true } });
    expect((await actions.hideStorePagesAction(ids.site)).success).toBe(true);
    expect(await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.site } })).toMatchObject({ enabled: true, homepageEnabled: false });
    expect((await sites.getPublicWebSite(slug))!.acceptsMessages).toBe(false);
    expect((await prisma.webSite.findUniqueOrThrow({ where: { id: ids.site } })).status).toBe('PUBLISHED');
  });
  it('reserves checkout URLs and rejects arbitrary HTML', async () => {
    const document = storefrontDesign('Aurea').document;
    document.pages.push({ ...document.pages[0]!, id: 'cart-page', slug: 'carrito', title: 'Carrito falso', blocks: [] });
    expect((await actions.saveStoreContentAction(ids.site, { document })).success).toBe(false);
    expect((await actions.saveStoreContentAction(ids.site, { html: '<script>x</script>' })).success).toBe(false);
    await expect(sites.saveWebSiteContent(ids.company, ids.informative, { document: storefrontDesign('Con carrito').document })).rejects.toThrow('Ecommerce');
  });
  it('separates form messages and protects product images from deletion', async () => {
    await prisma.webSiteMessage.createMany({
      data: [ids.site, ids.informative].map((siteId) => ({
        companyId: ids.company,
        siteId,
        name: 'Cliente',
        email: 'cliente@example.cl',
        message: 'Consulta',
      })),
    });
    const storeInbox = await actions.listStoreFormMessagesAction({ siteId: ids.site });
    expect(storeInbox.success && storeInbox.data.rows.map((row) => row.siteId)).toEqual([ids.site]);
    expect((await forms.listFormMessages(ids.company, {}, 'website')).rows.map((row) => row.siteId)).toEqual([ids.informative]);
    const url = `https://cdn.example.cl/web-sites/${ids.company}/product.webp`;
    ids.asset = (
      await prisma.webSiteAsset.create({
        data: { companyId: ids.company, siteId: ids.site, url, fileName: 'product.webp', mimeType: 'image/webp', sizeBytes: 10 },
      })
    ).id;
    ids.product = (
      await prisma.product.create({
        data: { companyId: ids.company, sku: 'BRAND', name: 'Producto real', netPrice: 1000, grossPrice: 1190, costPricePMP: 0, imageUrl: url },
      })
    ).id;
    const result = await actions.deleteStoreAssetAction(ids.asset);
    expect(result.success).toBe(false);
    expect(await prisma.webSiteAsset.findUnique({ where: { id: ids.asset } })).not.toBeNull();
    asOwner(ids.otherCompany);
    expect((await actions.updateStoreAssetAltAction(ids.asset, { alt: 'Intruso' })).success).toBe(false);
    expect(parseSiteDocument((await prisma.webSite.findUniqueOrThrow({ where: { id: ids.site } })).draftBlocks).pages).toHaveLength(1);
  });
});
