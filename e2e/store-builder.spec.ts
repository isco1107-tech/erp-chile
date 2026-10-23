import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { db, disableGuidedTour } from './db';
import { OWNER_STATE } from './support';
import { ensureStoreDemo, fakeProductImages } from './store-support';
import { storefrontDesign } from '../src/lib/ecommerce/storefront-design';
import { createBlock, textBlockSchema } from '../src/lib/web-sites/blocks';
const OUT = path.join(process.cwd(), '.vercel/responsive-check-store-builder');
const slug = `marca-builder-${Date.now()}`;
let siteId = '';
let cartProductIds: string[] = [];
test.use({ storageState: OWNER_STATE });
test.beforeAll(async () => {
  const demo = await ensureStoreDemo();
  const { document, theme } = storefrontDesign('Aurea · Objetos para disfrutar cada día', 'boutique');
  document.pages.push({
    ...document.pages[0]!,
    id: 'story',
    slug: 'historia',
    title: 'Nuestra historia',
    blocks: [textBlockSchema.parse({ ...createBlock('text'), heading: 'Nuestra historia', body: 'Una selección pensada para acompañarte en lo cotidiano.' })],
  });
  const site = await db().webSite.create({
    data: {
      companyId: demo.companyId,
      name: 'Aurea',
      slug,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      draftBlocks: document as unknown as Prisma.InputJsonValue,
      publishedBlocks: document as unknown as Prisma.InputJsonValue,
      theme,
      publishedTheme: theme,
      store: {
        create: {
          companyId: demo.companyId,
          standalone: true,
          homepageEnabled: true,
          enabled: true,
          warehouseId: demo.warehouseId,
          pickupEnabled: true,
          pickupAddress: 'Temuco',
          paymentMethods: ['PAY_ON_PICKUP'],
        },
      },
    },
  });
  siteId = site.id;
  const listings = await db().storeProduct.findMany({
    where: {
      siteId: demo.siteId,
      published: true,
      productId: { in: [demo.productIds['aceite-maravilla']!, demo.productIds['miel-de-ulmo']!, demo.productIds['merken-ahumado']!] },
    },
    orderBy: { sortOrder: 'asc' },
    take: 3,
    include: { product: true },
  });
  cartProductIds = listings.map((item) => item.productId);
  await db().storeProduct.createMany({
    data: listings.map((item) => ({
      companyId: demo.companyId,
      siteId,
      productId: item.productId,
      slug: item.slug,
      published: true,
      title: item.title,
      images: item.images as Prisma.InputJsonValue,
      collection: item.collection,
      featured: true,
    })),
  });
  mkdirSync(OUT, { recursive: true });
});
test.beforeEach(async ({ page, context }) => {
  await disableGuidedTour(context);
  await fakeProductImages(page);
});
test.afterAll(async () => {
  if (siteId) await db().webSite.delete({ where: { id: siteId } });
});

test('brand pages, catalog and cart share the published identity; preview cannot alter the cart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/web/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aurea · Objetos para disfrutar cada día');
  await page.getByRole('link', { name: 'Nuestra historia', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/web/${slug}/historia$`));
  await expect(page.getByRole('heading', { name: 'Nuestra historia', exact: true })).toBeVisible();
  await page.goto(`/dashboard/store/${siteId}/editor`);
  await expect(page.getByRole('tab', { name: 'Páginas', exact: true })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Vista previa del sitio', exact: true });
  await expect(preview.locator('[data-commerce-section] .ec-product-card')).toHaveCount(3);
  await expect(preview.getByRole('button', { name: /^Agregar .+ al carrito$/ })).toHaveCount(0);
  expect(await page.evaluate((s) => localStorage.getItem(`aether-cart:${s}`), slug)).toBeNull();
  await page
    .getByRole('button', { name: /^Catálogo/ })
    .first()
    .click();
  await expect(page.getByLabel('Colección de productos')).toBeVisible();
  await page.getByLabel('Colección de productos').selectOption('Despensa');
  await expect(preview.locator('[data-commerce-section] .ec-product-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar borrador', exact: true })).toBeDisabled();
  await page.goto(`/web/${slug}`);
  // A saved selection remains draft until publication.
  await expect(page.locator('[data-commerce-section] .ec-product-card')).toHaveCount(3);
  const addedTitle = await page.locator('[data-commerce-section] .ec-product-card h3').first().innerText();
  await page
    .getByRole('button', { name: /^Agregar .+ al carrito$/ })
    .first()
    .click();
  await page.getByRole('link', { name: /Carrito, 1 unidad/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('carrito');
  await expect(page.getByText(addedTitle, { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [280, 390, 1440])
  test(`brand homepage and internal page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ shop, products }) => localStorage.setItem(`aether-cart:${shop}`, JSON.stringify(products.map((productId) => ({ productId, quantity: 1 })))),
      { shop: slug, products: cartProductIds },
    );
    for (const route of ['', '/historia', '/carrito']) {
      await page.goto(`/web/${slug}${route}`);
      await expect(page.locator('.ws-root.ec-store')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (route === '/carrito') await expect(page.getByRole('link', { name: 'Continuar con la compra', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `${width}-${route.replace('/', '') || 'portada'}.png`), fullPage: true });
    }
  });
