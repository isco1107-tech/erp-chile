import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { hash } from 'bcryptjs';
import { expect, test, type Page } from '@playwright/test';
import { db } from './db';

/**
 * Operación del cajero: RUT del cliente al escanear el primer producto, cobro con el teclado, vuelto a
 * la vista, ventas en espera y cajón/impresora. El cajón se prueba contra un puerto serie SIMULADO
 * (no hay hardware en CI): comprueba los bytes que el POS le manda, no que un cajón real se abra.
 */
const run = randomUUID().slice(0, 8);
const password = `Caja-${randomUUID()}!`;
const email = `cajero-${run}@prueba.local`;
const captureDirectory = path.join(process.cwd(), '.vercel', 'pos-review');
const HARDWARE_KEY = 'aether-pos-hardware:v1';
const PULSE = [0x1b, 0x70, 0x00, 0x19, 0xfa];

let companyId = '';
let cashierId = '';
let registerId = '';
let skuA = '';
let skuB = '';
let nameA = '';
let nameB = '';

function requireLocalTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://missing/missing');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || !/(_test|_e2e)$/.test(url.pathname)) {
    throw new Error('El recorrido del cajero exige una base local terminada en _test o _e2e; nunca producción.');
  }
}

/** Puerto serie falso: guarda en `window.__serialWrites` lo que el POS le escribe; `window.__serialFail` lo hace fallar. */
const FAKE_SERIAL = `(() => {
  window.__serialWrites = [];
  const port = {
    getInfo: () => ({ usbVendorId: 1208, usbProductId: 514 }),
    open: async () => {},
    close: async () => {},
    writable: { getWriter: () => ({
      write: async (chunk) => {
        if (window.__serialFail) { const e = new Error('desconectado'); e.name = 'NetworkError'; throw e; }
        window.__serialWrites.push(Array.from(chunk));
      },
      releaseLock: () => {},
    }) },
  };
  Object.defineProperty(navigator, 'serial', { value: { getPorts: async () => [port], requestPort: async () => port }, configurable: true });
})();`;

async function writes(page: Page): Promise<number[][]> {
  return page.evaluate(() => (window as unknown as { __serialWrites: number[][] }).__serialWrites);
}

async function setHardware(page: Page, config: Record<string, unknown>) {
  await page.evaluate(([key, value]) => {
    window.localStorage.setItem(key as string, JSON.stringify(value));
    (window as unknown as { __serialWrites: number[][] }).__serialWrites.length = 0;
    (window as unknown as { __serialFail: boolean }).__serialFail = false;
  }, [HARDWARE_KEY, config]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeEnabled();
}

const serialConfig = { mode: 'serial', device: { vendorId: 1208, productId: 514 }, sounds: false };

async function scan(page: Page, code: string) {
  const search = page.getByLabel('Escanear o buscar producto');
  await search.fill(code);
  await search.press('Enter');
}

/** Cobra la venta en curso con el teclado: F9, monto en efectivo y Enter. */
async function chargeCash(page: Page, amount: string) {
  await page.keyboard.press('F9');
  const dialog = page.getByRole('dialog', { name: 'Cobrar la venta' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Efectivo recibido', { exact: true }).fill(amount);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Venta completada' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  requireLocalTestDatabase();
  mkdirSync(captureDirectory, { recursive: true });
  const company = await db().company.create({ data: {
    rut: `CAJ-E2E-${run}`, businessName: `Local cajero ${run}`, maxUsers: 3,
    features: { create: { hasPos: true, hasInventory: true, hasDteBilling: true, hasTreasury: true } },
    settings: { create: {} },
  } });
  companyId = company.id;
  const user = await db().user.create({ data: { companyId, email, passwordHash: await hash(password, 10), name: `Cajera ${run}`, role: 'SALES' } });
  cashierId = user.id;
  const warehouse = await db().warehouse.create({ data: { companyId, name: `Bodega ${run}`, code: `CAJ-${run}`, isDefault: true } });
  registerId = (await db().cashRegister.create({ data: { companyId, warehouseId: warehouse.id, name: `Caja ${run}` } })).id;
  skuA = `CAJ-A-${run}`;
  skuB = `CAJ-B-${run}`;
  nameA = `Leche ${run}`;
  nameB = `Pan ${run}`;
  const a = await db().product.create({ data: { companyId, sku: skuA, name: nameA, netPrice: 1000, grossPrice: 1190, costPricePMP: 500 } });
  const b = await db().product.create({ data: { companyId, sku: skuB, name: nameB, netPrice: 2000, grossPrice: 2380, costPricePMP: 900 } });
  for (const product of [a, b]) await db().stock.create({ data: { companyId, warehouseId: warehouse.id, productId: product.id, quantity: 100 } });
  // Un cliente conocido: el POS le confirma su nombre al cajero cuando teclea su RUT.
  await db().contact.create({ data: { companyId, rut: '12.345.678-5', rutClean: '123456785', razonSocial: 'Ana Soto Ltda', isCustomer: true } });
});

test.afterAll(async () => {
  if (!companyId) return;
  await db().cashRegister.updateMany({ where: { companyId }, data: { isActive: false } });
  await db().user.updateMany({ where: { companyId }, data: { isActive: false } });
});

test.describe('cajero', () => {
  let page: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'es-CL', timezoneId: 'America/Santiago', viewport: { width: 1440, height: 1000 } });
    await context.addInitScript((id) => localStorage.setItem(`tutorial-auto-off:${id}`, '1'), cashierId);
    await context.addInitScript(FAKE_SERIAL);
    page = await context.newPage();
    await page.goto('/pos/ingresar');
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 });
    await page.getByLabel('Caja', { exact: true }).selectOption(registerId);
    await page.getByLabel('Monto inicial en caja', { exact: true }).fill('20000');
    await page.getByRole('button', { name: 'Abrir caja y comenzar a vender' }).click();
    await expect(page.getByRole('tab', { name: 'Vender', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeEnabled();
    await setHardware(page, serialConfig);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('al escanear el primer producto pide el RUT, deja seguir escaneando y cobra con vuelto y cajón', async () => {
    await scan(page, skuA);
    await expect(page.getByRole('heading', { name: '¿Boleta con RUT?', exact: true })).toBeVisible();
    const rut = page.getByLabel('RUT del cliente', { exact: true });
    await expect(rut).toBeFocused();
    await page.screenshot({ path: path.join(captureDirectory, 'rut-primero.png'), fullPage: true });

    // El lector sigue entregando productos mientras se pide el RUT: se agregan, no se pierden.
    await rut.fill(skuB);
    await rut.press('Enter');
    await expect(page.getByRole('heading', { name: '¿Boleta con RUT?', exact: true })).toBeVisible();
    await expect(page.getByLabel(`Cantidad de ${nameB}`, { exact: true })).toHaveValue('1');

    // Un RUT con dígito verificador malo no pasa; el paso sigue abierto.
    await rut.fill('12.345.678-9');
    await rut.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'dígito verificador' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '¿Boleta con RUT?', exact: true })).toBeVisible();

    await rut.fill('12.345.678-5');
    await rut.press('Enter');
    await expect(page.getByRole('heading', { name: '¿Boleta con RUT?', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('pos-customer')).toContainText('12.345.678-5');
    await expect(page.getByTestId('pos-customer')).toContainText('Ana Soto Ltda');
    await expect(page.getByLabel('Escanear o buscar producto')).toBeFocused();

    // 3* + código = tres unidades; la cantidad también se corrige en la línea.
    await scan(page, `3*${skuA}`);
    await expect(page.getByLabel(`Cantidad de ${nameA}`, { exact: true })).toHaveValue('4');
    const quantityB = page.getByLabel(`Cantidad de ${nameB}`, { exact: true });
    await quantityB.fill('2');
    await quantityB.press('Enter');
    await expect(page.getByLabel(`Cantidad de ${nameB}`, { exact: true })).toHaveValue('2');
    // 4 × $1.000 + 2 × $2.000 = $8.000 neto + IVA $1.520 = $9.520.
    await expect(page.getByText('Total a pagar').locator('..').getByText('$9.520')).toBeVisible();

    await chargeCash(page, '10000');
    const done = page.getByRole('region', { name: 'Venta completada' });
    await expect(done).toContainText('Vuelto');
    await expect(done).toContainText('$480');
    await page.screenshot({ path: path.join(captureDirectory, 'venta-completada.png'), fullPage: true });

    const sale = await db().salesDocument.findFirstOrThrow({
      where: { companyId, cashShift: { userId: cashierId } },
      orderBy: { createdAt: 'desc' },
      include: { contact: true, items: true, payments: true },
    });
    expect(sale).toMatchObject({ totalAmount: 9520, paymentMethod: 'EFECTIVO', paymentStatus: 'PAID' });
    expect(sale.contact.rutClean).toBe('123456785');
    expect(sale.items.map((item) => item.quantity).sort()).toEqual([2, 4]);
    expect(sale.payments.map((payment) => payment.amount)).toEqual([9520]);
    // En efectivo se abre el cajón: un pulso por el puerto serie, sin boleta (no se pidió imprimir).
    expect(await writes(page)).toEqual([PULSE]);
  });

  test('tarjeta: sin vuelto y sin abrir el cajón', async () => {
    await scan(page, skuA);
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await page.keyboard.press('F9');
    const dialog = page.getByRole('dialog', { name: 'Cobrar la venta' });
    await page.keyboard.press('d');
    await expect(dialog.getByRole('radio', { name: /^Débito/ })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/terminal de pagos/)).toBeVisible();
    await page.keyboard.press('Enter');
    const done = page.getByRole('region', { name: 'Venta completada' });
    await expect(done).toContainText('No hay vuelto');
    const sale = await db().salesDocument.findFirstOrThrow({ where: { companyId, cashShift: { userId: cashierId } }, orderBy: { createdAt: 'desc' }, include: { contact: true } });
    expect(sale).toMatchObject({ totalAmount: 1190, paymentMethod: 'TARJETA_DEBITO' });
    expect(sale.contact.rutClean).toBe('666666666');
    expect(await writes(page)).toEqual([PULSE]); // sigue siendo solo el pulso de la venta anterior
  });

  test('un cajón desconectado no deshace la venta: se avisa y se puede reintentar', async () => {
    const before = await db().salesDocument.count({ where: { companyId } });
    await page.evaluate(() => { (window as unknown as { __serialFail: boolean }).__serialFail = true; });
    await scan(page, skuA);
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await chargeCash(page, '2000');
    await expect(page.getByRole('alert').filter({ hasText: 'La venta ya quedó cobrada y emitida' })).toBeVisible();
    expect(await db().salesDocument.count({ where: { companyId } })).toBe(before + 1);

    // Se conecta de nuevo y el reintento queda auditado.
    await page.evaluate(() => { (window as unknown as { __serialFail: boolean }).__serialFail = false; });
    await page.getByRole('button', { name: 'Abrir cajón', exact: true }).click();
    await expect.poll(() => writes(page)).toEqual([PULSE, PULSE]);
    const audit = await db().auditLog.findFirst({ where: { companyId, entity: 'CashShift', userId: cashierId }, orderBy: { createdAt: 'desc' } });
    expect((audit?.metadata as { motivo?: string } | null)?.motivo).toMatch(/^Reintento tras la boleta #/);
  });

  test('abrir el cajón sin venta exige un motivo y queda registrado', async () => {
    await page.getByRole('button', { name: /^Abrir cajón F8/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Abrir cajón sin venta' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'Otro motivo' }).click();
    await expect(dialog.getByRole('button', { name: 'Abrir cajón', exact: true })).toBeDisabled();
    await dialog.getByLabel('Motivo de la apertura').fill('Cambiar un billete grande');
    const before = (await writes(page)).length;
    await dialog.getByRole('button', { name: 'Abrir cajón', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await writes(page)).length).toBe(before + 1);
    const audit = await db().auditLog.findFirstOrThrow({ where: { companyId, entity: 'CashShift', userId: cashierId }, orderBy: { createdAt: 'desc' } });
    expect(audit.metadata).toMatchObject({ evento: 'APERTURA_CAJON_SIN_VENTA', motivo: 'Cambiar un billete grande' });
  });

  test('con la impresión directa la boleta sale por el puerto, con el pulso del cajón en el mismo trabajo', async () => {
    await setHardware(page, { ...serialConfig, printAfterSale: true });
    await scan(page, skuB);
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await chargeCash(page, '5000');
    // La boleta viaja por tandas de 256 bytes (sin control de flujo, una larga desbordaría la impresora): se une todo.
    await expect.poll(async () => (await writes(page)).flat().length).toBeGreaterThan(200);
    const job = (await writes(page)).flat();
    expect(job.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]); // inicializa y elige la tabla PC858
    expect(job.slice(5, 10)).toEqual(PULSE); // el cajón se abre mientras sale la boleta
    const text = Buffer.from(job).toString('latin1');
    expect(text).toContain('BOLETA ELECTR');
    expect(text).toContain('RUT: 66.666.666-6');
    expect(text).toContain('$2.380');
    expect(job.slice(-3)).toEqual([0x1d, 0x56, 0x01]); // corte
  });

  test('una venta se deja en espera, se atiende a otro cliente y se retoma', async () => {
    await setHardware(page, serialConfig);
    await scan(page, skuA);
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await page.keyboard.press('F6');
    await expect(page.getByRole('button', { name: /^En espera \(1\)/ })).toBeVisible();
    await expect(page.getByLabel(`Cantidad de ${nameA}`, { exact: true })).toHaveCount(0);

    await scan(page, skuB);
    await expect(page.getByRole('heading', { name: '¿Boleta con RUT?', exact: true })).toBeVisible();
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await page.keyboard.press('F7');
    const dialog = page.getByRole('dialog', { name: 'Ventas en espera' });
    await dialog.getByRole('button', { name: 'Retomar' }).click();
    // Retomar con una venta en curso la deja en espera: se intercambian.
    await expect(page.getByLabel(`Cantidad de ${nameA}`, { exact: true })).toHaveValue('1');
    await expect(page.getByLabel(`Cantidad de ${nameB}`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^En espera \(1\)/ })).toBeVisible();
    // Vaciar lo que quedó para no afectar otras pruebas.
    await page.getByRole('button', { name: 'Cancelar venta', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button').last().click();
  });

  test('sin cajón configurado, el botón lleva a configurarlo y el POS sigue vendiendo', async () => {
    await setHardware(page, { mode: 'none', sounds: false });
    await page.getByRole('button', { name: /^Abrir cajón F8/ }).click();
    await expect(page.getByRole('dialog', { name: 'Cajón e impresora' })).toBeVisible();
    await page.keyboard.press('Escape');
    await scan(page, skuA);
    await page.getByLabel('RUT del cliente', { exact: true }).press('Enter');
    await chargeCash(page, '1190');
    expect(await writes(page)).toEqual([]);
  });
});
