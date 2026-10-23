import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test('el botón usa el instalador y desaparece cuando el navegador confirma la instalación', async ({ page }) => {
  await page.goto('/bodega/ingresar');
  const button = page.getByRole('button', { name: 'Descargar app', exact: true });
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => { document.documentElement.dataset.installPrompt = 'opened'; } },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    });
    window.dispatchEvent(event);
  });
  await button.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.installPrompt)).toBe('opened');
  // An accepted prompt alone does not establish that installation completed.
  await expect(button).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(button).toHaveCount(0);
});

test('cancelar no simula una instalación y permite consultar instrucciones', async ({ page }) => {
  await page.goto('/bodega/ingresar');
  const button = page.getByRole('button', { name: 'Descargar app', exact: true });
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) },
    });
    window.dispatchEvent(event);
  });
  await button.click();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('status')).toContainText('Agregar al inicio');
});

test.describe('iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  test('explica cómo guardar Bodega en la pantalla de inicio', async ({ page }) => {
    await page.goto('/bodega/ingresar');
    await page.getByRole('button', { name: 'Descargar app', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Abre esta página en Safari.');
    await expect(page.getByRole('status')).toContainText('Agregar a pantalla de inicio');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('la app abierta desde el inicio no ofrece instalarse de nuevo', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const media = original(query);
      if (query === '(display-mode: standalone)') Object.defineProperty(media, 'matches', { value: true });
      return media;
    };
  });
  await page.goto('/bodega/ingresar');
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar app', exact: true })).toHaveCount(0);
});
