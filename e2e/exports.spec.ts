import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { hash } from 'bcryptjs';
import { expect, test, type APIResponse } from '@playwright/test';
import { STATE, seedCatalog, lookup } from './bodega-support';
import { db, disableGuidedTour, ensureWarehouse, owner } from './db';
import { login } from './support';

/**
 * «Exportar datos»: ver y bajar a Excel las boletas y los movimientos de todas las bodegas. Los documentos
 * se arman directo en la base (no hay otra forma de tener ventas con fecha y folio conocidos) y los
 * movimientos nacen por la API de la app del bodeguero, igual que en `movements.spec.ts`.
 */

test.use(STATE);
test.describe.configure({ mode: 'serial' });

const RUN = randomUUID().slice(0, 8);
const FOLIO = 900_000_000 + Math.floor(Math.random() * 99_999_999);
const CUSTOMER = `Cliente exportación ${RUN}`;
const PRODUCT_LINE = `Producto vendido ${RUN}`;
const LIMITED_PASSWORD = `Limit-${randomUUID()}!`;

let companyId = '';
let previousFlags: { hasInventory: boolean; hasDteBilling: boolean } = { hasInventory: false, hasDteBilling: false };

const XLSX = 'spreadsheetml';

async function workbookOf(response: APIResponse): Promise<ExcelJS.Workbook> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain(XLSX);
  const body = await response.body();
  expect(body.subarray(0, 2).toString()).toBe('PK');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body as unknown as ExcelJS.Buffer);
  return wb;
}

test.beforeAll(async () => {
  ({ companyId } = await owner());
  const current = await db().companyFeatures.findUnique({ where: { companyId } });
  previousFlags = { hasInventory: current?.hasInventory ?? false, hasDteBilling: current?.hasDteBilling ?? false };
  await db().companyFeatures.upsert({
    where: { companyId },
    update: { hasInventory: true, hasDteBilling: true },
    create: { companyId, hasInventory: true, hasDteBilling: true },
  });
  const warehouse = await db().warehouse.findFirstOrThrow({ where: { companyId }, orderBy: { createdAt: 'asc' } });
  const customer = await db().contact.create({ data: { companyId, rut: `EXP-${RUN}`, rutClean: `EXP${RUN}`, razonSocial: CUSTOMER, isCustomer: true } });
  const net = 10_000;
  await db().salesDocument.create({
    data: {
      companyId, contactId: customer.id, warehouseId: warehouse.id, dteType: 'BOLETA_39', folio: FOLIO, status: 'ISSUED',
      issueDate: new Date(), paymentMethod: 'TARJETA_DEBITO', netAmount: net, ivaAmount: 1900, totalAmount: 11_900,
      items: { create: [{ companyId, description: PRODUCT_LINE, quantity: 2, unitPrice: 5000, subtotal: net, iva: 1900, total: 11_900 }] },
    },
  });
});

test.afterAll(async () => {
  if (!companyId) return;
  await db().companyFeatures.update({ where: { companyId }, data: previousFlags });
  await db().user.updateMany({ where: { companyId, email: { endsWith: `-${RUN}@prueba.local` } }, data: { isActive: false } });
});

test.beforeEach(async ({ context }) => {
  await disableGuidedTour(context);
});

test('el menú ofrece «Exportar datos» y la pantalla muestra y descarga las boletas', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('navigation').getByRole('link', { name: 'Exportar datos' }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/exports/);
  await expect(page.getByRole('heading', { name: 'Exportar datos', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Qué exportar' }).getByRole('link', { name: 'Boletas y documentos de venta' })).toHaveAttribute('aria-current', 'page');

  // Por folio y sin límite de fechas: aparece la boleta, con su cliente y su total.
  await page.goto(`/dashboard/exports?datos=boletas&rango=todo&q=${FOLIO}`);
  const table = page.getByTestId('sales-export-table');
  await expect(table).toBeVisible({ timeout: 30_000 });
  const row = table.getByRole('row').filter({ hasText: CUSTOMER });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('$11.900');
  await expect(row).toContainText('Débito');
  await expect(row).toContainText('Emitido');
  await expect(page.getByTestId('sales-summary')).toContainText('$11.900');

  // El botón baja exactamente lo que se ve.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Descargar Excel/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^boletas-historial-completo\.xlsx$/);
  const path = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(path)) as unknown as ExcelJS.Buffer);
  const docs = wb.getWorksheet('Documentos')!;
  expect(docs.rowCount).toBe(2);
  expect(String(docs.getRow(2).getCell(5).value)).toBe(CUSTOMER);
  expect(docs.getRow(2).getCell(3).value).toBe(FOLIO);
  expect(String(wb.getWorksheet('Detalle de productos')!.getRow(2).getCell(7).value)).toBe(PRODUCT_LINE);
});

test('las rutas de descarga de boletas respetan filtros, estado y tipo', async ({ request }) => {
  const wb = await workbookOf(await request.get(`/api/exports/sales?rango=todo&q=${FOLIO}`));
  expect(wb.getWorksheet('Documentos')!.rowCount).toBe(2);
  // Como factura no existe; como anulada tampoco.
  expect((await workbookOf(await request.get(`/api/exports/sales?rango=todo&q=${FOLIO}&tipo=FACTURAS`))).getWorksheet('Documentos')!.rowCount).toBe(1);
  expect((await workbookOf(await request.get(`/api/exports/sales?rango=todo&q=${FOLIO}&estado=CANCELLED`))).getWorksheet('Documentos')!.rowCount).toBe(1);
  // Un filtro inválido cae al valor por defecto y no rompe.
  expect((await workbookOf(await request.get(`/api/exports/sales?rango=todo&q=${FOLIO}&tipo=inventado&estado=inventado`))).getWorksheet('Documentos')!.rowCount).toBe(2);
});

test('los movimientos de todas las bodegas se ven y se descargan juntos', async ({ page, request }) => {
  const centralId = await seedCatalog(request);
  const branch = await ensureWarehouse('Sucursal E2E', 'SUC-E2E');
  const harina = (await lookup(request, 'E2E-HAR-1KG', centralId))!;
  const sync = await request.post('/api/bodega/sync', {
    data: {
      ops: [
        { kind: 'MOVE', clientOpId: `e2e-exp-central-${RUN}`, mode: 'RECEIVE', productId: harina.id, warehouseId: centralId, quantity: 3, reference: `EXP-CENTRAL-${RUN}` },
        { kind: 'MOVE', clientOpId: `e2e-exp-sucursal-${RUN}`, mode: 'RECEIVE', productId: harina.id, warehouseId: branch.id, quantity: 4, reference: `EXP-SUC-${RUN}` },
      ],
    },
  });
  expect(sync.status()).toBe(200);

  await page.goto('/dashboard/exports?datos=movimientos&rango=todo&q=Harina+E2E&tipo=ARRIVALS');
  const table = page.getByTestId('movements-export-table');
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole('row').filter({ hasText: 'Sucursal E2E' }).first()).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: 'Llegada' }).first()).toBeVisible();
  // Solo la bodega elegida.
  await page.goto(`/dashboard/exports?datos=movimientos&rango=todo&q=Harina+E2E&bodega=${branch.id}`);
  const branchTable = page.getByTestId('movements-export-table');
  await expect(branchTable.getByRole('row').filter({ hasText: 'Sucursal E2E' }).first()).toBeVisible({ timeout: 30_000 });
  // Todas las filas de la lista son de esa bodega (más la fila del encabezado).
  expect(await branchTable.getByRole('row').count()).toBe((await branchTable.getByRole('row').filter({ hasText: 'Sucursal E2E' }).count()) + 1);

  const wb = await workbookOf(await request.get('/api/exports/inventory-movements?rango=todo&q=Harina+E2E&tipo=ARRIVALS'));
  const sheet = wb.getWorksheet('Movimientos')!;
  const warehouses = new Set<string>();
  const references = new Set<string>();
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    warehouses.add(String(row.getCell(2).value));
    references.add(String(row.getCell(13).value));
  });
  expect(warehouses.has('Sucursal E2E')).toBe(true);
  expect(warehouses.size).toBeGreaterThanOrEqual(2);
  expect([...references]).toEqual(expect.arrayContaining([`EXP-CENTRAL-${RUN}`, `EXP-SUC-${RUN}`]));

  // Bodega de otra empresa o inexistente: no exporta.
  expect((await request.get('/api/exports/inventory-movements?bodega=no-existe')).status()).toBe(404);
});

test('cada descarga queda en la bitácora de auditoría', async ({ request }) => {
  const before = await db().auditLog.count({ where: { companyId, action: 'EXPORT', entity: 'SalesDocument' } });
  await workbookOf(await request.get(`/api/exports/sales?rango=todo&q=${FOLIO}`));
  const logs = await db().auditLog.findMany({ where: { companyId, action: 'EXPORT', entity: 'SalesDocument' }, orderBy: { createdAt: 'desc' }, take: 1 });
  expect(await db().auditLog.count({ where: { companyId, action: 'EXPORT', entity: 'SalesDocument' } })).toBe(before + 1);
  expect(logs[0].metadata).toMatchObject({ documents: 1 });
});

test('sin sesión no se descarga nada', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  expect([401, 403]).toContain((await anonymous.get('/api/exports/sales')).status());
  expect([401, 403]).toContain((await anonymous.get('/api/exports/inventory-movements')).status());
  await anonymous.dispose();
});

test.describe('un rol limitado', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  async function limitedUser(permissions: string[], label: string): Promise<string> {
    const role = await db().customRole.create({ data: { companyId, name: `Exportar ${label} ${RUN}`, permissions } });
    const email = `${label}-${RUN}@prueba.local`;
    await db().user.create({ data: { companyId, email, name: `Rol ${label}`, role: 'SALES', customRoleId: role.id, passwordHash: await hash(LIMITED_PASSWORD, 10) } });
    return email;
  }

  test('con solo «ver productos» ve movimientos y no boletas', async ({ page }) => {
    const email = await limitedUser(['products:read'], 'solo-productos');
    await login(page, email, LIMITED_PASSWORD);
    await page.waitForURL(/\/dashboard(\/|$|\?)/);
    await page.goto('/dashboard/exports');
    await expect(page.getByRole('heading', { name: 'Exportar datos', level: 1 })).toBeVisible();
    // Una sola pestaña: no hay selector.
    await expect(page.getByRole('navigation', { name: 'Qué exportar' })).toHaveCount(0);
    await expect(page.getByTestId('movements-summary')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sales-summary')).toHaveCount(0);
    // Pedir las boletas a mano tampoco funciona: la pantalla cae en lo que sí puede ver y la descarga se niega.
    await page.goto('/dashboard/exports?datos=boletas');
    await expect(page.getByTestId('sales-summary')).toHaveCount(0);
    const forbidden = await page.request.get('/api/exports/sales?rango=todo');
    expect(forbidden.status()).toBe(403);
    expect((await page.request.get('/api/exports/inventory-movements?rango=todo')).status()).toBe(200);
  });

  test('sin ninguno de los permisos no hay pantalla ni descarga', async ({ page }) => {
    const email = await limitedUser(['contacts:read'], 'sin-exportar');
    await login(page, email, LIMITED_PASSWORD);
    await page.waitForURL(/\/dashboard(\/|$|\?)/);
    await page.goto('/dashboard/exports');
    await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Exportar datos' })).toHaveCount(0);
    expect((await page.request.get('/api/exports/sales?rango=todo')).status()).toBe(403);
    expect((await page.request.get('/api/exports/inventory-movements?rango=todo')).status()).toBe(403);
  });
});
