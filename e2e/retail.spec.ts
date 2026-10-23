import { expect, test } from '@playwright/test';
import { STATE, seedCatalog } from './bodega-support';
import { db, disableGuidedTour, owner } from './db';

/**
 * Métricas de retail y sus funcionalidades con interruptor propio. "Retail en vivo": con su interruptor
 * encendido calcula el panel de la bodega y descarga el Excel; apagado, desaparece del menú y la ruta y la
 * descarga quedan cerradas. "Stock muerto" vive adentro con su propio interruptor: se ve solo con los dos
 * encendidos. Los interruptores se cambian en la base, como lo haría la orden `modulo.activar|desactivar`
 * de la Supersuite.
 */

test.use(STATE);

type RetailFlags = { hasRetailMetrics: boolean; hasDeadStock?: boolean };
const setFlags = async (flags: RetailFlags) => {
  const { companyId } = await owner();
  await db().companyFeatures.upsert({ where: { companyId }, update: flags, create: { companyId, ...flags } });
};
const setRetail = (on: boolean) => setFlags({ hasRetailMetrics: on });

test.describe('retail en vivo', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test.afterAll(async () => {
    await setFlags({ hasRetailMetrics: false, hasDeadStock: false });
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

  test('stock muerto con su interruptor: se ve y se ajusta el umbral', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setFlags({ hasRetailMetrics: true, hasDeadStock: true });
    const { companyId } = await owner();
    await db().retailSettings.deleteMany({ where: { companyId } });

    await page.goto(`/dashboard/retail/stock-muerto?bodega=${warehouseId}`);
    await expect(page.getByRole('heading', { name: 'Stock muerto' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stock muerto' })).toBeVisible();
    await page.getByLabel('Detenido desde').selectOption('45');
    await page.getByRole('button', { name: 'Guardar ajustes' }).click();
    await expect(page.getByText('Ajustes guardados')).toBeVisible();
    await expect.poll(async () => (await db().retailSettings.findUnique({ where: { companyId } }))?.deadStockDays).toBe(45);
    await page.reload();
    await expect(page.getByLabel('Detenido desde')).toHaveValue('45');

    const response = await request.get(`/api/retail/dead-stock/export?bodega=${warehouseId}`);
    expect(response.status()).toBe(200);
    await db().retailSettings.deleteMany({ where: { companyId } });
  });

  test('stock muerto apagado: no aparece aunque Métricas de retail esté encendido', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setFlags({ hasRetailMetrics: true, hasDeadStock: false });

    await page.goto('/dashboard/retail');
    await expect(page.getByRole('link', { name: 'Retail en vivo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stock muerto' })).toHaveCount(0);
    await page.goto('/dashboard/retail/stock-muerto');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    expect((await request.get(`/api/retail/dead-stock/export?bodega=${warehouseId}`)).status()).toBe(403);
  });

  test('apagar Métricas de retail oculta también stock muerto, aunque su interruptor siga encendido', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setFlags({ hasRetailMetrics: false, hasDeadStock: true });

    await page.goto('/dashboard/retail/stock-muerto');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stock muerto' })).toHaveCount(0);
    expect((await request.get(`/api/retail/dead-stock/export?bodega=${warehouseId}`)).status()).toBe(403);
  });
});
