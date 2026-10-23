import { expect, test } from '@playwright/test';
import { STATE, seedCatalog } from './bodega-support';
import { db, disableGuidedTour, owner } from './db';

/**
 * "Retail en vivo" (Métricas de retail): con su interruptor encendido la pantalla calcula el panel de la
 * bodega y descarga el Excel; apagado, desaparece del menú y la ruta y la descarga quedan cerradas. El
 * interruptor se cambia en la base, como lo haría la orden `modulo.activar|desactivar` de la Supersuite.
 */

test.use(STATE);

const setRetail = async (on: boolean) => {
  const { companyId } = await owner();
  await db().companyFeatures.upsert({ where: { companyId }, update: { hasRetailMetrics: on }, create: { companyId, hasRetailMetrics: on } });
};

test.describe('retail en vivo', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test.afterAll(async () => {
    await setRetail(false);
  });

  test('encendido: muestra el panel de la bodega y descarga el Excel', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setRetail(true);

    await page.goto(`/dashboard/retail?bodega=${warehouseId}`);
    await expect(page.getByRole('heading', { name: 'Retail en vivo' })).toBeVisible();
    await expect(page.getByText(/Datos de las \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retail en vivo' })).toBeVisible();
    const table = page.getByTestId('retail-live-table');
    await expect(table.getByText('Aceite Maravilla Chef 900 ml')).toBeVisible();

    // Lo que entró sin ventas: sin ritmo de venta, no se inventan días restantes.
    await page.getByPlaceholder('Nombre, SKU, marca o categoría').fill('E2E-HAR');
    await expect(table.getByText('Harina E2E Selecta 1 kg')).toBeVisible();
    await expect(table.getByText('Aceite Maravilla Chef 900 ml')).toHaveCount(0);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Descargar Excel' }).click()]);
    expect(download.suggestedFilename()).toBe('retail-en-vivo.xlsx');
  });

  test('apagado: fuera del menú, con la ruta y la descarga cerradas', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setRetail(false);

    await page.goto('/dashboard/retail');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retail en vivo' })).toHaveCount(0);
    const response = await request.get(`/api/retail/metrics/export?bodega=${warehouseId}`);
    expect(response.status()).toBe(403);
  });
});
