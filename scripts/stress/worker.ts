/**
 * Proceso trabajador de la prueba de estrés de concurrencia
 * (`scripts/stress/concurrency.ts`). Cada proceso tiene su propio pool de
 * Prisma (máx. 5 conexiones, igual que una instancia serverless de Vercel) y
 * lanza `STRESS_CONCURRENCY` operaciones a la vez contra los MISMOS servicios
 * que usan las pantallas. Al terminar imprime UNA línea JSON con el resultado
 * de cada operación; el orquestador junta todas y revisa los invariantes.
 *
 * No se corre a mano: lo lanza el orquestador.
 */
import { createSalesDocument } from '../../src/modules/sales/services/sales.service';
import { salesDocumentCreateSchema } from '../../src/modules/sales/schema';
import { createPosSale } from '../../src/modules/pos/services/pos.service';
import { posSaleSchema } from '../../src/modules/pos/schema';
import { createPurchaseDocument } from '../../src/modules/purchases/services/purchases.service';
import { purchaseDocumentCreateSchema } from '../../src/modules/purchases/schema';
import { registerSalesPayment } from '../../src/modules/treasury/services/treasury.service';
import { registerPaymentSchema } from '../../src/modules/treasury/schema';
import { prisma } from '../../src/lib/prisma';
import { assertLocalDatabase, type OpResult, type StressFixture } from './shared';

assertLocalDatabase();

const fixture = JSON.parse(process.env.STRESS_FIXTURE ?? '{}') as StressFixture;
const scenario = process.env.STRESS_SCENARIO ?? '';
const workerIndex = Number(process.env.STRESS_WORKER ?? 0);
const opsPerWorker = Number(process.env.STRESS_OPS ?? 10);
const concurrency = Number(process.env.STRESS_CONCURRENCY ?? 5);

function line(productId: string, quantity: number, unitPrice: number) {
  return { productId, description: 'Producto de estrés', quantity, unitPrice };
}

function buildOp(index: number): () => Promise<unknown> {
  const global = workerIndex * opsPerWorker + index;
  switch (scenario) {
    case 'hot-product':
      return () =>
        createSalesDocument(
          fixture.companyId,
          salesDocumentCreateSchema.parse({
            contactId: fixture.customerId,
            warehouseId: fixture.warehouseId,
            dteType: 'BOLETA_39',
            paymentMethod: 'EFECTIVO',
            items: [line(fixture.productHot, 1, 1000)],
          }),
          'ISSUED'
        );
    case 'lock-order':
      // Mitad de las ventas trae las líneas A→B y la otra mitad B→A: si los
      // locks se tomaran en el orden de las líneas, esto produce deadlocks.
      return () =>
        createSalesDocument(
          fixture.companyId,
          salesDocumentCreateSchema.parse({
            contactId: fixture.customerId,
            warehouseId: fixture.warehouseId,
            dteType: 'FACTURA_33',
            paymentMethod: 'TRANSFERENCIA',
            items:
              global % 2 === 0
                ? [line(fixture.productA, 1, 1000), line(fixture.productB, 1, 1000)]
                : [line(fixture.productB, 1, 1000), line(fixture.productA, 1, 1000)],
          }),
          'ISSUED'
        );
    case 'mixed-lock-order':
      // Factura [A,B] contra boleta [B,A]: usan correlativos de folio
      // distintos, así que el lock del folio no las serializa entre sí y el
      // orden de los locks de producto queda expuesto.
      return () =>
        createSalesDocument(
          fixture.companyId,
          salesDocumentCreateSchema.parse({
            contactId: fixture.customerId,
            warehouseId: fixture.warehouseId,
            dteType: global % 2 === 0 ? 'FACTURA_33' : 'BOLETA_39',
            paymentMethod: 'TRANSFERENCIA',
            items:
              global % 2 === 0
                ? [line(fixture.productA, 1, 1000), line(fixture.productB, 1, 1000)]
                : [line(fixture.productB, 1, 1000), line(fixture.productA, 1, 1000)],
          }),
          'ISSUED'
        );
    case 'purchase-lock-order':
      return () =>
        createPurchaseDocument(
          fixture.companyId,
          purchaseDocumentCreateSchema.parse({
            contactId: fixture.supplierId,
            warehouseId: fixture.warehouseId,
            documentType: 'FACTURA',
            folio: `${fixture.runId}-LO-${global}`,
            issueDate: new Date().toISOString().slice(0, 10),
            items:
              global % 2 === 0
                ? [{ description: 'A', productId: fixture.productA, quantity: 1, unitCost: 500 }, { description: 'B', productId: fixture.productB, quantity: 1, unitCost: 500 }]
                : [{ description: 'B', productId: fixture.productB, quantity: 1, unitCost: 500 }, { description: 'A', productId: fixture.productA, quantity: 1, unitCost: 500 }],
          }),
          'ISSUED',
          true
        );
    case 'distinct-products':
      // Boletas desde Ventas (sin turno de caja), cada una de un producto
      // distinto: lo único que comparten es el correlativo de folio.
      return () =>
        createSalesDocument(
          fixture.companyId,
          salesDocumentCreateSchema.parse({
            contactId: fixture.customerId,
            warehouseId: fixture.warehouseId,
            dteType: 'BOLETA_39',
            paymentMethod: 'EFECTIVO',
            items: [line(fixture.productsMany[global % fixture.productsMany.length]!, 1, 1000)],
          }),
          'ISSUED'
        );
    case 'idempotency':
      return () =>
        createSalesDocument(
          fixture.companyId,
          salesDocumentCreateSchema.parse({
            contactId: fixture.customerId,
            warehouseId: fixture.warehouseId,
            dteType: 'FACTURA_33',
            paymentMethod: 'TRANSFERENCIA',
            idempotencyKey: fixture.idempotencyKey,
            items: [line(fixture.productA, 1, 1000)],
          }),
          'ISSUED'
        );
    case 'payments':
      return () =>
        registerSalesPayment(
          fixture.companyId,
          fixture.invoiceId,
          registerPaymentSchema.parse({ amount: fixture.paymentAmount, paymentMethod: 'TRANSFERENCIA' })
        );
    case 'purchases-pmp': {
      // Costos distintos por operación: el PMP final debe ser el promedio
      // ponderado de todas las entradas, sin importar el orden en que confirmen.
      const quantity = 1 + (global % 5);
      const unitCost = 1000 + (global % 7) * 150;
      return () =>
        createPurchaseDocument(
          fixture.companyId,
          purchaseDocumentCreateSchema.parse({
            contactId: fixture.supplierId,
            warehouseId: fixture.warehouseId,
            documentType: 'FACTURA',
            folio: `${fixture.runId}-${global}`,
            issueDate: new Date().toISOString().slice(0, 10),
            items: [{ description: 'Compra de estrés', productId: fixture.productPmp, quantity, unitCost }],
          }),
          'ISSUED',
          true
        );
    }
    case 'pos':
      return () =>
        createPosSale(
          fixture.companyId,
          fixture.userId,
          fixture.shiftId,
          posSaleSchema.parse({
            items: [{ productId: fixture.productA, quantity: 1 }],
            paymentMethod: 'EFECTIVO',
            cashReceived: 5000,
          })
        );
    default:
      throw new Error(`Escenario desconocido: ${scenario}`);
  }
}

async function main() {
  const ops = Array.from({ length: opsPerWorker }, (_, index) => buildOp(index));
  const results: OpResult[] = [];
  let next = 0;
  async function lane() {
    while (next < ops.length) {
      const op = ops[next++]!;
      const started = performance.now();
      try {
        const value = (await op()) as { id?: string } | undefined;
        results.push({ ok: true, ms: performance.now() - started, id: value?.id });
      } catch (error) {
        const err = error as { message?: string; code?: string };
        results.push({ ok: false, ms: performance.now() - started, error: String(err.message ?? error).slice(0, 300), code: err.code });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => lane()));
  process.stdout.write(`STRESS_RESULT ${JSON.stringify(results)}\n`);
  await prisma.$disconnect();
}

main().catch((error) => {
  process.stdout.write(`STRESS_RESULT ${JSON.stringify([{ ok: false, ms: 0, error: String(error) }])}\n`);
  process.exit(1);
});
