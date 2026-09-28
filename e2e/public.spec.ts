import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, login } from './support';

// Sin sesión: estas pruebas no usan el estado guardado por auth.setup.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test('la pantalla de ingreso muestra el formulario', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
});

test('una ruta privada sin sesión lleva al ingreso y recuerda a dónde volver', async ({ page }) => {
  await page.goto('/dashboard/sales');
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard%2Fsales/);
});

test('una contraseña incorrecta se rechaza sin entrar al panel', async ({ page }) => {
  await login(page, OWNER_EMAIL, 'contraseña-que-no-es');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

for (const route of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/politica-privacidad', '/sw.js']) {
  test(`${route} responde`, async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
  });
}
