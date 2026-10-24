import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { hash } from 'bcryptjs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { db } from './db';

const captureDirectory = path.join(process.cwd(), '.vercel', 'pos-review');
const run = randomUUID().slice(0, 8);
const password = `Pos-${randomUUID()}!`;
const cashierEmail = `pos-cajero-${run}@prueba.local`;
const secondEmail = `pos-segundo-${run}@prueba.local`;
const supervisorEmail = `pos-supervisor-${run}@prueba.local`;
let companyId = '';
let warehouseId = '';
let productId = '';
let registerId = '';
let secondRegisterId = '';
let cashierId = '';
let secondId = '';
let supervisorId = '';
let cashShiftId = '';

function requireLocalTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://missing/missing');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || !/(_test|_e2e)$/.test(url.pathname)) {
    throw new Error('El recorrido POS exige una base local terminada en _test o _e2e; nunca producción.');
  }
}

async function loginPos(page: Page, context: BrowserContext, userId: string, email: string) {
  await context.addInitScript((id) => localStorage.setItem(`tutorial-auto-off:${id}`, '1'), userId);
  await page.goto('/pos/ingresar');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Abrir caja', exact: true })).toBeVisible();
  await expect(page.getByText('Cajero identificado', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /principal/i })).toHaveCount(0);
}

async function open(page: Page, register: string, initial: string) {
  await expect(page.getByRole('button', { name: 'Abrir caja y comenzar a vender' })).toBeDisabled();
  await page.getByLabel('Caja', { exact: true }).selectOption(register);
  await page.getByLabel('Monto inicial en caja', { exact: true }).fill(initial);
  await page.getByRole('button', { name: 'Abrir caja y comenzar a vender' }).click();
  await expect(page.getByRole('tab', { name: 'Vender', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeEnabled();
}

async function sell(page: Page, debit = false, loseResponse = false) {
  await page.getByLabel('Escanear o buscar producto').fill(`POS-E2E-${run}`);
  await page.getByLabel('Escanear o buscar producto').press('Enter');
  if (debit) await page.getByRole('button', { name: 'Débito', exact: true }).click();
  else await page.getByRole('button', { name: 'Exacto', exact: true }).click();
  if (loseResponse) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `POS sin desborde de página en ${width}px`).toBe(true);
      await page.screenshot({ path: path.join(captureDirectory, `terminal-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    let dropped = false;
    await page.route('**/pos', async (route) => {
      if (!dropped && route.request().method() === 'POST' && route.request().postData()?.includes(productId)) {
        dropped = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
  }
  await page.getByRole('button', { name: /^Cobrar / }).click();
  if (loseResponse) {
    await expect(page.getByRole('button', { name: 'Confirmar el mismo cobro', exact: true })).toBeVisible();
    await expect(page.getByLabel('Escanear o buscar producto')).toBeDisabled();
    await expect(page.getByRole('tab', { name: 'Caja y arqueo', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByText('Confirma la operación pendiente antes de cambiar de cajero.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByRole('button', { name: 'Confirmar el mismo cobro', exact: true }).click();
    await page.unroute('**/pos');
  }
  await expect(page.getByRole('button', { name: /^Reimprimir boleta #/ })).toBeVisible();
}

test.beforeAll(async () => {
  requireLocalTestDatabase();
  mkdirSync(captureDirectory, { recursive: true });
  const company = await db().company.create({ data: {
    rut: `POS-E2E-${run}`, businessName: `Local multicaja ${run}`, maxUsers: 5,
    features: { create: { hasPos: true, hasInventory: true, hasDteBilling: true, hasTreasury: true } },
    settings: { create: {} },
  } });
  companyId = company.id;
  const passwordHash = await hash(password, 10);
  const cashier = await db().user.create({ data: { companyId, email: cashierEmail, passwordHash, name: `Cajero ${run}`, role: 'SALES' } });
  const second = await db().user.create({ data: { companyId, email: secondEmail, passwordHash, name: `Segundo ${run}`, role: 'SALES' } });
  const supervisor = await db().user.create({ data: { companyId, email: supervisorEmail, passwordHash, name: `Supervisor ${run}`, role: 'ADMIN' } });
  cashierId = cashier.id; secondId = second.id; supervisorId = supervisor.id;
  const warehouse = await db().warehouse.create({ data: { companyId, name: `Bodega POS ${run}`, code: `POS-${run}`, isDefault: true } });
  warehouseId = warehouse.id;
  registerId = (await db().cashRegister.create({ data: { companyId, warehouseId, name: `Mesón uno ${run}` } })).id;
  secondRegisterId = (await db().cashRegister.create({ data: { companyId, warehouseId, name: `Mesón dos ${run}` } })).id;
  const product = await db().product.create({ data: { companyId, sku: `POS-E2E-${run}`, name: `Producto de mostrador ${run}`, netPrice: 1000, grossPrice: 1190, costPricePMP: 500 } });
  productId = product.id;
  await db().stock.create({ data: { companyId, warehouseId, productId, quantity: 3 } });
});

test.afterAll(async () => {
  if (!companyId) return;
  await db().cashRegister.updateMany({ where: { companyId }, data: { isActive: false } });
  await db().user.updateMany({ where: { companyId }, data: { isActive: false } });
});

test('dos cajeros venden en paralelo, registran efectivo, cierran su turno y el supervisor conserva el arqueo', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const firstContext = await browser.newContext({ baseURL, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const secondContext = await browser.newContext({ baseURL, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const supervisorContext = await browser.newContext({ baseURL, locale: 'es-CL', timezoneId: 'America/Santiago' });
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    const supervisor = await supervisorContext.newPage();
    await loginPos(first, firstContext, cashierId, cashierEmail);
    await first.setViewportSize({ width: 1440, height: 1000 });
    await expect(first.getByRole('button', { name: 'Actualizar cajas', exact: true })).toBeEnabled();
    await first.screenshot({ path: path.join(captureDirectory, 'apertura.png'), fullPage: true });
    await open(first, registerId, '10000');
    cashShiftId = (await db().cashShift.findFirstOrThrow({ where: { companyId, userId: cashierId, status: 'OPEN' } })).id;
    await loginPos(second, secondContext, secondId, secondEmail);
    await expect(second.locator(`option[value="${registerId}"]`)).toBeDisabled();
    await expect(second.locator(`option[value="${registerId}"]`)).toContainText(`Ocupada por Cajero ${run}`);
    await open(second, secondRegisterId, '5000');
    await sell(first, false, true);
    await sell(second, true);
    await expect.poll(async () => (await db().stock.findFirstOrThrow({ where: { companyId, warehouseId, productId } })).quantity).toBe(1);
    const sales = await db().salesDocument.findMany({ where: { companyId, cashShiftId: { not: null } }, include: { payments: true } });
    expect(sales).toHaveLength(2);
    expect(sales.map((sale) => sale.sellerId).sort()).toEqual([cashierId, secondId].sort());
    for (const sale of sales) {
      expect(sale).toMatchObject({ totalAmount: 1190, paymentStatus: 'PAID', warehouseId });
      expect(sale.payments).toHaveLength(1);
      expect(sale.payments[0].amount).toBe(1190);
    }

    await first.getByRole('tab', { name: 'Caja y arqueo', exact: true }).click();
    await first.getByRole('button', { name: 'Ingreso', exact: true }).click();
    await first.getByLabel('Monto', { exact: true }).fill('1000');
    await first.getByLabel('Motivo', { exact: true }).fill('Refuerzo de fondo');
    let lostMovement = false;
    await first.route('**/pos', async (route) => {
      if (!lostMovement && route.request().method() === 'POST' && route.request().postData()?.includes('Refuerzo de fondo')) {
        lostMovement = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await first.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Confirmar el mismo movimiento', exact: true })).toBeVisible();
    await expect(first.getByLabel('Motivo', { exact: true })).toBeDisabled();
    await expect(first.getByRole('button', { name: 'Cerrar caja', exact: true })).toBeDisabled();
    await first.getByRole('button', { name: 'Confirmar el mismo movimiento', exact: true }).click();
    await first.unroute('**/pos');
    await expect(first.getByText('Refuerzo de fondo', { exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'Retiro', exact: true }).click();
    await first.getByLabel('Monto', { exact: true }).fill('2000');
    await first.getByLabel('Motivo', { exact: true }).fill('Retiro a bóveda');
    await first.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(first.getByText('Retiro a bóveda', { exact: true })).toBeVisible();
    const movements = await db().cashMovement.findMany({ where: { cashShiftId } });
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.userId === cashierId && Boolean(movement.idempotencyKey))).toBe(true);
    await first.screenshot({ path: path.join(captureDirectory, 'arqueo.png'), fullPage: true });
    await first.getByLabel('Efectivo contado en el cajón').fill('10190');
    await first.getByRole('button', { name: 'Cerrar caja', exact: true }).click();
    await first.getByRole('alertdialog').getByRole('button', { name: 'Cerrar caja', exact: true }).click();
    await expect(first.getByRole('heading', { name: 'Abrir caja', exact: true })).toBeVisible();
    expect(await db().cashShift.findUniqueOrThrow({ where: { id: cashShiftId } })).toMatchObject({ status: 'CLOSED', initialAmount: 10000, expectedAmount: 10190, actualAmount: 10190, difference: 0 });
    await expect(first.getByRole('heading', { name: 'Mis turnos de caja', exact: true })).toBeVisible();
    await expect(first.getByRole('row').filter({ hasText: `Segundo ${run}` })).toHaveCount(0);
    await first.getByRole('button', { name: `Ver turno Mesón uno ${run} de Cajero ${run}`, exact: true }).click();
    await expect(first.getByRole('heading', { name: 'Comprobante de cierre', exact: true })).toBeVisible();
    await expect(first.getByRole('button', { name: 'Imprimir comprobante de cierre', exact: true })).toBeVisible();
    await expect(first.getByLabel('Efectivo contado en el cajón')).toHaveCount(0);
    await first.screenshot({ path: path.join(captureDirectory, 'cierre.png'), fullPage: true });

    await loginPos(supervisor, supervisorContext, supervisorId, supervisorEmail);
    await supervisor.getByRole('button', { name: `Ver turno Mesón dos ${run} de Segundo ${run}`, exact: true }).click();
    await expect(supervisor.getByRole('heading', { name: 'Movimiento de efectivo', exact: true })).toHaveCount(0);
    await supervisor.getByLabel('Efectivo contado en el cajón').fill('5000');
    await supervisor.getByRole('button', { name: 'Cerrar caja', exact: true }).click();
    await supervisor.getByRole('alertdialog').getByRole('button', { name: 'Cerrar caja', exact: true }).click();
    await expect(supervisor.getByRole('heading', { name: 'Comprobante de cierre', exact: true })).toBeVisible();
    expect(await db().cashShift.findFirstOrThrow({ where: { companyId, userId: secondId } })).toMatchObject({ status: 'CLOSED', initialAmount: 5000, expectedAmount: 5000, actualAmount: 5000, difference: 0 });
    await second.bringToFront();
    await second.evaluate(() => window.dispatchEvent(new Event('focus')));
    // Next puede sincronizar la página completa al volver al equipo, o el
    // monitor puede mostrar el aviso conservando el terminal. Ambos estados
    // deben impedir cobrar en el turno que el supervisor acaba de cerrar.
    await expect(second.getByText(/Este turno fue cerrado desde otro equipo/).or(second.getByRole('heading', { name: 'Abrir caja', exact: true }))).toBeVisible({ timeout: 20_000 });
    const chargeButton = second.getByRole('button', { name: /^Cobrar / });
    if (await chargeButton.count()) await expect(chargeButton).toBeDisabled();
    else await expect(second.getByRole('button', { name: 'Abrir caja y comenzar a vender' })).toBeDisabled();
  } finally {
    await firstContext.close(); await secondContext.close(); await supervisorContext.close();
  }
});
