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

type RetailFlags = { hasRetailMetrics: boolean; hasDeadStock?: boolean; hasRetailHeatmap?: boolean; hasBasketAnalysis?: boolean; hasSmartReorder?: boolean; hasPurchases?: boolean };
const setFlags = async (flags: RetailFlags) => {
  const { companyId } = await owner();
  await db().companyFeatures.upsert({ where: { companyId }, update: flags, create: { companyId, ...flags } });
};
const setRetail = (on: boolean) => setFlags({ hasRetailMetrics: on });

/**
 * Producto con 14 días de venta (2 por día) y 3 en stock en la bodega indicada, armado directo en el kardex
 * para que la reposición tenga ritmo que proyectar. La historia se rearma en cada corrida (con fechas de hoy) para
 * que no envejezca en una base reutilizada.
 */
async function ensureSellingProduct(warehouseId: string): Promise<{ id: string; name: string }> {
  const { companyId } = await owner();
  const name = 'Reposición E2E Mermelada 250 g';
  const product =
    (await db().product.findFirst({ where: { companyId, sku: 'E2E-REPO-1' }, select: { id: true } })) ??
    (await db().product.create({ data: { companyId, sku: 'E2E-REPO-1', name, netPrice: 2000, grossPrice: 2380, costPricePMP: 1000 }, select: { id: true } }));
  await db().inventoryMovement.deleteMany({ where: { companyId, productId: product.id } });
  await db().stock.deleteMany({ where: { companyId, productId: product.id } });
  const day = 86_400_000;
  const now = Date.now();
  let level = 31;
  const base = { companyId, productId: product.id, warehouseId, unitCost: 1000, previousPmp: 1000, newPmp: 1000 };
  await db().inventoryMovement.create({ data: { ...base, type: 'PURCHASE_IN', quantity: 31, totalCost: 31_000, previousStock: 0, newStock: 31, createdAt: new Date(now - 15 * day) } });
  for (let d = 14; d >= 1; d -= 1) {
    await db().inventoryMovement.create({ data: { ...base, type: 'SALE_OUT', quantity: 2, totalCost: 2000, previousStock: level, newStock: level - 2, createdAt: new Date(now - d * day) } });
    level -= 2;
  }
  await db().stock.create({ data: { companyId, productId: product.id, warehouseId, quantity: level } });
  return { id: product.id, name };
}

test.describe('retail en vivo', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test.afterAll(async () => {
    await setFlags({ hasRetailMetrics: false, hasDeadStock: false, hasRetailHeatmap: false, hasBasketAnalysis: false, hasSmartReorder: false });
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

  test('mapa de calor con su interruptor: se ve el mapa; apagado, ruta cerrada', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setFlags({ hasRetailMetrics: true, hasRetailHeatmap: true });

    await page.goto(`/dashboard/retail/mapa-de-calor?bodega=${warehouseId}&orden=menos`);
    await expect(page.getByRole('heading', { name: 'Mapa de calor' })).toBeVisible();
    await expect(page.getByTestId('retail-heatmap').getByText('Aceite Maravilla Chef 900 ml')).toBeVisible();
    await expect(page.getByText('Cómo reaccionó la venta a los cambios de precio')).toBeVisible();

    await setFlags({ hasRetailMetrics: true, hasRetailHeatmap: false });
    await page.goto('/dashboard/retail/mapa-de-calor');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mapa de calor' })).toHaveCount(0);
  });

  test('canasta cruzada con su interruptor: se ve; apagada, ruta cerrada', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setFlags({ hasRetailMetrics: true, hasBasketAnalysis: true });

    await page.goto(`/dashboard/retail/canasta?bodega=${warehouseId}`);
    await expect(page.getByRole('heading', { name: 'Canasta cruzada' })).toBeVisible();
    await expect(page.getByText('Boletas analizadas')).toBeVisible();
    await expect(page.getByText('Combos sugeridos')).toBeVisible();

    await setFlags({ hasRetailMetrics: true, hasBasketAnalysis: false });
    await page.goto('/dashboard/retail/canasta');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Canasta cruzada' })).toHaveCount(0);
  });

  test('reposición predictiva: con Compras, las cantidades sugeridas pasan a una solicitud de compra', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const product = await ensureSellingProduct(warehouseId);
    const { companyId } = await owner();
    const hadPurchases = (await db().companyFeatures.findUnique({ where: { companyId } }))?.hasPurchases ?? false;
    await setFlags({ hasRetailMetrics: true, hasSmartReorder: true, hasPurchases: true });

    await page.goto(`/dashboard/retail/reposicion?bodega=${warehouseId}`);
    await expect(page.getByRole('heading', { name: 'Reposición predictiva' })).toBeVisible();
    const row = page.getByTestId('reorder-table').getByRole('row', { name: new RegExp(product.name) });
    await expect(row.getByText('Pedir ya')).toBeVisible();
    await expect(row.getByRole('checkbox')).toBeChecked();

    // Solo este producto, para revisar la solicitud que sale.
    const checkboxes = page.getByTestId('reorder-table').getByRole('checkbox');
    for (const box of await checkboxes.all()) if (await box.isChecked()) await box.uncheck();
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Crear solicitud de compra' }).click();
    await page.waitForURL(/\/dashboard\/purchase-requests\/[^/]+$/);

    const requestId = page.url().split('/').pop()!;
    const created = await db().purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    expect(created.status).toBe('DRAFT');
    expect(created.items).toHaveLength(1);
    expect(created.items[0]).toMatchObject({ productId: product.id });
    expect(created.items[0]!.quantity).toBeGreaterThan(0);

    await setFlags({ hasRetailMetrics: true, hasSmartReorder: false, hasPurchases: hadPurchases });
    await page.goto('/dashboard/retail/reposicion');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
  });
});
