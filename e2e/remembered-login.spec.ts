import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, OWNER_PASSWORD } from './support';

const preferenceKey = 'aether:remembered-login';
const rememberLabel = 'Recordar mis datos en este dispositivo';
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

for (const entry of ['/login', '/bodega/ingresar']) {
  test(`${entry} recuerda el usuario entre navegador y app sin guardar la contraseña en almacenamiento local`, async ({ page }) => {
    await page.goto(entry);
    await page.getByLabel(rememberLabel).check();
    await page.locator('#username').fill(OWNER_EMAIL);
    await page.locator('#password').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(entry === '/login' ? /\/dashboard$/ : /\/bodega$/);
    const cookie = (await page.context().cookies()).find((item) => item.name === 'session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie!.expires - Date.now() / 1000).toBeLessThanOrEqual(8 * 3600);
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(7.9 * 3600);
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferenceKey);
    expect(stored).toEqual({ username: OWNER_EMAIL, remember: true });
    expect(await page.evaluate((password) => Object.values(localStorage).some((value) => value.includes(password)), OWNER_PASSWORD)).toBe(false);
    expect((await page.request.post('/api/auth/signout')).ok()).toBe(true);
    await page.goto(entry === '/login' ? '/bodega/ingresar' : '/login');
    await expect(page.locator('#username')).toHaveValue(OWNER_EMAIL);
    await expect(page.locator('#username')).toHaveAttribute('autocomplete', 'username');
    await expect(page.locator('#username')).toHaveAttribute('name', 'username');
    await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.locator('#password')).toHaveAttribute('name', 'password');
  });
}

test('permite olvidar el usuario y desactivar el recuerdo en un equipo compartido', async ({ page }) => {
  await page.addInitScript(({ key, username }) => localStorage.setItem(key, JSON.stringify({ username, remember: true })), { key: preferenceKey, username: OWNER_EMAIL });
  await page.goto('/bodega/ingresar');
  await expect(page.locator('#username')).toHaveValue(OWNER_EMAIL);
  await page.getByRole('button', { name: 'Olvidar usuario', exact: true }).click();
  await expect(page.locator('#username')).toHaveValue('');
  await expect(page.getByLabel(rememberLabel)).not.toBeChecked();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferenceKey)).toEqual({ username: '', remember: false });
});

test('una contraseña rechazada no guarda los datos del intento', async ({ page }) => {
  await page.route('**/api/auth/signin', (route) => route.fulfill({ status: 401, json: { success: false, error: 'Credenciales incorrectas' } }));
  await page.goto('/bodega/ingresar');
  await page.locator('#username').fill('incorrecto@prueba.local');
  await page.locator('#password').fill('Intento-sin-guardar-123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Credenciales incorrectas' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
});

test('solo ofrece guardar la contraseña después de completar el segundo factor', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PasswordCredential', { configurable: true, value: class {
      id: string;
      constructor(data: { id: string; password: string }) { this.id = data.id; }
    } });
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
      store: async (credential: Credential) => {
        document.documentElement.dataset.passwordSaveCount = String(Number(document.documentElement.dataset.passwordSaveCount ?? '0') + 1);
        return credential;
      },
    } });
  });
  await page.route('**/api/auth/signin', (route) => route.fulfill({ json: { success: true, data: { totpRequired: true, challengeToken: 'mock-challenge' } } }));
  await page.route('**/api/auth/verify-totp', (route) => route.fulfill({ json: { success: true, data: { redirectTo: '/login?verification=complete' } } }));
  await page.goto('/bodega/ingresar');
  await page.locator('#username').fill('segundo-factor@prueba.local');
  await page.locator('#password').fill('Prueba-solo-navegador123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#totpCode')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull();
  expect(await page.evaluate(() => document.documentElement.dataset.passwordSaveCount)).toBeUndefined();
  await page.locator('#totpCode').fill('123456');
  await page.getByRole('button', { name: 'Verificar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.passwordSaveCount)).toBe('1');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferenceKey)).toEqual({ username: 'segundo-factor@prueba.local', remember: true });
});

test('desmarcar la opción no recuerda el usuario al completar el ingreso', async ({ page }) => {
  await page.goto('/bodega/ingresar');
  await page.getByLabel(rememberLabel).uncheck();
  await page.locator('#username').fill(OWNER_EMAIL);
  await page.locator('#password').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/bodega$/);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferenceKey)).toEqual({ username: '', remember: false });
  expect((await page.request.post('/api/auth/signout')).ok()).toBe(true);
  await page.goto('/login');
  await expect(page.locator('#username')).toHaveValue('');
  await expect(page.getByLabel(rememberLabel)).not.toBeChecked();
});
