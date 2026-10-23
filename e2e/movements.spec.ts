import { expect, test } from '@playwright/test';
import { EAN_ACEITE, STATE, lookup, seedCatalog } from './bodega-support';
import { disableGuidedTour, ensureWarehouse, owner } from './db';

/**
 * Registro de movimientos por bodega: cada bodega se ve sola, y cada fila dice quién la hizo, el motivo
 * y trae la foto de respaldo. Los movimientos se crean por la misma API que usa la app del bodeguero.
 */

test.use(STATE);

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

test.describe('movimientos de bodega', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test('cada bodega muestra solo lo suyo, con operario, motivo y foto', async ({ page, request }) => {
    const centralId = await seedCatalog(request);
    const branch = await ensureWarehouse('Sucursal E2E', 'SUC-E2E');
    const { name: ownerName, companyId } = await owner();
    const harina = (await lookup(request, 'E2E-HAR-1KG', centralId))!;
    const aceite = (await lookup(request, EAN_ACEITE, centralId))!;
    const photo = `https://e2e.public.blob.vercel-storage.com/inventory-evidence/${companyId}/bodega-mov-${RUN}.jpg`;

    const response = await request.post('/api/bodega/sync', {
      data: {
        ops: [
          { kind: 'MOVE', clientOpId: `e2e-mov-llegada-${RUN}`, mode: 'RECEIVE', productId: harina.id, warehouseId: branch.id, quantity: 7, reference: `LLEGADA-SUC-${RUN}` },
          { kind: 'MOVE', clientOpId: `e2e-mov-degustacion-${RUN}`, mode: 'WASTE', reason: 'TASTING', productId: aceite.id, warehouseId: centralId, quantity: 1, note: `degustación feria ${RUN}`, evidenceUrl: photo },
        ],
      },
    });
    expect(response.status()).toBe(200);
    const results = (await response.json()).data.results as Array<{ status: string; message?: string }>;
    expect(results.map((result) => result.status), JSON.stringify(results)).toEqual(['APPLIED', 'APPLIED']);

    // La bodega principal: la degustación con su foto y quién la hizo; la llegada de la sucursal NO aparece.
    await page.goto(`/dashboard/inventory/movements?bodega=${centralId}`);
    const log = page.getByTestId('movement-log');
    await expect(log).toBeVisible({ timeout: 30_000 });
    const tasting = log.getByRole('row').filter({ hasText: `degustación feria ${RUN}` });
    await expect(tasting).toHaveCount(1);
    await expect(tasting).toContainText('Degustación o muestra');
    await expect(tasting).toContainText(ownerName);
    await expect(tasting.getByRole('img')).toHaveAttribute('src', photo);
    await expect(log.getByText(`LLEGADA-SUC-${RUN}`)).toHaveCount(0);

    // La sucursal: su llegada; la degustación de la otra bodega NO aparece.
    await page.getByRole('link', { name: 'Sucursal E2E' }).click();
    await expect(page.getByTestId('movement-log').getByText(`Ref. LLEGADA-SUC-${RUN}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`degustación feria ${RUN}`)).toHaveCount(0);

    // Filtrar por motivo y descargar a Excel.
    await page.goto(`/dashboard/inventory/movements?bodega=${centralId}&motivo=TASTING`);
    await expect(page.getByTestId('movement-log').getByRole('row').filter({ hasText: 'Degustación o muestra' }).first()).toBeVisible();
    const excel = await request.get(`/api/inventory/movements/export?bodega=${centralId}`);
    expect(excel.status()).toBe(200);
    expect(excel.headers()['content-type']).toContain('spreadsheetml');
    expect((await excel.body()).subarray(0, 2).toString()).toBe('PK');
    expect((await request.get('/api/inventory/movements/export')).status(), 'sin bodega no exporta').toBe(400);
  });

  test('el kardex de un producto se abre por bodega', async ({ page, request }) => {
    const centralId = await seedCatalog(request);
    const branch = await ensureWarehouse('Sucursal E2E', 'SUC-E2E');
    await request.post('/api/bodega/sync', { data: { ops: [{ kind: 'MOVE', clientOpId: `e2e-kardex-${RUN}`, mode: 'RECEIVE', productId: (await lookup(request, 'E2E-HAR-1KG', centralId))!.id, warehouseId: branch.id, quantity: 2, reference: `KARDEX-${RUN}` }] } });
    await page.goto('/dashboard/inventory');
    await page.getByText('Harina E2E Selecta 1 kg').first().click();
    await expect(page.getByRole('group', { name: 'Bodega del kardex' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('group', { name: 'Bodega del kardex' }).getByRole('button', { name: 'Sucursal E2E' }).click();
    await expect(page.getByText(`KARDEX-${RUN}`)).toBeVisible({ timeout: 20_000 });
  });
});
