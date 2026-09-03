import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { generateValidRutForTest } from './lib/test-rut';
import { cleanRut } from '../src/lib/chile/rut';
import { createSalesDocument, cancelSalesDocument } from '../src/modules/sales/services/sales.service';

/**
 * Verifica las correcciones de la auditoría (Nota de Crédito y Guía de
 * Despacho) contra la base real: doble descuento de stock cuando una Factura
 * referencia una Guía ya emitida, devolución acumulativa sin tope real
 * entre varias Notas de Crédito, la NC anulando su propio efecto en Tesorería
 * al emitirse, y la reversión completa (stock + crédito) al anular una NC.
 */

const RUN_TAG = `NC_FIX_${Date.now()}`;
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function cleanupCompany(companyId: string): Promise<void> {
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.salesDocument.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.stock.deleteMany({ where: { companyId } });
  await prisma.folioSequence.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.contact.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

async function main() {
  console.log(`=== Verificación de correcciones NC / Guía de Despacho (${RUN_TAG}) ===\n`);

  const company = await prisma.company.create({
    data: { rut: generateValidRutForTest(), businessName: `${RUN_TAG} Empresa` },
  });

  try {
    const warehouse = await prisma.warehouse.create({
      data: { companyId: company.id, name: 'Matriz', code: 'M1', isDefault: true },
    });
    const clienteRut = generateValidRutForTest();
    const cliente = await prisma.contact.create({
      data: { companyId: company.id, rut: clienteRut, rutClean: cleanRut(clienteRut), razonSocial: `${RUN_TAG} Cliente`, isCustomer: true },
    });
    const product = await prisma.product.create({
      data: { companyId: company.id, sku: `${RUN_TAG}-1`, name: 'Producto', unit: 'UN', isTrackable: true },
    });
    // Stock inicial: entra directo a Stock/Product para no depender del flujo de compra.
    await prisma.product.update({ where: { id: product.id }, data: { costPricePMP: 10000 } });
    await prisma.stock.create({ data: { companyId: company.id, productId: product.id, warehouseId: warehouse.id, quantity: 100 } });

    console.log('1. Guía de Despacho + Factura no descuenta stock dos veces');
    const guia = await createSalesDocument(
      company.id,
      {
        contactId: cliente.id,
        warehouseId: warehouse.id,
        dteType: 'GUIA_DESPACHO_52',
        paymentMethod: 'TRANSFERENCIA',
        items: [{ productId: product.id, description: 'Despacho', quantity: 20, unitPrice: 15000 }],
      },
      'ISSUED'
    );
    let stock = await prisma.stock.findFirst({ where: { companyId: company.id, productId: product.id, warehouseId: warehouse.id } });
    check('Stock tras la guía (100 -> 80)', stock?.quantity === 80, String(stock?.quantity));

    const facturaDiferida = await createSalesDocument(
      company.id,
      {
        contactId: cliente.id,
        warehouseId: warehouse.id,
        dteType: 'FACTURA_33',
        paymentMethod: 'TRANSFERENCIA',
        referenceFolio: guia.folio!,
        referenceType: 'GUIA_DESPACHO_52',
        items: [{ productId: product.id, description: 'Despacho', quantity: 20, unitPrice: 15000 }],
      },
      'ISSUED'
    );
    stock = await prisma.stock.findFirst({ where: { companyId: company.id, productId: product.id, warehouseId: warehouse.id } });
    check('Stock NO se descuenta de nuevo al facturar la guía (sigue en 80)', stock?.quantity === 80, String(stock?.quantity));

    console.log('\n2. Venta normal + Nota de Crédito parcial cancela el saldo en Tesorería');
    const venta = await createSalesDocument(
      company.id,
      {
        contactId: cliente.id,
        warehouseId: warehouse.id,
        dteType: 'FACTURA_33',
        paymentMethod: 'TRANSFERENCIA',
        items: [{ productId: product.id, description: 'Venta', quantity: 10, unitPrice: 20000 }],
      },
      'ISSUED'
    );
    stock = await prisma.stock.findFirst({ where: { companyId: company.id, productId: product.id, warehouseId: warehouse.id } });
    check('Stock tras la venta (80 -> 70)', stock?.quantity === 70, String(stock?.quantity));

    const nc1 = await createSalesDocument(
      company.id,
      {
        contactId: cliente.id,
        warehouseId: warehouse.id,
        dteType: 'NOTA_CREDITO_61',
        paymentMethod: 'TRANSFERENCIA',
        referenceFolio: venta.folio!,
        referenceType: 'FACTURA_33',
        items: [{ productId: product.id, description: 'Devolución parcial', quantity: 4, unitPrice: 20000 }],
      },
      'ISSUED'
    );
    stock = await prisma.stock.findFirst({ where: { companyId: company.id, productId: product.id, warehouseId: warehouse.id } });
    check('Stock reingresa con la NC (70 -> 74)', stock?.quantity === 74, String(stock?.quantity));

    const ventaAfterNc = await prisma.salesDocument.findUniqueOrThrow({ where: { id: venta.id } });
    check(
      'La Factura original refleja el crédito aplicado (paidAmount = NC.totalAmount)',
      ventaAfterNc.paidAmount === nc1.totalAmount,
      `paidAmount=${ventaAfterNc.paidAmount} nc.totalAmount=${nc1.totalAmount}`
    );
    check('La Factura queda PARTIAL, no UNPAID ni PAID', ventaAfterNc.paymentStatus === 'PARTIAL', ventaAfterNc.paymentStatus);

    const nc1Reloaded = await prisma.salesDocument.findUniqueOrThrow({ where: { id: nc1.id } });
    check('La NC en sí queda PAID (no es su propia cuenta por cobrar)', nc1Reloaded.paymentStatus === 'PAID', nc1Reloaded.paymentStatus);

    console.log('\n2b. El resumen tributario del reporte Excel resta la NC en vez de sumarla');
    const { buildReportDataset } = await import('../src/modules/reports/services/dataset.service');
    const dataset = await buildReportDataset(company.id, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    // En el rango quedan 3 documentos tributarios reales (la guía del paso 1
    // no cuenta, no es hecho tributario): facturaDiferida 20un.x$15.000=$300.000,
    // venta 10un.x$20.000=$200.000, NC 4un.x$20.000=$80.000 (resta).
    // Netas = 300.000 + 200.000 - 80.000 = 420.000. IVA = 19% de cada uno, con igual signo.
    // Si la Guía se contara como hecho tributario, este número sería 720.000
    // (300.000 de más) en vez de 420.000 — la prueba de que quedó excluida.
    check('Ventas netas del resumen incluye la Factura diferida, resta la NC y excluye la Guía', dataset.resumenTributario.ventasNetas === 420000, String(dataset.resumenTributario.ventasNetas));
    check('IVA débito del resumen resta la NC en vez de sumarla', dataset.resumenTributario.ivaDebito === 79800, String(dataset.resumenTributario.ivaDebito));

    console.log('\n3. No se puede acreditar más de lo que queda disponible entre varias NC');
    let rejected = false;
    try {
      await createSalesDocument(
        company.id,
        {
          contactId: cliente.id,
          warehouseId: warehouse.id,
          dteType: 'NOTA_CREDITO_61',
          paymentMethod: 'TRANSFERENCIA',
          referenceFolio: venta.folio!,
          referenceType: 'FACTURA_33',
          // La venta fue de 10, ya se acreditaron 4: quedan 6 disponibles. Se pide 7.
          items: [{ productId: product.id, description: 'Devolución excesiva', quantity: 7, unitPrice: 20000 }],
        },
        'ISSUED'
      );
    } catch {
      rejected = true;
    }
    check('Una segunda NC que excede lo disponible es rechazada, no recortada en silencio', rejected);

    console.log('\n4. Anular la Nota de Crédito revierte stock y el crédito aplicado');
    await cancelSalesDocument(company.id, nc1.id);
    stock = await prisma.stock.findFirst({ where: { companyId: company.id, productId: product.id, warehouseId: warehouse.id } });
    check('Stock vuelve a 70 al anular la NC', stock?.quantity === 70, String(stock?.quantity));

    const ventaAfterCancel = await prisma.salesDocument.findUniqueOrThrow({ where: { id: venta.id } });
    check('La Factura original vuelve a UNPAID al anular la NC que la saldaba', ventaAfterCancel.paymentStatus === 'UNPAID', ventaAfterCancel.paymentStatus);
    check('paidAmount de la Factura vuelve a 0', ventaAfterCancel.paidAmount === 0, String(ventaAfterCancel.paidAmount));
  } finally {
    console.log('\n=== Limpieza ===');
    await cleanupCompany(company.id);
    console.log('Empresa de prueba eliminada');
    await prisma.$disconnect();
  }

  console.log(`\n=== RESULTADO: ${passed} OK, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error('\nERROR FATAL:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
