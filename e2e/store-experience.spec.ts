import { expect, test } from '@playwright/test';
import { STORE_SLUG, ensureStoreDemo, fakeProductImages, seedCart, type StoreDemo } from './store-support';

let demo: StoreDemo;
test.beforeAll(async () => {
  demo = await ensureStoreDemo();
});
test.beforeEach(async ({ page }) => {
  await fakeProductImages(page);
});

test('ordena el catálogo por precio y conserva la colección al buscar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/web/${STORE_SLUG}/tienda`);
  await page.getByLabel('Ordenar', { exact: true }).selectOption('price-asc');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page).toHaveURL(/orden=price-asc/);
  const titles = page.locator('.ec-products h3');
  await expect(titles.first()).toHaveText('Harina selecta 1 kg');
  await expect(titles.last()).toHaveText('Miel de ulmo 500 g');
  await page
    .getByRole('navigation', { name: 'Colecciones' })
    .getByRole('link', { name: /Despensa/ })
    .click();
  await expect(page).toHaveURL(/orden=price-asc/);
  await page.getByRole('searchbox').fill('aceite');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(titles).toHaveCount(1);
  await expect(titles).toHaveText('Aceite de maravilla 900 ml');
  expect(new URL(page.url()).searchParams.get('coleccion')).toBe('Despensa');
  expect(new URL(page.url()).searchParams.get('orden')).toBe('price-asc');
  expect(errors).toEqual([]);
});

test('el resumen de carrito permite ajustar y eliminar, respeta el máximo y cierra con Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 5 }]);
  await page.goto(`/web/${STORE_SLUG}/tienda`);
  const trigger = page.getByRole('button', { name: 'Vista rápida del carrito', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Vista rápida del carrito' });
  await expect(drawer.getByRole('link', { name: 'Harina selecta 1 kg', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Sumar una unidad de Harina selecta 1 kg' }).click();
  await expect(drawer.getByRole('button', { name: 'Sumar una unidad de Harina selecta 1 kg' })).toBeDisabled();
  await expect(drawer.locator('output')).toHaveText('6');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('button', { name: 'Eliminar Harina selecta 1 kg' }).click();
  await expect(drawer.getByRole('heading', { name: 'Aquí empieza tu próxima compra' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Ver carrito y continuar' })).toHaveCount(0);
});

test('amplía la foto y Comprar ahora suma la cantidad elegida a un carrito existente', async ({ page }) => {
  await seedCart(page, [{ productId: demo.productIds['aceite-maravilla']!, quantity: 1 }]);
  await page.goto(`/web/${STORE_SLUG}/producto/aceite-maravilla`);
  await page.getByRole('button', { name: 'Ver foto 2 de 3' }).click();
  await page.getByRole('button', { name: 'Ampliar foto del producto' }).click();
  const photo = page.getByRole('dialog', { name: /Foto ampliada/ });
  await expect(photo.getByRole('img')).toHaveAttribute('src', /aceite-maravilla-2/);
  await page.keyboard.press('Escape');
  await expect(photo).toHaveCount(0);
  await page.getByRole('button', { name: 'Una unidad más', exact: true }).click();
  await page.getByRole('link', { name: 'Comprar ahora', exact: true }).click();
  await expect(page).toHaveURL(/finalizar-compra$/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Aceite de maravilla 900 ml' })).toContainText('× 3');
  await expect(page.getByRole('listitem').filter({ hasText: 'Aceite de maravilla 900 ml' })).toContainText('$11.970');
  const lines = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), `aether-cart:${STORE_SLUG}`);
  expect(lines).toEqual([{ productId: demo.productIds['aceite-maravilla'], quantity: 3 }]);
});

test('un corte al actualizar el carrito bloquea continuar y permite recuperarse sin perder los productos', async ({ page }) => {
  await seedCart(page, [{ productId: demo.productIds['aceite-maravilla']!, quantity: 1 }]);
  let offline = false;
  await page.route(`**/api/public/store/${STORE_SLUG}/quote`, async (route) => {
    if (offline) await route.abort('failed');
    else await route.continue();
  });
  await page.goto(`/web/${STORE_SLUG}/carrito`);
  const proceed = page.getByText('Continuar con la compra', { exact: true });
  await expect(proceed).toHaveAttribute('href', /finalizar-compra$/);
  offline = true;
  await page.getByRole('button', { name: 'Una unidad más', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
  await expect(proceed).toHaveAttribute('aria-disabled', 'true');
  await expect(proceed).not.toHaveAttribute('href');
  offline = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(proceed).toHaveAttribute('href', /finalizar-compra$/);
  await expect(page.locator('output')).toHaveText('2');
});
