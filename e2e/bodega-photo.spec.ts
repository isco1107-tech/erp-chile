import { expect, test, devices, type Page } from '@playwright/test';
import { STATE, blankVideo, fakeCamera, freshEan13, lookup, openApp, seedCatalog, setServerAi } from './bodega-support';
import { ensureSupplier } from './db';

/**
 * La IA se SIMULA (`page.route`): una prueba de punta a punta no debe depender de
 * una llave de Gemini ni de su cuota. La integración real con la IA se cubre en
 * `tests/warehouse-mobile-db.test.ts` y a mano.
 */

test.use({ ...STATE, ...devices['Pixel 7'], permissions: ['camera'], launchOptions: fakeCamera(blankVideo) });

test.describe('app del bodeguero con una foto (IA simulada)', () => {
  async function takePhoto(page: Page) {
    await page.getByRole('button', { name: 'Cámara' }).click();
    await page.getByRole('button', { name: 'Sacar foto del producto' }).click();
    await expect(page.getByText(/Foto guardada/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Listo' }).click();
  }

  test('la foto espera su turno de la IA, se sugiere el producto y hay que confirmarlo', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const supplier = await ensureSupplier('Proveedor Bodega E2E', '77.111.222');
    const harina = (await lookup(request, 'E2E-HAR-1KG', warehouseId))!;
    const before = harina.stock;
    let calls = 0;
    await page.route('**/api/bodega/identify', (route) => {
      calls++;
      if (calls === 1) {
        return route.fulfill({ json: { success: true, data: { status: 'busy', candidates: [], read: null, cached: false, retryAfterMs: 3000, message: 'La IA tiene mucha demanda.' } } });
      }
      return route.fulfill({ json: { success: true, data: { status: 'matched', candidates: [{ ...harina, reason: 'text', score: 0.9, factor: 1, packagingName: null }], read: null, cached: false } } });
    });

    await setServerAi(page, true);
    await openApp(page);
    await page.getByRole('button', { name: /Llegada de mercadería/ }).click();
    // Cada llegada es de un proveedor.
    await page.getByLabel(/^Proveedor/).selectOption(supplier.id);
    await takePhoto(page);
    await expect(page.getByText('Esperando turno de la IA…').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('La IA cree que es este producto')).toBeVisible({ timeout: 30_000 });
    expect(calls, 'una consulta ocupada y una resuelta: no se insiste foto por foto').toBe(2);

    // Sin confirmar no deja enviar.
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Confirma que' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sí, es este' }).click();

    const quantity = page.getByLabel(/Cantidad de Harina E2E Selecta 1 kg en KG/);
    await quantity.fill('2,5');
    await quantity.press('Enter');
    await page.getByRole('button', { name: /^Enviar/ }).click();
    await expect.poll(async () => (await lookup(request, 'E2E-HAR-1KG', warehouseId))!.stock, { timeout: 30_000 }).toBe(before + 2.5);
  });

  test('un producto que no está en el catálogo se crea con los datos revisados', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const supplier = await ensureSupplier('Proveedor Bodega E2E', '77.111.222');
    const barcode = freshEan13();
    // Un nombre propio de esta corrida: repetir la prueba contra la misma base no debe chocar con el aviso de duplicado.
    const unique = Math.random().toString(36).slice(2, 7).toUpperCase();
    const name = `Pasta E2E ${unique}`;
    await page.route('**/api/bodega/identify', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            status: 'new',
            candidates: [],
            cached: false,
            read: { name: `Pasta E2E ${unique}`, brand: 'Carozzi', variant: null, netContent: '400 g', unit: 'UN', barcode, description: 'Pasta de sémola', categoryHint: 'Abarrotes', lotNumber: null, expiryDate: null, confidence: 'high', warnings: [] },
          },
        },
      }),
    );
    // El almacenamiento de fotos falla: el producto se crea igual, sin foto (no queda bloqueado).
    await page.route('**/api/bodega/photo', (route) => route.fulfill({ status: 500, json: { success: false, error: 'Sin almacenamiento' } }));

    await setServerAi(page, true);
    await openApp(page);
    await page.getByRole('button', { name: /Llegada de mercadería/ }).click();
    // Cada llegada es de un proveedor.
    await page.getByLabel(/^Proveedor/).selectOption(supplier.id);
    await takePhoto(page);
    await expect(page.getByText('No está en tu catálogo')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Crear producto nuevo' }).click();
    await expect(page.getByLabel('Nombre *')).toHaveValue(`${name} Carozzi 400 g`);
    await expect(page.getByText('Estos datos los sugirió la IA')).toBeVisible();
    await page.getByPlaceholder('$').first().fill('1.290');
    await page.getByRole('button', { name: 'Usar este producto' }).click();

    const quantity = page.getByLabel(new RegExp(`Cantidad de ${name} Carozzi 400 g en UN`));
    await quantity.fill('12');
    await quantity.press('Enter');
    await page.getByRole('button', { name: /^Enviar/ }).click();

    await expect.poll(async () => (await lookup(request, barcode, warehouseId))?.stock ?? 0, { timeout: 60_000 }).toBe(12);
    const created = (await lookup(request, barcode, warehouseId))!;
    expect(created.sku).toMatch(/^PRD-\d{6}$/);
    expect(created.name).toBe(`${name} Carozzi 400 g`);
    expect(created.imageUrl).toBeNull();
  });

  test('si el servidor no tiene IA, la foto no se manda a identificar y se resuelve a mano', async ({ page, request }) => {
    await seedCatalog(request);
    const supplier = await ensureSupplier('Proveedor Bodega E2E', '77.111.222');
    let calls = 0;
    await page.route('**/api/bodega/identify', (route) => {
      calls++;
      return route.fulfill({ json: { success: true, data: { status: 'new', candidates: [], read: null, cached: false } } });
    });

    await setServerAi(page, false);
    await openApp(page);
    await page.getByRole('button', { name: /Llegada de mercadería/ }).click();
    // Cada llegada es de un proveedor.
    await page.getByLabel(/^Proveedor/).selectOption(supplier.id);
    await takePhoto(page);
    await expect(page.getByText('La identificación por foto no está disponible', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Buscar a mano' })).toBeVisible();
    expect(calls, 'sin IA en el servidor no se gasta una consulta por foto').toBe(0);
  });

  test('si ya existe un producto parecido, se ofrece sumarlo al existente en vez de duplicarlo', async ({ page, request }) => {
    const warehouseId = await seedCatalog(request);
    const supplier = await ensureSupplier('Proveedor Bodega E2E', '77.111.222');
    const existing = (await lookup(request, 'E2E-HAR-1KG', warehouseId))!;
    const before = existing.stock;
    await page.route('**/api/bodega/identify', (route) =>
      route.fulfill({
        json: {
          success: true,
          // La IA no encontró candidatos (por ejemplo, porque la lectura salió con otro orden de palabras)…
          data: { status: 'new', candidates: [], cached: false, read: { name: 'Harina E2E', brand: 'Selecta', variant: null, netContent: '1 kg', unit: 'KG', barcode: null, description: null, categoryHint: null, lotNumber: null, expiryDate: null, confidence: 'high', warnings: [] } },
        },
      }),
    );
    await page.route('**/api/bodega/photo', (route) => route.fulfill({ status: 500, json: { success: false, error: 'Sin almacenamiento' } }));

    await setServerAi(page, true);
    await openApp(page);
    await page.getByRole('button', { name: /Llegada de mercadería/ }).click();
    // Cada llegada es de un proveedor.
    await page.getByLabel(/^Proveedor/).selectOption(supplier.id);
    await takePhoto(page);
    await page.getByRole('button', { name: 'Crear producto nuevo' }).click();
    await page.getByRole('button', { name: 'Usar este producto' }).click();
    const quantity = page.getByLabel(/Cantidad de Harina E2E Selecta 1 kg en KG/);
    await quantity.fill('3');
    await quantity.press('Enter');
    await page.getByRole('button', { name: /^Enviar/ }).click();

    // …pero el servidor sí reconoce que ya existe y lo devuelve a la persona para que decida.
    await expect(page.getByText('1 con problema')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Pendientes y enviados/ }).click();
    await expect(page.getByText(/Ya existe/)).toBeVisible();
    await page.getByRole('button', { name: /Sumar a/ }).click();
    await expect.poll(async () => (await lookup(request, 'E2E-HAR-1KG', warehouseId))!.stock, { timeout: 30_000 }).toBe(before + 3);
  });
});
