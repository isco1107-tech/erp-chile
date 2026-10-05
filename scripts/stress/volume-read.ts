/**
 * Prueba de VOLUMEN de lecturas: mide las pantallas y reportes más usados
 * sobre una empresa grande (`scripts/stress/volume-seed.sql`: 150.000 ventas,
 * 300.000 líneas, 50.000 clientes, 20.000 productos) y comprueba que la
 * agregación SQL del Inicio dé exactamente lo mismo que el cálculo anterior
 * en JS sobre todos los documentos.
 *
 * SOLO contra una base LOCAL. Para medir como en producción, pasar por el
 * proxy de latencia (`latency-proxy.mjs`, ~11 ms por consulta):
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5434/erp_stress \
 *     npx tsx --conditions=react-server scripts/stress/volume-read.ts
 */
import type { DteType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { addMonthsSantiago, santiagoDateParts } from '../../src/lib/chile/timezone';
import { getMonthlySalesSummary } from '../../src/modules/sales/services/sales-summary.service';
import { listSalesDocuments } from '../../src/modules/sales/services/sales.service';
import { listContactsPage } from '../../src/modules/contacts/services/contacts.service';
import { listProductsPage } from '../../src/modules/inventory/services/products.service';
import { getCxCSummary } from '../../src/modules/treasury/services/treasury.service';
import { getDashboard as getCustomerCareDashboard } from '../../src/modules/customer-care/services/customer-care.service';
import { getRadiography } from '../../src/modules/intelligence/services/radiography.service';
import { REPORT_MAX_ROWS, buildReportDataset, countReportRows } from '../../src/modules/reports/services/dataset.service';
import { assertLocalDatabase } from './shared';

assertLocalDatabase();

const SALES_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'];

async function timed<T>(label: string, run: () => Promise<T>, describe: (value: T) => string): Promise<T | null> {
  const started = performance.now();
  try {
    const value = await run();
    const ms = Math.round(performance.now() - started);
    const heap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`${ms.toString().padStart(7)} ms  ${label.padEnd(46)} ${describe(value)} · heap ${heap} MB`);
    return value;
  } catch (error) {
    console.log(`  ERROR  ${label.padEnd(46)} ${(error as Error).message.slice(0, 160)}`);
    return null;
  }
}

function monthKey(date: Date): string {
  const { year, month } = santiagoDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { rut: '99.999.999-9' } });
  const companyId = company.id;
  const counts = await Promise.all([
    prisma.salesDocument.count({ where: { companyId } }),
    prisma.salesDocumentItem.count({ where: { companyId } }),
    prisma.contact.count({ where: { companyId } }),
    prisma.product.count({ where: { companyId } }),
  ]);
  console.log(`Empresa con ${counts[0]} ventas, ${counts[1]} líneas, ${counts[2]} contactos, ${counts[3]} productos\n`);

  const now = new Date();
  const from = addMonthsSantiago(now, -11);
  const to = addMonthsSantiago(now, 1);

  // Inicio: cálculo anterior (todos los documentos con sus líneas, sumado en JS)…
  const legacy = await timed(
    'Inicio · ANTES: 12 meses de documentos + líneas',
    () =>
      prisma.salesDocument.findMany({
        where: { companyId, status: 'ISSUED', dteType: { in: SALES_TYPES }, issueDate: { gte: from, lt: to } },
        select: { dteType: true, issueDate: true, netAmount: true, exemptAmount: true, ivaAmount: true, items: { select: { quantity: true, unitCostPMP: true } } },
      }),
    (rows) => `${rows.length} documentos`
  );
  // …y el nuevo, agregado en la base.
  const summary = await timed('Inicio · AHORA: agregado por mes en SQL', () => getMonthlySalesSummary(companyId, SALES_TYPES, from, to), (rows) => `${rows.length} filas`);

  if (legacy && summary) {
    const expected = new Map<string, { net: number; iva: number; cost: number; docs: number }>();
    for (const doc of legacy) {
      const key = `${monthKey(doc.issueDate)}|${doc.dteType}`;
      const acc = expected.get(key) ?? { net: 0, iva: 0, cost: 0, docs: 0 };
      acc.net += doc.netAmount + doc.exemptAmount;
      acc.iva += doc.ivaAmount;
      acc.cost += doc.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
      acc.docs += 1;
      expected.set(key, acc);
    }
    const mismatches = summary.filter((row) => {
      const acc = expected.get(`${row.month}|${row.dteType}`);
      return !acc || acc.net !== row.netAmount + row.exemptAmount || acc.iva !== row.ivaAmount || acc.cost !== row.costOfSales || acc.docs !== row.documents;
    });
    const sameKeys = expected.size === summary.length;
    console.log(`         ${mismatches.length === 0 && sameKeys ? '✔' : '✘'} agregación SQL = cálculo anterior (${summary.length} grupos, ${mismatches.length} diferencias)\n`);
  }

  await timed('Ventas · listado página 1', () => listSalesDocuments(companyId), (r) => `${r.items.length} filas de ${r.total}`);
  await timed('Contactos · listado página 1', () => listContactsPage(companyId, { page: 1 }), (r) => `${r.total} total`);
  await timed('Contactos · búsqueda "volumen 4999"', () => listContactsPage(companyId, { query: 'volumen 4999', page: 1 }), (r) => `${r.total} total`);
  await timed('Productos · listado página 1', () => listProductsPage(companyId, { page: 1 }), (r) => `${r.total} total`);
  await timed('Tesorería · resumen CxC', () => getCxCSummary(companyId), () => 'ok');
  await timed('Fidelización · panel (clientes inactivos)', () => getCustomerCareDashboard(companyId, now), () => 'ok');
  await timed('Inteligencia · Radiografía 360', () => getRadiography(companyId, { hasPayroll: false }), () => 'ok');
  await timed('Reportes · dataset Excel 1 mes', () => buildReportDataset(companyId, { from: addMonthsSantiago(now, -1), to: now }), () => 'ok');
  const yearRows = await timed('Reportes · conteo previo 12 meses', () => countReportRows(companyId, { from, to: now }), (n) => `${n} filas (tope ${REPORT_MAX_ROWS})`);
  if (yearRows !== null && yearRows > REPORT_MAX_ROWS) console.log('         ✔ 12 meses supera el tope: la ruta pide un rango más corto en vez de agotar la memoria');
  else await timed('Reportes · dataset Excel 12 meses', () => buildReportDataset(companyId, { from, to: now }), () => 'ok');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
