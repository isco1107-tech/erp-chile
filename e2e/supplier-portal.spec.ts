import { expect, test, devices } from '@playwright/test';
import { hashSupplierCode, newSupplierCode, formatSupplierCode, supplierCodeHint } from '../src/lib/supplier-portal/code';
import { db, ensureSupplier, owner } from './db';
import { STATE } from './bodega-support';

/**
 * Portal de inventario del proveedor: el proveedor entra con SU código y ve solo sus productos y solo
 * cantidades. Los datos se arman directo en la base (un proveedor, sus productos, el código) y la
 * administración desde la ficha del proveedor se prueba con la sesión del dueño.
 */

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

test.describe('portal del proveedor', () => {
  let code = '';
  let supplierId = '';
  const names = { mine: `Aceite del Proveedor ${RUN}`, other: `Fideos de Otro Proveedor ${RUN}` };

  test.beforeAll(async () => {
    const { companyId } = await owner();
    const mine = await ensureSupplier('Distribuidora Portal E2E', '77.123.456');
    const other = await ensureSupplier('Otro Proveedor E2E', '77.654.321');
    supplierId = mine.id;
    const warehouse = await db().warehouse.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } });

    const product = async (sku: string, name: string, quantity: number, minStock: number) => {
      const created = await db().product.create({ data: { companyId, sku, name, brand: 'Marca E2E', netPrice: 424242, grossPrice: 504848, costPricePMP: 31337, minStock } });
      await db().stock.create({ data: { companyId, productId: created.id, warehouseId: warehouse.id, quantity } });
      return created;
    };
    const aceite = await product(`PV-${RUN}-1`, names.mine, 3, 10);
    const fideos = await product(`PV-${RUN}-2`, names.other, 80, 0);
    await db().productSupplier.create({ data: { companyId, productId: aceite.id, supplierId: mine.id, lastReceivedAt: new Date() } });
    await db().productSupplier.create({ data: { companyId, productId: fideos.id, supplierId: other.id, lastReceivedAt: new Date() } });

    const raw = newSupplierCode();
    code = formatSupplierCode(raw);
    await db().supplierPortalAccess.upsert({
      where: { contactId: mine.id },
      create: { companyId, contactId: mine.id, codeHash: hashSupplierCode(raw), codeHint: supplierCodeHint(raw) },
      update: { codeHash: hashSupplierCode(raw), codeHint: supplierCodeHint(raw), showMovement: true },
    });
  });

  test.afterAll(async () => {
    await db().$disconnect();
  });

  test('el proveedor escribe su código y ve solo sus productos, sin costos ni precios', async ({ page }) => {
    await page.goto('/proveedor');
    await expect(page.getByRole('heading', { name: 'Tu inventario en bodega' })).toBeVisible();
    // Como lo escribiría una persona: minúsculas y espacios en vez de guiones.
    await page.getByLabel('Tu código de acceso').fill(code.replace(/-/g, ' ').toLowerCase());
    await page.getByRole('button', { name: 'Ver mi inventario' }).click();

    await expect(page.getByText('Distribuidora Portal E2E').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(names.mine)).toBeVisible();
    await expect(page.getByText('Stock bajo').first()).toBeVisible();
    await expect(page.getByText(names.other), 'el producto de otro proveedor no se ve').toHaveCount(0);

    const html = await page.content();
    for (const secret of ['31337', '424242', '504848']) expect(html, `no debe mostrar ${secret}`).not.toContain(secret);
  });

  test('un código inventado o mal escrito no muestra nada', async ({ page }) => {
    await page.goto('/proveedor');
    await page.getByLabel('Tu código de acceso').fill('ABC');
    await page.getByRole('button', { name: 'Ver mi inventario' }).click();
    await expect(page.getByText(/tiene 16 letras y números/)).toBeVisible();

    await page.goto('/proveedor/0000-0000-0000-0000');
    await expect(page.getByText('Código no válido')).toBeVisible();
    await expect(page.getByText(names.mine)).toHaveCount(0);
  });

  test('se puede filtrar por estado y buscar por nombre', async ({ page }) => {
    await page.goto(`/proveedor/${code}`);
    await expect(page.getByText(names.mine)).toBeVisible();
    await page.getByRole('button', { name: /Sin stock/ }).click();
    await expect(page.getByText(names.mine)).toHaveCount(0);
    await page.getByRole('button', { name: /Todos/ }).click();
    await page.getByLabel('Buscar un producto').fill('zzz-no-existe');
    await expect(page.getByText('Ningún producto coincide')).toBeVisible();
    await page.getByLabel('Buscar un producto').fill(RUN.toLowerCase());
    await expect(page.getByText(names.mine)).toBeVisible();
  });

  test('descarga el inventario en Excel', async ({ request }) => {
    const response = await request.get(`/proveedor/${code}/export`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('spreadsheetml');
    const body = await response.body();
    expect(body.subarray(0, 2).toString()).toBe('PK');
    expect((await request.get('/proveedor/0000-0000-0000-0000/export')).status()).toBe(404);
  });

  test('en un celular pequeño no se desborda hacia los lados', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone SE'], baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto(`/proveedor/${code}`);
    await expect(page.getByText(names.mine)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'sin scroll horizontal').toBeLessThanOrEqual(1);
    await context.close();
  });

  test.describe('desde la ficha del proveedor (con la sesión del dueño)', () => {
    test.use(STATE);

    test('el administrador genera el código, el proveedor entra con él, y al desactivarlo deja de funcionar', async ({ page, browser }) => {
      await page.goto(`/dashboard/contacts/${supplierId}`);
      await expect(page.getByRole('heading', { name: 'Portal del proveedor' })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Generar código nuevo' }).click();
      // Ya había un acceso: pide confirmar porque el código anterior dejará de funcionar.
      await page.getByRole('button', { name: 'Generar nuevo' }).click();
      const issued = (await page.getByTestId('supplier-code').textContent())?.trim() ?? '';
      expect(issued).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);

      const anonymous = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      const outsider = await anonymous.newPage();
      await outsider.goto(`/proveedor/${issued}`);
      await expect(outsider.getByText('Distribuidora Portal E2E').first()).toBeVisible({ timeout: 20_000 });
      // El código anterior ya no sirve.
      await outsider.goto(`/proveedor/${code}`);
      await expect(outsider.getByText('Código no válido')).toBeVisible();

      await page.getByRole('button', { name: 'Desactivar' }).click();
      await page.getByRole('button', { name: 'Desactivar', exact: true }).last().click();
      await expect.poll(async () => (await db().supplierPortalAccess.count({ where: { contactId: supplierId } })), { timeout: 20_000 }).toBe(0);
      await outsider.goto(`/proveedor/${issued}`);
      await expect(outsider.getByText('Código no válido')).toBeVisible();
      await anonymous.close();
    });
  });
});
