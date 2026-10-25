import { expect, test } from '@playwright/test';

/**
 * Cada app instalable es independiente: tener una instalada (o estar dentro de su
 * ventana) no hace pasar por instalada a otra. No necesita sesión ni base de datos.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

const apps = [
  { path: '/bodega/ingresar', other: 'control', install: 'Descargar app', installed: null },
  { path: '/control/ingresar', other: 'erp', install: 'Instalar Aether Control', installed: 'Aether Control instalada' },
  { path: '/pos/ingresar', other: 'bodega', install: 'Instalar Aether POS', installed: 'Aether POS instalada' },
  { path: '/proveedor/cuenta/ingresar', other: 'erp', install: 'Instalar Seller Center', installed: 'Seller Center instalada' },
] as const;

/** La ventana se ve como una app instalada («standalone»), marcada como abierta por `mark` si se indica. */
async function standaloneWindow(page: import('@playwright/test').Page, mark?: string) {
  await page.addInitScript((value) => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const media = original(query);
      if (query === '(display-mode: standalone)') Object.defineProperty(media, 'matches', { value: true });
      return media;
    };
    if (value) sessionStorage.setItem('aether:pwa-window', value);
  }, mark);
}

for (const app of apps) {
  test(`${app.path}: abierta desde su ícono es la app instalada; dentro de la ventana de otra app no`, async ({ page }) => {
    await standaloneWindow(page, app.other);
    await page.goto(app.path);
    await expect(page.getByRole('button', { name: app.install, exact: true })).toBeVisible();
  });

  test(`${app.path}: en una pestaña normal ofrece instalar`, async ({ page }) => {
    await page.goto(app.path);
    await expect(page.getByRole('button', { name: app.install, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  if (app.installed) {
    test(`${app.path}: abierta desde su propio ícono muestra que ya está instalada`, async ({ page }) => {
      await standaloneWindow(page);
      await page.goto(app.path);
      await expect(page.getByRole('button', { name: app.installed, exact: true })).toBeDisabled();
    });
  }
}

test('cada app declara su propio manifest, su ícono y su nombre en la pantalla de inicio', async ({ page }) => {
  const seen = new Set<string>();
  for (const app of apps) {
    await page.goto(app.path);
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await page.request.get(manifestUrl!)).json();
    expect(manifest.scope).not.toBe('/');
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    // El ícono de iOS es de la misma app que el del manifest (mismo prefijo `<app>-`).
    const prefix = (file: string) => file.split('/').pop()!.split('-')[0];
    expect(prefix(apple!)).toBe(prefix(manifest.icons[0].src));
    for (const key of [manifest.id, apple, manifest.short_name]) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe(manifest.short_name);
  }
});

test('sin señal, la app instalada muestra su pantalla de «Sin conexión»', async ({ page, context }) => {
  await page.goto('/pos/ingresar');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto('/pos/ingresar').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);
});
