import { expect, test } from '@playwright/test';
import { formatSupplierCode, hashSupplierCode, newSupplierCode, supplierCodeHint } from '../src/lib/supplier-portal/code';
import { STATE } from './bodega-support';
import { db, disableGuidedTour, owner } from './db';

/**
 * Sellers en consignación (Inventario → Consignación): la empresa crea un seller con su comisión y un producto
 * suyo, recibe su mercadería, le liquida lo vendido menos la comisión, marca la liquidación pagada, y el seller
 * ve sus propios montos en su portal sin clientes ni costos. Lo que tiene pantalla se hace por la pantalla; la
 * venta se arma directo en la base (emitirla pasa por Ventas y POS, probados en `tests/consignment-db.test.ts`).
 */

test.use(STATE);

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const SELLER = `Productora E2E ${RUN}`;
const PRODUCT = `Miel E2E ${RUN} 500 g`;
const SKU = `CS-${RUN}`;
const CUSTOMER = `Cliente Reservado E2E ${RUN}`;

/** RUT válido (módulo 11) al azar: cada corrida crea su propio seller. */
function validRut(): string {
  const body = String(70_000_000 + Math.floor(Math.random() * 9_000_000));
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return `${body}${rest === 11 ? '0' : rest === 10 ? 'K' : String(rest)}`;
}

test.describe('sellers en consignación', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
    // «Configuremos tu empresa» se abre sobre una empresa recién creada y tapa los formularios; se descarta
    // con la misma marca que guarda la app cuando la persona lo cierra.
    const { companyId } = await owner();
    await context.addInitScript((id) => {
      try {
        window.localStorage.setItem(`onboarding-dismissed:${id}`, '1');
      } catch {
        /* sin storage: el asistente se ofrecería igual */
      }
    }, companyId);
  });

  test.afterAll(async () => {
    await db().$disconnect();
  });

  test('crear seller y producto, recibir, liquidar, pagar y verlo en el portal del seller', async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { companyId } = await owner();
    await db().companyFeatures.upsert({ where: { companyId }, update: { hasInventory: true }, create: { companyId, hasInventory: true } });

    // 1. El seller se crea desde Contactos, con su comisión.
    await page.goto('/dashboard/contacts?new=1');
    await page.locator('#rut').fill(validRut());
    await page.locator('#razonSocial').fill(SELLER);
    await page.getByLabel('Seller (consignación)').check();
    await page.locator('#consignmentCommission').fill('20');
    await page.getByRole('button', { name: 'Crear contacto' }).click();
    await expect.poll(() => db().contact.findFirst({ where: { companyId, razonSocial: SELLER }, select: { isConsignor: true } })).toEqual({ isConsignor: true });
    const seller = await db().contact.findFirstOrThrow({ where: { companyId, razonSocial: SELLER }, select: { id: true, consignmentCommissionBps: true } });
    expect(seller.consignmentCommissionBps, '20 % se guarda como 2000 puntos base').toBe(2000);

    // 2. Su producto, con el seller como dueño.
    await page.goto('/dashboard/products');
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await page.locator('#sku').fill(SKU);
    await page.locator('#name').fill(PRODUCT);
    await page.locator('#netPrice').fill('3000');
    await page.locator('#consignorId').selectOption({ label: `Seller: ${SELLER}` });
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect.poll(() => db().product.findFirst({ where: { companyId, sku: SKU }, select: { consignorId: true } })).toEqual({ consignorId: seller.id });
    const product = await db().product.findFirstOrThrow({ where: { companyId, sku: SKU }, select: { id: true, costPricePMP: true } });
    expect(Number(product.costPricePMP), 'la mercadería de un seller no se valoriza').toBe(0);

    // 3. Recibe 10 unidades en la pantalla de Consignación.
    await page.goto('/dashboard/inventory/consignment');
    await expect(page.getByRole('heading', { name: SELLER })).toBeVisible();
    await page.getByRole('button', { name: `Recibir mercadería de ${PRODUCT}` }).click();
    await expect(page.getByRole('heading', { name: 'Recibir mercadería del seller' })).toBeVisible();
    await page.locator('#consignment-quantity').fill('10');
    await page.locator('#consignment-reference').fill('Guía E2E 123');
    await page.getByRole('button', { name: 'Recibir', exact: true }).click();
    await expect(page.getByRole('row', { name: new RegExp(PRODUCT) }).getByText(/^10\b/)).toBeVisible({ timeout: 20_000 });
    const stock = await db().stock.aggregate({ where: { companyId, productId: product.id }, _sum: { quantity: true } });
    expect(Number(stock._sum.quantity)).toBe(10);
    const movement = await db().inventoryMovement.findFirstOrThrow({ where: { companyId, productId: product.id }, select: { type: true, supplierId: true, unitCost: true } });
    expect(movement.type).toBe('PURCHASE_IN');
    expect(movement.supplierId, 'la llegada queda a nombre del seller').toBe(seller.id);
    expect(Number(movement.unitCost)).toBe(0);

    // 4. Se venden 3 unidades (neto $9.000) a un cliente que el seller nunca debe ver.
    const warehouse = await db().warehouse.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } });
    const customerRut = validRut();
    const customer = await db().contact.create({ data: { companyId, razonSocial: CUSTOMER, rut: `${customerRut.slice(0, -1)}-${customerRut.slice(-1)}`, rutClean: customerRut, isCustomer: true }, select: { id: true } });
    await db().salesDocument.create({
      data: {
        companyId,
        contactId: customer.id,
        warehouseId: warehouse.id,
        dteType: 'BOLETA_39',
        folio: 800_000 + Math.floor(Math.random() * 90_000),
        status: 'ISSUED',
        paymentMethod: 'EFECTIVO',
        netAmount: 9000,
        totalAmount: 9000,
        items: { create: [{ companyId, productId: product.id, description: PRODUCT, quantity: 3, unitPrice: 3000, subtotal: 9000, iva: 0, total: 9000, consignorId: seller.id, consignorCommissionBps: 2000 }] },
      },
    });

    // 5. Liquidación: neto $9.000 − comisión 20 % ($1.800) = $7.200 al seller.
    const entriesBefore = await db().journalEntry.count({ where: { companyId } });
    await page.goto('/dashboard/inventory/consignment');
    await page.getByRole('tab', { name: 'Liquidaciones' }).click();
    await page.getByRole('button', { name: `Liquidar a ${SELLER}` }).click();
    await expect(page.getByRole('heading', { name: `Liquidar a ${SELLER}` })).toBeVisible();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('$7.200').first()).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Generar liquidación' }).click();
    await expect(page.getByText(/\$7\.200 al seller/)).toBeVisible({ timeout: 20_000 });
    const settlement = await db().sellerSettlement.findFirstOrThrow({ where: { companyId, consignorId: seller.id }, select: { number: true, status: true, payoutAmount: true, commissionAmount: true, netSales: true } });
    expect(settlement).toMatchObject({ status: 'CONFIRMED', payoutAmount: 7200, commissionAmount: 1800, netSales: 9000 });

    // 6. Pagarla deja constancia, sin tocar la contabilidad.
    await page.getByRole('button', { name: `Marcar pagada la liquidación N° ${settlement.number}` }).click();
    await page.locator('#settlement-reference').fill('TRF-E2E-1');
    await page.getByRole('button', { name: 'Marcar como pagada' }).click();
    await expect.poll(async () => (await db().sellerSettlement.findFirstOrThrow({ where: { companyId, consignorId: seller.id }, select: { status: true } })).status).toBe('PAID');
    expect(await db().journalEntry.count({ where: { companyId } }), 'liquidar y pagar no genera asientos').toBe(entriesBefore);

    // 7. El seller entra a su portal con su código y ve sus montos, no al cliente ni costos.
    const raw = newSupplierCode();
    await db().supplierPortalAccess.upsert({
      where: { contactId: seller.id },
      create: { companyId, contactId: seller.id, codeHash: hashSupplierCode(raw), codeHint: supplierCodeHint(raw) },
      update: { codeHash: hashSupplierCode(raw), codeHint: supplierCodeHint(raw) },
    });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const portal = await context.newPage();
    await portal.goto('/proveedor');
    await portal.getByLabel('Tu código de acceso').fill(formatSupplierCode(raw));
    await portal.getByRole('button', { name: 'Ver mi inventario' }).click();
    await expect(portal.getByRole('heading', { name: 'Tu mercadería en consignación' })).toBeVisible({ timeout: 20_000 });
    await expect(portal.getByText(PRODUCT)).toBeVisible();
    await expect(portal.getByRole('heading', { name: 'Tus liquidaciones' })).toBeVisible();
    await expect(portal.getByText('$7.200').first()).toBeVisible();
    await expect(portal.getByText('Pagada', { exact: false }).first()).toBeVisible();
    await expect(portal.getByText(CUSTOMER), 'el seller no ve a los clientes').toHaveCount(0);
    await context.close();
  });
});
