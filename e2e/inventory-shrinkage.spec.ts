import { expect, test } from '@playwright/test';
import { STATE, seedCatalog } from './bodega-support';
import { db, disableGuidedTour, ensureSupplier, owner } from './db';

/**
 * Mermas con responsable (Inventario, con su propio interruptor): la pérdida de una bodega se asigna al
 * proveedor, cuenta en "Por proveedor" y se descarga a Excel; con el interruptor apagado no aparece en el
 * menú y la ruta y la descarga quedan cerradas. Los interruptores se cambian en la base, como lo haría la
 * orden `modulo.activar|desactivar` de la Supersuite.
 */

test.use(STATE);

const setShrinkage = async (on: boolean) => {
  const { companyId } = await owner();
  await db().companyFeatures.upsert({ where: { companyId }, update: { hasInventory: true, hasShrinkageLiability: on }, create: { companyId, hasInventory: true, hasShrinkageLiability: on } });
};

/** Producto de un productor con una merma de hoy en la bodega; se rearma en cada corrida. */
async function ensureLoss(warehouseId: string): Promise<{ name: string; supplier: { id: string; name: string } }> {
  const { companyId, id: userId } = await owner();
  const supplier = await ensureSupplier('Quesos E2E Llanquihue', '76111222');
  const name = 'Queso E2E Mantecoso 500 g';
  const product =
    (await db().product.findFirst({ where: { companyId, sku: 'E2E-MERMA-1' }, select: { id: true } })) ??
    (await db().product.create({ data: { companyId, sku: 'E2E-MERMA-1', name, netPrice: 5000, grossPrice: 5950, costPricePMP: 3000 }, select: { id: true } }));
  await db().productSupplier.upsert({ where: { productId_supplierId: { productId: product.id, supplierId: supplier.id } }, update: {}, create: { companyId, productId: product.id, supplierId: supplier.id } });
  await db().shrinkageLiability.deleteMany({ where: { companyId, movement: { productId: product.id } } });
  await db().inventoryMovement.deleteMany({ where: { companyId, productId: product.id } });
  const base = { companyId, productId: product.id, warehouseId, unitCost: 3000, previousPmp: 3000, newPmp: 3000 };
  await db().inventoryMovement.create({ data: { ...base, type: 'ADJUSTMENT_OUT', quantity: 2, totalCost: 6000, previousStock: 10, newStock: 8, reasonCode: 'DAMAGED', userId } });
  return { name, supplier };
}

test.describe('mermas con responsable', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test.afterAll(async () => {
    await setShrinkage(false);
  });

  test('encendido: se asigna al proveedor, suma en su cuenta y se descarga', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const { name, supplier } = await ensureLoss(warehouseId);
    await setShrinkage(true);

    await page.goto(`/dashboard/inventory/mermas?bodega=${warehouseId}`);
    await expect(page.getByRole('heading', { name: 'Mermas y responsables' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mermas y responsables' })).toBeVisible();
    const table = page.getByTestId('shrinkage-table');
    await expect(table.getByText(name)).toBeVisible();

    await table.getByLabel(`Quién responde por la pérdida de ${name}`).selectOption(`SUPPLIER:${supplier.id}`);
    await expect(page.getByText('Responsable guardado')).toBeVisible();
    await expect(page.getByTestId('shrinkage-by-supplier').getByRole('link', { name: supplier.name })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Descargar Excel' }).click()]);
    expect(download.suggestedFilename()).toBe('mermas-y-responsables.xlsx');
  });

  test('apagado: fuera del menú, con la ruta y la descarga cerradas', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    await setShrinkage(false);

    await page.goto('/dashboard/inventory/mermas');
    await expect(page.getByRole('heading', { name: 'Módulo no incluido en tu plan actual' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mermas y responsables' })).toHaveCount(0);
    const response = await request.get(`/api/inventory/shrinkage/export?bodega=${warehouseId}`);
    expect(response.status()).toBe(403);
  });
});
