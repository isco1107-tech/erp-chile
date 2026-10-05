/**
 * Prueba de estrés de CONCURRENCIA de los caminos de escritura críticos.
 *
 * Lanza varios procesos a la vez (cada uno como una instancia serverless, con
 * su propio pool de 5 conexiones) que golpean los MISMOS servicios de las
 * pantallas, y al final revisa que los números cuadren:
 *
 *   hot-product    muchas boletas del mismo producto con stock justo: nunca
 *                  stock negativo, se vende exactamente lo que había, folios
 *                  sin repetir y todo rechazo es "Stock insuficiente".
 *   lock-order     ventas con las mismas líneas en orden inverso: sin deadlocks.
 *   mixed-lock-order  ídem, mezclando factura y boleta (correlativos distintos).
 *   purchase-lock-order  compras con las mismas líneas en orden inverso.
 *   idempotency    el mismo `idempotencyKey` enviado muchas veces a la vez: un
 *                  solo documento.
 *   payments       cobros simultáneos que suman más que la factura: lo pagado
 *                  nunca supera el total.
 *   purchases-pmp  compras simultáneas con costos distintos: stock = suma de
 *                  entradas y PMP = promedio ponderado.
 *   pos            ventas de mostrador en el mismo turno: el turno cuadra.
 *   distinct-products  boletas de productos distintos: solo compiten por el
 *                  correlativo de folio (mide cuánto lo retiene cada venta).
 *
 * SOLO contra una base LOCAL (se niega a correr si no). Preparación:
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5433/erp_stress npx prisma migrate deploy
 *   DATABASE_URL=… npx tsx prisma/seed.ts
 *   DATABASE_URL=… npx tsx scripts/seed-manual-demo.ts
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/seed-manual-demo-data.ts
 *
 * Uso:
 *
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/stress/concurrency.ts \
 *     [--workers=8] [--ops=25] [--concurrency=5] [--only=hot-product,payments]
 *
 * Deja el informe en `.stress-out/concurrency-<fecha>.json`.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { createProduct } from '../../src/modules/inventory/services/products.service';
import { productCreateSchema } from '../../src/modules/inventory/schema';
import { createPurchaseDocument } from '../../src/modules/purchases/services/purchases.service';
import { purchaseDocumentCreateSchema } from '../../src/modules/purchases/schema';
import { createSalesDocument } from '../../src/modules/sales/services/sales.service';
import { salesDocumentCreateSchema } from '../../src/modules/sales/schema';
import { createCashRegister, openShift } from '../../src/modules/pos/services/cash.service';
import { cashRegisterCreateSchema, openShiftSchema } from '../../src/modules/pos/schema';
import { assertLocalDatabase, errorKind, percentile, type OpResult, type StressFixture } from './shared';

assertLocalDatabase();

function arg(name: string, fallback: string): string {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const WORKERS = Number(arg('workers', '8'));
const OPS = Number(arg('ops', '25'));
const CONCURRENCY = Number(arg('concurrency', '5'));
const ONLY = arg('only', '').split(',').filter(Boolean);
const TOTAL = WORKERS * OPS;

async function setupFixture(): Promise<StressFixture> {
  const runId = `ST${Date.now().toString(36).toUpperCase()}`;
  const company = await prisma.company.findFirstOrThrow({ where: { rut: '99.999.999-9' } });
  const companyId = company.id;
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId, role: 'OWNER' } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId, code: 'CENTRAL' } });
  const customer = await prisma.contact.findFirstOrThrow({ where: { companyId, isCustomer: true, NOT: { rut: '66.666.666-6' } } });
  const supplier = await prisma.contact.findFirstOrThrow({ where: { companyId, isSupplier: true } });
  await prisma.companySettings.updateMany({ where: { companyId }, data: { allowNegativeStock: false } });

  const product = async (suffix: string) =>
    (
      await createProduct(
        companyId,
        productCreateSchema.parse({ sku: `${runId}-${suffix}`, name: `Estrés ${suffix} ${runId}`, netPrice: 1000, minStock: 0, isTrackable: true, isExempt: false })
      )
    ).id;
  const productHot = await product('HOT');
  const productA = await product('A');
  const productB = await product('B');
  const productPmp = await product('PMP');
  const productsMany: string[] = [];
  for (let index = 0; index < Math.min(TOTAL, 400); index++) productsMany.push(await product(`M${index}`));

  // Stock inicial: el producto "caliente" alcanza para la MITAD de las ventas
  // que se intentarán; A y B alcanzan para todas.
  await createPurchaseDocument(
    companyId,
    purchaseDocumentCreateSchema.parse({
      contactId: supplier.id,
      warehouseId: warehouse.id,
      documentType: 'FACTURA',
      folio: `${runId}-INI`,
      issueDate: new Date().toISOString().slice(0, 10),
      items: [
        { description: 'Inicial HOT', productId: productHot, quantity: Math.floor(TOTAL / 2), unitCost: 500 },
        { description: 'Inicial A', productId: productA, quantity: TOTAL * 4, unitCost: 500 },
        { description: 'Inicial B', productId: productB, quantity: TOTAL * 4, unitCost: 500 },
        ...productsMany.map((id) => ({ description: 'Inicial M', productId: id, quantity: 10, unitCost: 500 })),
      ],
    }),
    'ISSUED',
    true
  );

  // Factura a crédito para la carrera de cobros: cada cobro es 1/10 del total
  // y se intentan muchos más de 10.
  const invoice = await createSalesDocument(
    companyId,
    salesDocumentCreateSchema.parse({
      contactId: customer.id,
      warehouseId: warehouse.id,
      dteType: 'FACTURA_33',
      paymentMethod: 'CREDITO_30',
      items: [{ productId: productA, description: 'Factura de estrés', quantity: 10, unitPrice: 10_000 }],
    }),
    'ISSUED'
  );

  const register = await createCashRegister(companyId, cashRegisterCreateSchema.parse({ name: `Caja ${runId}`.slice(0, 60), warehouseId: warehouse.id }));
  const otherOpen = await prisma.cashShift.findFirst({ where: { companyId, userId: owner.id, status: 'OPEN' } });
  if (otherOpen) await prisma.cashShift.updateMany({ where: { companyId, id: otherOpen.id }, data: { status: 'CLOSED', closedAt: new Date() } });
  const shift = await openShift(companyId, owner.id, openShiftSchema.parse({ cashRegisterId: register.id, initialAmount: 0 }));

  return {
    runId,
    companyId,
    userId: owner.id,
    warehouseId: warehouse.id,
    customerId: customer.id,
    supplierId: supplier.id,
    productHot,
    productA,
    productB,
    productPmp,
    productsMany,
    idempotencyKey: `${runId}-${randomUUID()}`,
    invoiceId: invoice.id,
    paymentAmount: Math.floor(invoice.totalAmount / 10),
    shiftId: shift.id,
  };
}

function runWorker(scenario: string, index: number, fixture: StressFixture): Promise<OpResult[]> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', '--conditions=react-server', 'scripts/stress/worker.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'production', // sin el log de cada query de Prisma
        STRESS_FIXTURE: JSON.stringify(fixture),
        STRESS_SCENARIO: scenario,
        STRESS_WORKER: String(index),
        STRESS_OPS: String(OPS),
        STRESS_CONCURRENCY: String(CONCURRENCY),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('close', () => {
      const row = out.split('\n').find((value) => value.startsWith('STRESS_RESULT '));
      if (!row) {
        resolve([{ ok: false, ms: 0, error: `trabajador sin resultado: ${err.slice(-400)}` }]);
        return;
      }
      resolve(JSON.parse(row.slice('STRESS_RESULT '.length)) as OpResult[]);
    });
  });
}

interface ScenarioReport {
  scenario: string;
  attempts: number;
  ok: number;
  failed: number;
  wallMs: number;
  throughputPerSec: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: Record<string, number>;
  checks: { name: string; pass: boolean; detail: string }[];
}

async function stockOf(fixture: StressFixture, productId: string): Promise<number> {
  const row = await prisma.stock.findFirst({ where: { companyId: fixture.companyId, productId, warehouseId: fixture.warehouseId } });
  return row?.quantity ?? 0;
}

async function checksFor(scenario: string, fixture: StressFixture, results: OpResult[], before: Record<string, number>) {
  const checks: ScenarioReport['checks'] = [];
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const check = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const unexpected = (allowed: RegExp) => failed.filter((r) => !allowed.test(r.error ?? ''));

  if (scenario === 'hot-product') {
    const stock = await stockOf(fixture, fixture.productHot);
    check('Stock final nunca negativo', stock >= 0, `stock final ${stock}`);
    check('Se vendió exactamente el stock disponible', ok.length === before.hot, `vendidas ${ok.length} de ${before.hot} disponibles`);
    const bad = unexpected(/Stock insuficiente/);
    check('Todo rechazo es "Stock insuficiente" (sin deadlocks, timeouts ni pool agotado)', bad.length === 0, bad.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
    const folios = await prisma.salesDocument.findMany({ where: { companyId: fixture.companyId, id: { in: ok.map((r) => r.id!).filter(Boolean) } }, select: { folio: true } });
    const unique = new Set(folios.map((f) => f.folio));
    check('Folios únicos', unique.size === folios.length, `${unique.size} únicos de ${folios.length}`);
    const sorted = [...unique].filter((f): f is number => f !== null).sort((a, b) => a - b);
    const gaps = sorted.length > 1 ? sorted[sorted.length - 1]! - sorted[0]! + 1 - sorted.length : 0;
    check('Folios correlativos sin huecos', gaps === 0, `${gaps} huecos entre ${sorted[0]} y ${sorted[sorted.length - 1]}`);
    const movements = await prisma.inventoryMovement.count({ where: { companyId: fixture.companyId, productId: fixture.productHot, type: 'SALE_OUT' } });
    check('Un movimiento de Kardex por venta', movements === ok.length, `${movements} movimientos / ${ok.length} ventas`);
  }
  if (scenario === 'lock-order' || scenario === 'mixed-lock-order' || scenario === 'purchase-lock-order') {
    const deadlocks = failed.filter((r) => /deadlock|40P01/i.test(`${r.error} ${r.code}`));
    check('Sin deadlocks', deadlocks.length === 0, `${deadlocks.length} deadlocks`);
    const bad = unexpected(/^$/);
    check('Sin errores', bad.length === 0, bad.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
    const a = await stockOf(fixture, fixture.productA);
    const b = await stockOf(fixture, fixture.productB);
    const delta = scenario === 'purchase-lock-order' ? -ok.length : ok.length;
    check('Stock de A y B se movió lo mismo que los documentos', before.a - a === delta && before.b - b === delta, `A ${a - before.a}, B ${b - before.b}, documentos ${ok.length}`);
  }
  if (scenario === 'idempotency') {
    const docs = await prisma.salesDocument.count({ where: { companyId: fixture.companyId, idempotencyKey: fixture.idempotencyKey } });
    check('Un solo documento por idempotencyKey', docs === 1, `${docs} documentos`);
    const ids = new Set(ok.map((r) => r.id));
    check('Todos los reintentos devuelven el mismo documento', ids.size <= 1, `${ids.size} ids distintos`);
    check('Ningún reintento falla', failed.length === 0, failed.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
  }
  if (scenario === 'payments') {
    const doc = await prisma.salesDocument.findFirstOrThrow({ where: { companyId: fixture.companyId, id: fixture.invoiceId } });
    const payments = await prisma.payment.aggregate({ where: { companyId: fixture.companyId, salesDocumentId: fixture.invoiceId }, _sum: { amount: true }, _count: true });
    check('Lo pagado nunca supera el total', doc.paidAmount <= doc.totalAmount, `pagado ${doc.paidAmount} / total ${doc.totalAmount}`);
    check('paidAmount = suma de pagos registrados', doc.paidAmount === (payments._sum.amount ?? 0), `paidAmount ${doc.paidAmount} vs pagos ${payments._sum.amount}`);
    check('Cobros aceptados = pagos registrados', ok.length === payments._count, `${ok.length} aceptados / ${payments._count} pagos`);
    const bad = unexpected(/supera|saldo|pagad|pendiente/i);
    check('Rechazos solo por saldo', bad.length === 0, bad.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
  }
  if (scenario === 'purchases-pmp') {
    const items = await prisma.purchaseDocumentItem.findMany({
      where: { productId: fixture.productPmp, document: { companyId: fixture.companyId, status: 'ISSUED' } },
      select: { quantity: true, unitCost: true },
    });
    const qty = items.reduce((sum, item) => sum + item.quantity, 0);
    const value = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const stock = await stockOf(fixture, fixture.productPmp);
    const product = await prisma.product.findFirstOrThrow({ where: { companyId: fixture.companyId, id: fixture.productPmp } });
    const expected = qty > 0 ? value / qty : 0;
    check('Stock = suma de entradas', stock === qty, `stock ${stock} / entradas ${qty}`);
    check('PMP = promedio ponderado (±1 peso)', Math.abs(product.costPricePMP - expected) <= 1, `PMP ${product.costPricePMP} / esperado ${expected.toFixed(2)}`);
    check('Sin errores', failed.length === 0, failed.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
  }
  if (scenario === 'distinct-products') {
    const bad = failed;
    check('Sin errores', bad.length === 0, bad.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
    const folios = await prisma.salesDocument.findMany({ where: { companyId: fixture.companyId, id: { in: ok.map((r) => r.id!).filter(Boolean) } }, select: { folio: true } });
    check('Folios únicos', new Set(folios.map((f) => f.folio)).size === folios.length, `${folios.length} documentos`);
  }
  if (scenario === 'pos') {
    const docs = await prisma.salesDocument.aggregate({ where: { companyId: fixture.companyId, cashShiftId: fixture.shiftId, status: 'ISSUED' }, _sum: { totalAmount: true }, _count: true });
    check('Una boleta por venta aceptada', docs._count === ok.length, `${docs._count} boletas / ${ok.length} ventas`);
    check('Sin errores', failed.length === 0, failed.slice(0, 3).map((r) => r.error).join(' | ') || 'ok');
  }
  return checks;
}

async function runScenario(scenario: string, fixture: StressFixture): Promise<ScenarioReport> {
  const before = {
    hot: await stockOf(fixture, fixture.productHot),
    a: await stockOf(fixture, fixture.productA),
    b: await stockOf(fixture, fixture.productB),
  };
  const started = performance.now();
  const results = (await Promise.all(Array.from({ length: WORKERS }, (_, index) => runWorker(scenario, index, fixture)))).flat();
  const wallMs = performance.now() - started;
  const times = results.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
  const errors: Record<string, number> = {};
  for (const r of results.filter((value) => !value.ok)) {
    const kind = errorKind(r.error);
    errors[kind] = (errors[kind] ?? 0) + 1;
  }
  return {
    scenario,
    attempts: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    wallMs: Math.round(wallMs),
    throughputPerSec: Math.round((results.length / wallMs) * 1000 * 10) / 10,
    p50: Math.round(percentile(times, 50)),
    p95: Math.round(percentile(times, 95)),
    p99: Math.round(percentile(times, 99)),
    max: Math.round(times[times.length - 1] ?? 0),
    errors,
    checks: await checksFor(scenario, fixture, results, before),
  };
}

async function main() {
  const fixture = await setupFixture();
  const scenarios = ['hot-product', 'lock-order', 'mixed-lock-order', 'purchase-lock-order', 'idempotency', 'payments', 'purchases-pmp', 'pos', 'distinct-products'].filter((s) => ONLY.length === 0 || ONLY.includes(s));
  console.log(`Estrés de concurrencia: ${WORKERS} procesos × ${OPS} operaciones (${CONCURRENCY} a la vez por proceso) = ${TOTAL} por escenario`);
  const reports: ScenarioReport[] = [];
  for (const scenario of scenarios) {
    const report = await runScenario(scenario, fixture);
    reports.push(report);
    console.log(`\n▸ ${scenario}: ${report.ok}/${report.attempts} ok en ${report.wallMs} ms (${report.throughputPerSec}/s) · p50 ${report.p50} ms · p95 ${report.p95} ms · máx ${report.max} ms`);
    for (const [kind, count] of Object.entries(report.errors)) console.log(`    error ×${count}: ${kind}`);
    for (const c of report.checks) console.log(`    ${c.pass ? '✔' : '✘'} ${c.name} — ${c.detail}`);
  }
  mkdirSync('.stress-out', { recursive: true });
  const file = `.stress-out/concurrency-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ workers: WORKERS, ops: OPS, concurrency: CONCURRENCY, reports }, null, 2));
  const failedChecks = reports.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `${r.scenario}: ${c.name}`));
  console.log(`\nInforme: ${file}`);
  console.log(failedChecks.length === 0 ? 'Todos los invariantes se cumplen.' : `INVARIANTES ROTOS:\n  ${failedChecks.join('\n  ')}`);
  await prisma.$disconnect();
  process.exit(failedChecks.length === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
