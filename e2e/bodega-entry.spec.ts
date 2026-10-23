import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, OWNER_PASSWORD } from './support';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test('la app abre su propio ingreso y mantiene al usuario dentro de bodega', async ({ page }) => {
  await page.goto('/bodega');
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(page.getByRole('heading', { name: 'Ingresa a Bodega móvil' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#username').fill(OWNER_EMAIL);
  await page.locator('#password').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/bodega$/);
  await expect(page.getByRole('button', { name: 'Menú', exact: true })).toBeVisible();
  const response = await page.request.get('/api/bodega/bootstrap');
  expect(response.status()).toBe(200);
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(page.locator('#username')).toBeVisible();
});

test('los enlaces de ingreso anteriores llegan al acceso móvil', async ({ page }) => {
  await page.goto('/login?callbackUrl=%2Fbodega');
  await expect(page).toHaveURL(/\/bodega\/ingresar/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/bodega/manifest.webmanifest');
});
