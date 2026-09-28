import { expect, test, type Page } from '@playwright/test';
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

// Modo contingencia (docs/adr/0002): la cajera sigue vendiendo sin conexión,
// entrega un comprobante provisorio y la venta queda registrada sola al
// volver la red. Datos de e2e/fixtures/seed-e2e.ts: turno ya abierto y un
// producto sin control de stock.
const CASHIER_EMAIL = 'cajero@prueba.local';
const POS_PRODUCT_SKU = 'E2E-CAFE';

async function dismissTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Omitir' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function shiftSalesCount(page: Page): Promise<number> {
  await page.locator('[role="tab"]', { hasText: 'Caja y arqueo' }).click();
  const heading = page.locator('h2', { hasText: 'Ventas del turno' });
  await expect(heading).toBeVisible();
  const count = Number((await heading.textContent())?.match(/\((\d+)\)/)?.[1]);
  await page.locator('[role="tab"]', { hasText: 'Vender' }).click();
  return count;
}

test.describe('venta sin conexión', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('se cobra sin conexión con comprobante provisorio y se registra al volver la red', async ({ page, context }) => {
    await login(page, CASHIER_EMAIL, OWNER_PASSWORD);
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard/pos');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Ya controlada por el service worker: la pantalla y el catálogo quedan guardados.
    await page.reload();
    await dismissTour(page);
    await expect(page.locator('h1', { hasText: 'Punto de Venta' })).toBeVisible();
    await expect(page.getByText('El lector de código de barras agrega el producto al instante.')).toBeVisible();
    const before = await shiftSalesCount(page);

    await context.setOffline(true);
    try {
      await page.reload();
      await dismissTour(page);
      await expect(page.getByText(/sigues vendiendo en modo contingencia/)).toBeVisible();

      const search = page.locator('#pos-search');
      await search.fill(POS_PRODUCT_SKU);
      await search.press('Enter');
      await page.locator('button', { hasText: 'Exacto' }).click();
      await page.locator('button', { hasText: /^Cobrar \$2\.380/ }).click();
      // Si el navegador todavía se cree en línea, la venta falla por red y se ofrece seguir sin conexión.
      const goOffline = page.getByRole('button', { name: 'Vender sin conexión' });
      if (await goOffline.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await goOffline.click();

      await expect(page.getByText(/Venta guardada sin conexión \(P-/)).toBeVisible();
      await expect(page.locator('button', { hasText: /Reimprimir comprobante P-/ })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    await expect(page.getByText(/hechas sin conexión quedaron registradas/)).toBeVisible({ timeout: 20_000 });
    expect(await shiftSalesCount(page)).toBe(before + 1);
  });
});

// Pantalla de contingencia (bodega y compras). La empresa de prueba tiene
// Inventario pero no Compras: el Dueño ve solo "Movimiento de stock".
const STOCK_PRODUCT_SKU = 'E2E-HARINA';

async function dismissOverlays(page: Page) {
  const closeWizard = page.getByRole('button', { name: 'Cerrar', exact: true });
  if (await closeWizard.isVisible().catch(() => false)) await closeWizard.click();
  await dismissTour(page);
}

test.describe('bodega sin conexión', () => {
  test.use({ storageState: OWNER_STATE });

  test('una entrada de stock hecha sin conexión se aplica al volver la red', async ({ page, context }) => {
    await page.goto('/dashboard/contingencia');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await dismissOverlays(page);
    await expect(page.locator('h1', { hasText: 'Modo sin conexión' })).toBeVisible();
    // Datos cargados del servidor: ya quedaron guardados en el equipo.
    await expect(page.locator('#offline-stock-product')).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      await dismissOverlays(page);
      await expect(page.getByText(/Usando los datos guardados en este equipo/)).toBeVisible();
      await page.locator('#offline-stock-product').fill(STOCK_PRODUCT_SKU);
      await page.locator('#offline-stock-quantity').fill('5');
      await page.locator('#offline-stock-cost').fill('1000');
      await page.locator('button[type="submit"]', { hasText: 'Registrar entrada' }).click();
      await expect(page.getByText('Entrada 5 × Harina E2E: guardado en este equipo')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    await expect(page.getByText(/hechas sin conexión quedaron registradas/)).toBeVisible({ timeout: 20_000 });
  });
});
