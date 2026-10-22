import { expect, test, devices } from '@playwright/test';
import { EAN_ACEITE, STATE, eanVideo, fakeCamera, lookup, openApp, seedCatalog } from './bodega-support';

/**
 * La lectura de códigos usa un video con un EAN-13 de verdad: lo decodifica el
 * lector real de la app (el mismo que usan los iPhone, que no traen lector nativo).
 */

test.use({ ...STATE, ...devices['Pixel 7'], permissions: ['camera'], launchOptions: fakeCamera(eanVideo) });

test.describe('app del bodeguero con un código de barras', () => {
  test('lee el código con la cámara, suma la llegada y la envía', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
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
    await page.getByRole('button', { name: /^Enviar/ }).click();

    await expect(page.getByText('¿Qué vas a hacer?')).toBeVisible();
    await expect.poll(async () => (await lookup(request, EAN_ACEITE, warehouseId))!.stock, { timeout: 30_000 }).toBe(before + 4);
    expect(consoleErrors.filter((text) => text.includes('Permissions policy')), 'la cámara debe estar permitida en /bodega').toEqual([]);
  });

  test('sin conexión guarda el movimiento y lo envía solo al volver la señal', async ({ page, context, request }) => {
    const warehouseId = await seedCatalog(request);
    const before = (await lookup(request, EAN_ACEITE, warehouseId))!.stock;

    await openApp(page);
    await page.getByRole('button', { name: /Merma o bote/ }).click();
    await page.getByLabel('Código o nombre del producto').fill(EAN_ACEITE);
    await page.getByLabel('Código o nombre del producto').press('Enter');
    await expect(page.getByText('Aceite Maravilla Chef 900 ml').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Vencido' }).click();

    await context.setOffline(true);
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect(page.getByText('¿Qué vas a hacer?')).toBeVisible();
    await expect(page.getByText('Sin conexión').first()).toBeVisible();
    expect((await lookup(request, EAN_ACEITE, warehouseId))!.stock, 'sin señal no se mueve nada').toBe(before);

    await context.setOffline(false);
    await expect.poll(async () => (await lookup(request, EAN_ACEITE, warehouseId))!.stock, { timeout: 60_000 }).toBe(before - 1);
    await expect(page.getByText('En línea')).toBeVisible({ timeout: 30_000 });
  });
});

