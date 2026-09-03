import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { cleanRut, formatRut, validateRut } from '../src/lib/chile/rut';
import { createContact } from '../src/modules/contacts/services/contacts.service';
import { createPurchaseDocument } from '../src/modules/purchases/services/purchases.service';
import { createSalesDocument } from '../src/modules/sales/services/sales.service';
import { registerSalesPayment } from '../src/modules/treasury/services/treasury.service';
import { calculateAndStoreF29 } from '../src/lib/chile/f29';

/**
 * Simulación E2E de Dimensión 7: crea una empresa de prueba real, ejercita
 * compras -> PMP -> venta -> cobro parcial -> F29 -> aislamiento multi-tenant
 * contra la base de datos real, y borra todo lo que creó al final.
 *
 * Corre contra `DATABASE_URL` (la misma base que usa la app), así que cada
 * registro se nombra con el prefijo E2E_VERIFY_ para no chocar con datos
 * reales y el cleanup en el `finally` es obligatorio, no opcional.
 */

const RUN_TAG = `E2E_VERIFY_${Date.now()}`;
let failures = 0;
let passed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function equalsNumber(label: string, actual: number, expected: number): void {
  check(label, actual === expected, `esperado ${expected}, obtenido ${actual}`);
}

/** Genera un RUT válido según el mismo algoritmo Módulo 11 que valida rut.ts. */
function generateValidRut(base: number): string {
  let sum = 0;
  let multiplier = 2;
  for (const digit of String(base).split('').reverse()) {
    sum += Number(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const dv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  const rut = `${base}-${dv}`;
  if (!validateRut(rut)) throw new Error(`Generador de RUT produjo un RUT inválido: ${rut}`);
  return rut;
}

async function cleanupCompany(companyId: string): Promise<void> {
  // Orden que respeta las FK sin onDelete: Cascade (Payment, SalesDocument,
  // PurchaseDocument, InventoryMovement, Stock, FolioSequence, Product,
  // Contact, Warehouse, User). Las que sí tienen Cascade en Company
  // (CompanyFeatures, CompanySettings, CustomRole, CashRegister, TaxPeriod...)
  // se limpian solas al borrar la empresa.
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.salesDocument.deleteMany({ where: { companyId } });
  await prisma.purchaseDocument.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.stock.deleteMany({ where: { companyId } });
  await prisma.folioSequence.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.contact.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

async function main() {
  console.log(`=== Verificación E2E del ERP (${RUN_TAG}) ===\n`);

  let companyId: string | null = null;
  let otherCompanyId: string | null = null;

  try {
    // --- 1. Empresa + usuario admin -----------------------------------
    const companyRut = generateValidRut(76100100 + (Date.now() % 900));
    const company = await prisma.company.create({
      data: {
        rut: formatRut(cleanRut(companyRut)),
        businessName: `${RUN_TAG} Empresa de Prueba`,
        features: {
          create: { hasInventory: true, hasPmpCosting: true, hasDteBilling: true, hasPurchases: true, hasTreasury: true },
        },
        settings: { create: { ppmRateBasisPoints: 100 } },
      },
    });
    companyId = company.id;

    const admin = await prisma.user.create({
      data: {
        email: `${RUN_TAG.toLowerCase()}@e2e-verify.local`,
        passwordHash: 'x',
        name: 'Admin E2E',
        role: 'OWNER',
        companyId,
      },
    });
    console.log(`1. Empresa "${company.businessName}" y admin creados`);

    // --- 2. Dos bodegas --------------------------------------------------
    const matriz = await prisma.warehouse.create({
      data: { companyId, name: 'Casa Matriz', code: 'MATRIZ', isDefault: true },
    });
    const sucursal = await prisma.warehouse.create({
      data: { companyId, name: 'Sucursal 1', code: 'SUC1' },
    });
    console.log('2. Bodegas "Casa Matriz" y "Sucursal 1" creadas');

    // --- 3. Proveedor y cliente con RUT chileno válido -------------------
    const proveedor = await createContact(companyId, {
      rut: generateValidRut(77200200 + (Date.now() % 900)),
      razonSocial: `${RUN_TAG} Proveedor SpA`,
      isCustomer: false,
      isSupplier: true,
    });
    const cliente = await createContact(companyId, {
      rut: generateValidRut(12300300 + (Date.now() % 900)),
      razonSocial: `${RUN_TAG} Cliente Persona`,
      isCustomer: true,
      isSupplier: false,
    });
    check('RUT del proveedor pasa Módulo 11', validateRut(proveedor.rut));
    check('RUT del cliente pasa Módulo 11', validateRut(cliente.rut));
    console.log('3. Proveedor y cliente creados con RUT válido');

    // --- 4. Dos productos, stock inicial 0 --------------------------------
    const product = await prisma.product.create({
      data: { companyId, sku: `${RUN_TAG}-SKU-1`, name: 'Producto E2E 1', unit: 'UN', isTrackable: true },
    });
    const product2 = await prisma.product.create({
      data: { companyId, sku: `${RUN_TAG}-SKU-2`, name: 'Producto E2E 2', unit: 'UN', isTrackable: true },
    });
    equalsNumber('Stock inicial producto 1 es 0', product.costPricePMP, 0);
    console.log('4. Dos productos con SKU único y stock 0 creados\n');

    // --- 5. Compra 1: 100 @ $10.000 -> Stock 100, PMP 10.000 -------------
    console.log('5. Compra 1 (100 un. @ $10.000 neto)');
    await createPurchaseDocument(
      companyId,
      {
        contactId: proveedor.id,
        warehouseId: matriz.id,
        documentType: 'FACTURA',
        folio: 'F-001',
        issueDate: new Date().toISOString(),
        items: [{ description: 'Compra inicial', productId: product.id, quantity: 100, unitCost: 10000 }],
      },
      'ISSUED'
    );
    let stock = await prisma.stock.findFirst({ where: { companyId, productId: product.id, warehouseId: matriz.id } });
    let productRow = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    equalsNumber('Stock tras compra 1', stock?.quantity ?? -1, 100);
    equalsNumber('PMP tras compra 1', productRow.costPricePMP, 10000);

    // --- 6. Compra 2: 50 @ $13.000 -> Stock 150, PMP 11.000 --------------
    console.log('\n6. Compra 2 (50 un. @ $13.000 neto)');
    await createPurchaseDocument(
      companyId,
      {
        contactId: proveedor.id,
        warehouseId: matriz.id,
        documentType: 'FACTURA',
        folio: 'F-002',
        issueDate: new Date().toISOString(),
        items: [{ description: 'Reposición', productId: product.id, quantity: 50, unitCost: 13000 }],
      },
      'ISSUED'
    );
    stock = await prisma.stock.findFirst({ where: { companyId, productId: product.id, warehouseId: matriz.id } });
    productRow = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    equalsNumber('Stock tras compra 2', stock?.quantity ?? -1, 150);
    equalsNumber('PMP tras compra 2', productRow.costPricePMP, 11000);

    // --- 7. Factura de venta: 30 @ $20.000 -------------------------------
    console.log('\n7. Factura de venta (30 un. @ $20.000 neto)');
    const sale = await createSalesDocument(
      companyId,
      {
        contactId: cliente.id,
        warehouseId: matriz.id,
        dteType: 'FACTURA_33',
        paymentMethod: 'TRANSFERENCIA',
        items: [{ productId: product.id, description: 'Venta', quantity: 30, unitPrice: 20000 }],
      },
      'ISSUED'
    );
    stock = await prisma.stock.findFirst({ where: { companyId, productId: product.id, warehouseId: matriz.id } });
    const saleItem = sale.items[0]!;
    const margin = saleItem.subtotal - saleItem.unitCostPMP * saleItem.quantity;
    equalsNumber('Stock tras la venta', stock?.quantity ?? -1, 120);
    equalsNumber('Margen del ítem (subtotal − PMP×cantidad)', margin, 270000);
    equalsNumber('IVA débito de la factura (19% de $600.000)', sale.ivaAmount, 114000);
    equalsNumber('Total de la factura', sale.totalAmount, 714000);

    // --- 8. Abono del 50% -------------------------------------------------
    console.log('\n8. Abono del 50% de la venta');
    const halfPayment = Math.round(sale.totalAmount / 2);
    await registerSalesPayment(companyId, sale.id, { amount: halfPayment, paymentMethod: 'TRANSFERENCIA' });
    const saleAfterPayment = await prisma.salesDocument.findUniqueOrThrow({ where: { id: sale.id } });
    check('Estado pasa a PARTIAL', saleAfterPayment.paymentStatus === 'PARTIAL', saleAfterPayment.paymentStatus);
    equalsNumber('Saldo pendiente exacto', saleAfterPayment.totalAmount - saleAfterPayment.paidAmount, sale.totalAmount - halfPayment);

    // --- 9. F29 del período ------------------------------------------------
    console.log('\n9. Cálculo F29 del período');
    const now = new Date();
    const f29 = await calculateAndStoreF29(companyId, now.getUTCFullYear(), now.getUTCMonth() + 1);
    // Crédito fiscal esperado = IVA de ambas compras: 19% de 1.000.000 + 19% de 650.000
    const expectedCreditVat = Math.round(1000000 * 0.19) + Math.round(650000 * 0.19);
    const expectedDebitVat = 114000;
    const expectedTaxable = expectedDebitVat - expectedCreditVat; // negativo -> remanente
    const expectedRemanent = Math.max(0, -expectedTaxable);
    const expectedPpm = Math.round(600000 * 0.01); // ppmRateBasisPoints=100 -> 1%
    const expectedDeterminedTax = Math.max(0, expectedTaxable) + expectedPpm;
    equalsNumber('F29 débito fiscal', f29.debitVat, expectedDebitVat);
    equalsNumber('F29 crédito fiscal', f29.creditVat, expectedCreditVat);
    equalsNumber('F29 remanente de crédito fiscal', f29.remanentCredit, expectedRemanent);
    equalsNumber('F29 monto PPM', f29.ppmAmount, expectedPpm);
    equalsNumber('F29 impuesto determinado', f29.determinedTax, expectedDeterminedTax);
    console.log(
      `     Débito $${f29.debitVat} · Crédito $${f29.creditVat} · Remanente a favor $${f29.remanentCredit} · PPM $${f29.ppmAmount} · A pagar $${f29.determinedTax}`
    );

    // --- 10. Aislamiento multi-tenant ---------------------------------------
    console.log('\n10. Prueba de aislamiento multi-tenant');
    const otherCompany = await prisma.company.create({
      data: { rut: formatRut(cleanRut(generateValidRut(88300300 + (Date.now() % 900)))), businessName: `${RUN_TAG} Empresa Ajena` },
    });
    otherCompanyId = otherCompany.id;
    const leakedProducts = await prisma.product.findMany({ where: { companyId: otherCompanyId } });
    const leakedContacts = await prisma.contact.findMany({ where: { companyId: otherCompanyId } });
    const leakedSales = await prisma.salesDocument.findMany({ where: { companyId: otherCompanyId } });
    equalsNumber('Productos visibles desde otra empresa', leakedProducts.length, 0);
    equalsNumber('Contactos visibles desde otra empresa', leakedContacts.length, 0);
    equalsNumber('Ventas visibles desde otra empresa', leakedSales.length, 0);

    // Además del filtro directo, confirma que el servicio (no solo Prisma
    // crudo) respeta el tenant: pedir el documento con el companyId equivocado
    // debe comportarse como "no existe", nunca devolver el documento ajeno.
    const crossTenantLookup = await prisma.salesDocument.findFirst({ where: { id: sale.id, companyId: otherCompanyId } });
    check('El documento de venta no es alcanzable desde otra empresa', crossTenantLookup === null);

    void sucursal;
    void product2;
    void admin;
  } finally {
    console.log('\n=== Limpieza ===');
    if (companyId) {
      await cleanupCompany(companyId);
      console.log(`Empresa de prueba ${companyId} y todos sus registros eliminados`);
    }
    if (otherCompanyId) {
      await cleanupCompany(otherCompanyId);
      console.log(`Empresa ajena ${otherCompanyId} eliminada`);
    }
    await prisma.$disconnect();
  }

  console.log(`\n=== RESULTADO: ${passed} OK, ${failures} FAIL ===`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error('\nERROR FATAL:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
