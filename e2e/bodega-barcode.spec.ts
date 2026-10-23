import { expect, test, devices } from '@playwright/test';
import { EAN_ACEITE, STATE, eanVideo, fakeCamera, lookup, openApp, seedCatalog } from './bodega-support';
import { db, ensureSupplier, owner } from './db';

/**
 * La lectura de códigos usa un video con un EAN-13 de verdad: lo decodifica el
 * lector real de la app (el mismo que usan los iPhone, que no traen lector nativo).
 */

test.use({ ...STATE, ...devices['Pixel 7'], permissions: ['camera'], launchOptions: fakeCamera(eanVideo) });

test.describe('app del bodeguero con un código de barras', () => {
  test('lee el código con la cámara, suma la llegada del proveedor y la envía', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const supplier = await ensureSupplier('Proveedor Bodega E2E', '77.111.222');
    const before = (await lookup(request, EAN_ACEITE, warehouseId))!.stock;
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await openApp(page);
    await page.getByRole('button', { name: /Llegada de mercadería/ }).click();
    await page.getByRole('button', { name: 'Cámara' }).click();
    await expect(page.getByText(new RegExp(`Código ${EAN_ACEITE} leído`))).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Listo' }).click();

    const quantity = page.getByLabel(/Cantidad de Aceite Maravilla Chef 900 ml en UN/);
    await expect(quantity).toHaveValue('1');
    await quantity.fill('4');
    await quantity.press('Enter');
    await page.getByLabel('N° de guía o factura (opcional)').fill('Guía e2e');

    // Sin elegir proveedor no se puede enviar: cada ingreso es de un proveedor.
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect(page.getByText('Elige el proveedor de esta llegada.').first()).toBeVisible();
    await page.getByLabel(/^Proveedor/).selectOption(supplier.id);
    await page.getByRole('button', { name: /^Enviar/ }).click();

    await expect(page.getByText('¿Qué vas a hacer?')).toBeVisible();
    await expect.poll(async () => (await lookup(request, EAN_ACEITE, warehouseId))!.stock, { timeout: 30_000 }).toBe(before + 4);
    expect(consoleErrors.filter((text) => text.includes('Permissions policy')), 'la cámara debe estar permitida en /bodega').toEqual([]);

    // El ingreso quedó atribuido: proveedor, operario y bodega; y el proveedor surte ese producto.
    const { id: ownerId } = await owner();
    const movement = await db().inventoryMovement.findFirstOrThrow({ where: { warehouseId, supplierId: supplier.id, type: 'PURCHASE_IN' }, orderBy: { createdAt: 'desc' } });
    expect(movement).toMatchObject({ quantity: 4, userId: ownerId, supplierId: supplier.id, reference: 'Guía e2e' });
    expect(await db().productSupplier.count({ where: { productId: movement.productId, supplierId: supplier.id } })).toBe(1);
  });

  test('sin conexión guarda la salida con su foto y la envía sola al volver la señal', async ({ page, context, request }) => {
    const warehouseId = await seedCatalog(request);
    const before = (await lookup(request, EAN_ACEITE, warehouseId))!.stock;
    const bootstrap = (await (await request.get('/api/bodega/bootstrap')).json()).data as { company: { id: string } };
    const photoUrl = `https://e2e.public.blob.vercel-storage.com/inventory-evidence/${bootstrap.company.id}/bodega-e2e-${Date.now()}.jpg`;
    // El almacenamiento real no existe en las pruebas: la subida de la foto se simula con una dirección válida.
    await page.route('**/api/bodega/evidence', (route) => route.fulfill({ json: { success: true, data: { url: photoUrl } } }));

    await openApp(page);
    await page.getByRole('button', { name: /Salida o merma/ }).click();
    await page.getByLabel('Código o nombre del producto').fill(EAN_ACEITE);
    await page.getByLabel('Código o nombre del producto').press('Enter');
    await expect(page.getByText('Aceite Maravilla Chef 900 ml').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Vencido' }).click();

    // Una salida sin la foto del producto no se envía.
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect(page.getByText('Saca una foto del producto').first()).toBeVisible();
    await page.getByRole('button', { name: 'Sacar foto' }).click();
    await page.getByRole('button', { name: 'Sacar foto del producto' }).click();
    await expect(page.getByText('Foto del producto lista')).toBeVisible({ timeout: 20_000 });

    await context.setOffline(true);
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect(page.getByText('¿Qué vas a hacer?')).toBeVisible();
    await expect(page.getByText('Sin conexión').first()).toBeVisible();
    expect((await lookup(request, EAN_ACEITE, warehouseId))!.stock, 'sin señal no se mueve nada').toBe(before);

    await context.setOffline(false);
    await expect.poll(async () => (await lookup(request, EAN_ACEITE, warehouseId))!.stock, { timeout: 60_000 }).toBe(before - 1);
    await expect(page.getByText('En línea')).toBeVisible({ timeout: 30_000 });

    // Quedó en el kardex de ESA bodega con motivo, foto y la persona que lo hizo.
    const { id: ownerId } = await owner();
    const movement = await db().inventoryMovement.findFirstOrThrow({ where: { warehouseId, evidenceUrl: photoUrl } });
    expect(movement).toMatchObject({ type: 'ADJUSTMENT_OUT', quantity: 1, reasonCode: 'EXPIRED', userId: ownerId, warehouseId });
  });
});
