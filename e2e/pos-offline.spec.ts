import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, OWNER_PASSWORD, OWNER_STATE, login } from './support';

// El POS tiene que abrir aunque se caiga internet (docs/APP.md, decisión 2).
// El service worker guarda la pantalla del POS la primera vez que se abre con
// conexión; sin red, la sirve desde esa copia.

test.describe('POS sin conexión', () => {
  test.use({ storageState: OWNER_STATE });

  // Selector directo y no por rol: el asistente de configuración del Dueño
  // deja el resto de la página inerte para la accesibilidad, pero la pantalla
  // del POS está ahí debajo, que es lo que se comprueba.
  test('abre sin conexión después de haberse abierto una vez', async ({ page, context }) => {
    await page.goto('/dashboard/pos');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Ya controlada por el service worker: esta carga queda guardada.
    await page.reload();
    await expect(page.locator('h1', { hasText: 'Abrir caja' })).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator('h1', { hasText: 'Abrir caja' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('el resto del panel no se guarda: sin conexión no abre', async ({ page, context }) => {
    await page.goto('/dashboard/contacts');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    try {
      await expect(page.reload()).rejects.toThrow();
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('copia privada', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('cerrar sesión borra la copia del POS', async ({ page }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard/pos');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => caches.has('aether-pos-v1'))).toBe(true);

    // El asistente de configuración del Dueño tapa la barra lateral.
    const closeWizard = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await closeWizard.isVisible().catch(() => false)) await closeWizard.click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
    await page.waitForURL(/\/login/);
    expect(await page.evaluate(() => caches.has('aether-pos-v1'))).toBe(false);
  });
});
