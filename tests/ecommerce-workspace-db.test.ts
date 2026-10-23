/** Real PostgreSQL checks for standalone stores. Only an explicitly isolated local *_test database. */
import type { PrismaClient } from '@prisma/client';
const url = process.env.WAREHOUSE_TEST_DATABASE_URL;
const safe = (() => {
  try {
    const value = new URL(url ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname) && /_test$/.test(value.pathname);
  } catch {
    return false;
  }
})();
const describeDb = safe ? describe : describe.skip;

describeDb('Ecommerce como módulo independiente', () => {
  let prisma: PrismaClient;
  let workspace: typeof import('@/modules/ecommerce/services/store-workspace.service');
  let stores: typeof import('@/modules/ecommerce/services/store-public.service');
  let websites: typeof import('@/modules/web-sites/services/web-sites.service');
  let settings: typeof import('@/modules/ecommerce/services/store-settings.service');
  let companyId = '';
  let otherCompanyId = '';
  let warehouseId = '';
  let siteId = '';
  let slug = '';
  let cheapId = '';
  let dearId = '';
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma } = await import('@/lib/prisma'));
    workspace = await import('@/modules/ecommerce/services/store-workspace.service');
    stores = await import('@/modules/ecommerce/services/store-public.service');
    websites = await import('@/modules/web-sites/services/web-sites.service');
    settings = await import('@/modules/ecommerce/services/store-settings.service');
    const company = (id: string) =>
      prisma.company.create({
        data: {
          rut: `store-${suffix}-${id}`,
          businessName: `Marca ${id}`,
          status: 'ACTIVE',
          maxWebSites: 5,
          features: { create: { hasEcommerce: true, hasWebSites: false } },
        },
      });
    companyId = (await company('a')).id;
    otherCompanyId = (await company('b')).id;
    warehouseId = (await prisma.warehouse.create({ data: { companyId, name: 'Principal', code: 'P', isDefault: true } })).id;
  });
  afterAll(async () => {
    if (prisma) {
      const ids = [companyId, otherCompanyId].filter(Boolean);
      await prisma.webSite.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.stock.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.warehouse.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.company.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  });
  it('crea su propia publicación y empieza cerrada sin exigir Sitios web', async () => {
    await expect(settings.assertStoreModule(companyId)).resolves.toBeUndefined();
    const result = await workspace.createStorefront(companyId, 'Dueña', { name: 'Marca independiente', slug: `marca-${suffix}` });
    siteId = result.id;
    slug = result.slug;
    expect(await prisma.webSiteStore.findUnique({ where: { siteId } })).toMatchObject({ standalone: true, enabled: false, warehouseId });
    expect(await stores.resolvePublicStore(slug)).toBeNull();
    await expect(settings.setStoreOpen(companyId, siteId, true)).rejects.toThrow();
  });
  it('protege la identidad de una tienda ajena y no habilita publicaciones sin tienda', async () => {
    await expect(workspace.getStoreBrand(otherCompanyId, siteId)).rejects.toThrow('Tienda no encontrada');
    await expect(
      workspace.updateStoreBrand(otherCompanyId, siteId, { name: 'Intruso', description: '', primary: '#111111', accent: '#444444' }),
    ).rejects.toThrow();
    const plain = await prisma.webSite.create({
      data: { companyId, name: 'Sitio sin módulo', slug: `sin-tienda-${suffix}`, status: 'PUBLISHED', publishedBlocks: [] },
    });
    expect(await websites.getPublicWebSite(plain.slug, true)).toBeNull();
    await prisma.webSite.delete({ where: { id: plain.id } });
  });
  it('ordena por el precio final real del ERP, incluidos exentos, aunque el precio bruto guardado sea antiguo', async () => {
    const make = async (code: string, net: number, exempt: boolean, cachedGross: number) => {
      const product = await prisma.product.create({
        data: { companyId, sku: code, name: code, netPrice: net, grossPrice: cachedGross, costPricePMP: 0, isExempt: exempt, isTrackable: true },
      });
      await prisma.stock.create({ data: { companyId, productId: product.id, warehouseId, quantity: 10 } });
      await prisma.storeProduct.create({
        data: { companyId, siteId, productId: product.id, slug: code.toLowerCase(), published: true, collection: 'Colección' },
      });
      return product.id;
    };
    cheapId = await make('EXENTO', 1000, true, 9999);
    dearId = await make('AFECTO', 1000, false, 1);
    await prisma.webSiteStore.update({
      where: { siteId },
      data: { enabled: true, pickupEnabled: true, pickupAddress: 'Temuco', paymentMethods: ['PAY_ON_PICKUP'] },
    });
    const ctx = (await stores.resolvePublicStore(slug))!;
    expect(ctx).not.toBeNull();
    const ascending = await stores.listPublicProducts(ctx, { sort: 'price-asc' });
    expect(ascending.products.map((product) => [product.id, product.grossPrice])).toEqual([
      [cheapId, 1000],
      [dearId, 1190],
    ]);
    expect((await stores.listPublicProducts(ctx, { sort: 'price-desc', limit: 1 })).products[0]?.id).toBe(dearId);
    expect((await stores.listPublicProducts(ctx, { sort: 'price-desc', limit: 1, page: 2 })).products[0]?.id).toBe(cheapId);
    expect((await stores.listPublicProducts(ctx, { sort: 'price-asc', q: "%' OR 1=1 --" })).products).toHaveLength(0);
    const literalSearch = await stores.listPublicProducts(ctx, { sort: 'price-asc', q: '%' });
    expect(literalSearch.total).toBe(0);
    expect(literalSearch.products).toHaveLength(0);
    await prisma.storeProduct.updateMany({ where: { siteId, productId: cheapId }, data: { title: 'Aceite especial' } });
    expect((await stores.listPublicProducts(ctx, { sort: 'name' })).products.map((product) => product.id)).toEqual([cheapId, dearId]);
  });
  it('el dominio propio también resuelve la tienda y su identidad sin Sitios web', async () => {
    const domain = `marca-${suffix}.example.test`;
    await prisma.webSite.update({ where: { id: siteId }, data: { customDomain: domain, customDomainVerifiedAt: new Date() } });
    expect(await stores.resolvePublicStoreByDomain(domain)).toMatchObject({ companyId, siteId });
    expect(await websites.getPublicWebSiteByDomain(domain)).toMatchObject({ id: siteId, standaloneStore: true });
  });
  it('el apagado de Ecommerce cierra también la superficie pública independiente', async () => {
    await prisma.companyFeatures.update({ where: { companyId }, data: { hasEcommerce: false } });
    expect(await stores.resolvePublicStore(slug)).toBeNull();
    expect(await websites.getPublicWebSite(slug)).toBeNull();
    await prisma.companyFeatures.update({ where: { companyId }, data: { hasEcommerce: true } });
  });
  it('dos creaciones concurrentes no exceden la cuota compartida de publicaciones', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { maxWebSites: 2 } });
    const results = await Promise.allSettled([
      workspace.createStorefront(companyId, 'Dueña', { name: 'Segunda A', slug: `segunda-a-${suffix}` }),
      workspace.createStorefront(companyId, 'Dueña', { name: 'Segunda B', slug: `segunda-b-${suffix}` }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.webSite.count({ where: { companyId } })).toBe(2);
  });
});
