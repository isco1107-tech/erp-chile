import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, OWNER_PASSWORD } from './support';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 390, height: 844 },
});

test('la app abre su propio ingreso y mantiene al usuario dentro de bodega', async ({
  page,
}) => {
  await page.goto('/bodega');
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(
    page.getByRole('heading', { name: 'Ingresa a Bodega móvil' }),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('#username').fill(OWNER_EMAIL);
  await page.locator('#password').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/bodega$/);
  await expect(
    page.getByRole('button', { name: 'Menú', exact: true }),
  ).toBeVisible();
  const quick = page.getByRole('navigation', {
    name: 'Acciones rápidas de bodega',
  });
  await expect(quick).toBeVisible();
  await quick.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Consultar producto', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Consultar producto', exact: true })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  await quick.getByRole('button', { name: /^Envíos/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Pendientes y enviados', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Volver al inicio', exact: true })
    .click();
  await expect(quick).toBeVisible();
  for (const width of [
    280, 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560,
  ]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.vercel/apps-review/bodega-390.png',
    fullPage: true,
  });
  const response = await page.request.get('/api/bodega/bootstrap');
  expect(response.status()).toBe(200);
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(page.locator('#username')).toBeVisible();
});

test('los enlaces de ingreso anteriores llegan al acceso móvil', async ({
  page,
}) => {
  await page.goto('/login?callbackUrl=%2Fbodega');
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/bodega/manifest.webmanifest',
  );
});
