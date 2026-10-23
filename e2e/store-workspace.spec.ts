import { expect, test } from '@playwright/test';
import { db, disableGuidedTour } from './db';
import { OWNER_STATE } from './support';
import { ensureStoreDemo, fakeProductImages, STORE_SLUG } from './store-support';

let companyId = '';
let siteId = '';
let createdSlug = '';

test.use({ storageState: OWNER_STATE });
test.beforeAll(async () => {
  const demo = await ensureStoreDemo();
  companyId = demo.companyId;
  await db().companyFeatures.update({ where: { companyId }, data: { hasWebSites: false, hasEcommerce: true } });
});
test.beforeEach(async ({ context, page }) => {
  await disableGuidedTour(context);
  await fakeProductImages(page);
});
test.afterAll(async () => {
  if (companyId) await db().companyFeatures.update({ where: { companyId }, data: { hasWebSites: true } });
  if (siteId) await db().webSite.delete({ where: { id: siteId } });
});

test('crea y personaliza una tienda desde Ecommerce, sin contratar ni entrar a Sitios web', async ({ page, request }) => {
  await page.goto('/dashboard/store');
  await expect(page.getByRole('heading', { name: 'Tienda en línea', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sitios web', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Nueva tienda', exact: true }).click();
  createdSlug = `estudio-e2e-${Date.now()}`;
  await page.getByLabel('Nombre de la tienda', { exact: true }).fill('Estudio Aurea');
  await page.getByLabel('Dirección corta (opcional)').fill(createdSlug);
  await page.getByRole('button', { name: 'Crear mi tienda', exact: true }).click();
  await expect(page).toHaveURL(/sitio=.*tab=products/);
  siteId = new URL(page.url()).searchParams.get('sitio')!;
  const store = await db().webSiteStore.findUniqueOrThrow({ where: { siteId } });
  expect(store.standalone).toBe(true);
  expect(store.enabled).toBe(false);
  await expect(page.getByRole('button', { name: 'Abrir la tienda', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Diseño y dominio', exact: true }).click();
  await expect(page.getByLabel('Nombre de tu marca')).toHaveValue('Estudio Aurea');
  await page.getByLabel('Presentación breve').fill('Una selección hecha para disfrutar todos los días.');
  await page.getByRole('button', { name: 'Guardar identidad', exact: true }).click();
  await expect(page.getByText('Identidad de la tienda actualizada')).toBeVisible();

  // Fixture: one published product and a real pickup/payment setup, keeping all economic logic in the app.
  const source = await db().storeProduct.findFirstOrThrow({ where: { companyId, site: { slug: STORE_SLUG } }, orderBy: { createdAt: 'asc' } });
  await db().storeProduct.create({ data: { companyId, siteId, productId: source.productId, slug: source.slug, published: true, images: source.images! } });
  await db().webSiteStore.update({
    where: { siteId },
    data: { enabled: true, pickupEnabled: true, pickupAddress: 'Temuco, Chile', paymentMethods: ['PAY_ON_PICKUP'], shippingEnabled: false },
  });
  await page.goto(`/web/${createdSlug}`);
  await expect(page).toHaveURL(new RegExp(`/web/${createdSlug}/tienda$`));
  await expect(page.getByRole('link', { name: 'Estudio Aurea', exact: true }).first()).toBeVisible();
  const quote = await request.post(`/api/public/store/${createdSlug}/quote`, { data: { lines: [{ productId: source.productId, quantity: 1 }] } });
  expect(quote.status()).toBe(200);
  expect((await quote.json()).success).toBe(true);
});

test('la tienda existente sigue vendiendo con el módulo Ecommerce por sí solo', async ({ page }) => {
  await page.goto(`/web/${STORE_SLUG}/tienda`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aceite de maravilla 900 ml' }).first()).toBeVisible();
});
