import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { assertScriptCanRun } from './lib/guard-production';
import { LOCKING_TX_OPTIONS } from '../src/lib/prisma-tx';
import { postCreditNoteIssued, postSalesDocumentIssued } from '../src/modules/accounting/posting-rules/sales-posting';
import { postPurchaseCreditNoteIssued, postPurchaseDocumentIssued } from '../src/modules/accounting/posting-rules/purchases-posting';
import { postPurchasePaymentEntry, postSalesPaymentEntry } from '../src/modules/accounting/posting-rules/treasury-posting';
import { JournalError } from '../src/modules/accounting/services/journal.service';
import { isLedgerActive } from '../src/modules/accounting/posting-rules/shared';

/**
 * Fase C.4 de PROMPT_ERP_V2.md — genera asientos retroactivos para documentos
 * `ISSUED` que se crearon antes de que el motor contable estuviera cableado
 * (Fase C). Recorre en orden cronológico y aplica las mismas reglas de
 * `posting-rules/` que ya usan `sales.service.ts`/`purchases.service.ts`.
 *
 * Modo simulación por defecto: NO escribe nada, solo informa. Ejecutar en
 * firme requiere `--commit` explícito Y que el informe de simulación se haya
 * revisado — nunca se corre en firme como parte de esta fase sin aprobación
 * humana adicional, dado que escribe contra la base compartida dev=prod.
 *
 * Uso:
 *   npx tsx scripts/backfill-accounting.ts --company <companyId>              (simulación)
 *   npx tsx scripts/backfill-accounting.ts --company <companyId> --commit     (en firme)
 */

interface SkippedRow {
  kind: string;
  id: string;
  reason: string;
}

interface SimulationReport {
  companyId: string;
  salesEntriesWouldCreate: number;
  purchaseEntriesWouldCreate: number;
  paymentEntriesWouldCreate: number;
  skipped: SkippedRow[];
}

function parseArgs(): { companyId: string; commit: boolean } {
  const args = process.argv.slice(2);
  const companyIndex = args.indexOf('--company');
  const companyId = companyIndex >= 0 ? args[companyIndex + 1] : undefined;
  if (!companyId) {
    console.error('Uso: npx tsx scripts/backfill-accounting.ts --company <companyId> [--commit]');
    process.exit(1);
  }
  return { companyId, commit: args.includes('--commit') };
}

/**
 * Corre el backfill dentro de una única transacción (todo o nada) y devuelve
 * el informe. Si `dryRun` es true, la transacción se revierte al final
 * (`ROLLBACK` explícito vía excepción controlada) — así el modo simulación
 * usa exactamente el mismo camino de código que el modo en firme, sin
 * duplicar la lógica en una rama "solo contar" separada que podría divergir.
 */
async function runBackfill(companyId: string, dryRun: boolean): Promise<SimulationReport> {
  const report: SimulationReport = {
    companyId,
    salesEntriesWouldCreate: 0,
    purchaseEntriesWouldCreate: 0,
    paymentEntriesWouldCreate: 0,
    skipped: [],
  };

  class DryRunAbort extends Error {}

  try {
    await prisma.$transaction(async (tx) => {
      // Las reglas de asiento no postean sin Contabilidad activa y plan de
      // cuentas (`isLedgerActive`): el informe diría "se crearían N" y no se
      // crearía ninguno. Mejor abortar con la causa.
      if (!(await isLedgerActive(tx, companyId))) {
        throw new Error('La empresa no tiene Contabilidad activa con plan de cuentas. Actívala en superadmin (siembra el plan) antes del backfill.');
      }
      const existingEntryCount = await tx.journalEntry.count({ where: { companyId } });
      if (existingEntryCount > 0) {
        throw new Error(
          `La empresa ya tiene ${existingEntryCount} asientos contables. El backfill es para el hueco histórico previo a Fase C — ` +
            `correrlo con asientos ya existentes duplicaría lo que las reglas normales ya postearon. Abortando sin escribir nada.`
        );
      }

      const salesDocs = await tx.salesDocument.findMany({
        where: { companyId, status: 'ISSUED' },
        include: { items: true },
        orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
      });

      for (const doc of salesDocs) {
        try {
          if (doc.dteType === 'NOTA_CREDITO_61') {
            const restocked = doc.items.map((item) => ({ unitCostPMP: item.unitCostPMP, quantity: item.quantity }));
            await postCreditNoteIssued(tx, companyId, doc, restocked, {});
          } else {
            const isImmediatePayment = doc.paymentMethod !== 'CREDITO_30';
            const affectsStock = doc.items.some((item) => item.productId);
            const costedItems = affectsStock ? doc.items.map((item) => ({ unitCostPMP: item.unitCostPMP, quantity: item.quantity })) : [];
            await postSalesDocumentIssued(tx, companyId, doc, costedItems, { isImmediatePayment, affectsStock });
          }
          report.salesEntriesWouldCreate += 1;
        } catch (error) {
          report.skipped.push({
            kind: 'SalesDocument',
            id: doc.id,
            reason: error instanceof JournalError || error instanceof Error ? error.message : String(error),
          });
        }
      }

      const purchaseDocs = await tx.purchaseDocument.findMany({
        where: { companyId, status: 'ISSUED' },
        include: { items: true },
        orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
      });

      for (const doc of purchaseDocs) {
        try {
          if (doc.documentType === 'NOTA_CREDITO') {
            const referenced = doc.referenceFolio
              ? await tx.purchaseDocument.findFirst({
                  where: { companyId, contactId: doc.contactId, folio: doc.referenceFolio },
                  include: { items: true },
                })
              : null;
            await postPurchaseCreditNoteIssued(tx, companyId, doc, referenced?.items ?? doc.items);
          } else {
            await postPurchaseDocumentIssued(tx, companyId, doc, doc.items);
          }
          report.purchaseEntriesWouldCreate += 1;
        } catch (error) {
          report.skipped.push({
            kind: 'PurchaseDocument',
            id: doc.id,
            reason: error instanceof JournalError || error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Pagos manuales de Tesorería sobre documentos a crédito (los de
      // contado ya quedaron cubiertos por el asiento de venta/compra de
      // arriba, que carga/abona CAJA-BANCO directamente).
      const payments = await tx.payment.findMany({
        where: { companyId, OR: [{ salesDocumentId: { not: null } }, { purchaseDocumentId: { not: null } }] },
        orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
      });

      for (const payment of payments) {
        try {
          if (payment.salesDocumentId) {
            const doc = await tx.salesDocument.findUnique({ where: { id: payment.salesDocumentId }, select: { paymentMethod: true } });
            if (doc?.paymentMethod === 'CREDITO_30') {
              await postSalesPaymentEntry(tx, companyId, payment);
              report.paymentEntriesWouldCreate += 1;
            }
          } else if (payment.purchaseDocumentId) {
            await postPurchasePaymentEntry(tx, companyId, payment);
            report.paymentEntriesWouldCreate += 1;
          }
        } catch (error) {
          report.skipped.push({
            kind: 'Payment',
            id: payment.id,
            reason: error instanceof JournalError || error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (dryRun) throw new DryRunAbort('rollback deliberado: modo simulación');
    }, LOCKING_TX_OPTIONS);
  } catch (error) {
    if (!(error instanceof DryRunAbort)) throw error;
  }

  return report;
}

function printReport(report: SimulationReport, dryRun: boolean): void {
  console.log(`\n=== Backfill contable — ${dryRun ? 'SIMULACIÓN (sin escribir nada)' : 'EJECUTADO EN FIRME'} ===`);
  console.log(`Empresa: ${report.companyId}`);
  console.log(`Asientos de venta que ${dryRun ? 'se crearían' : 'se crearon'}: ${report.salesEntriesWouldCreate}`);
  console.log(`Asientos de compra que ${dryRun ? 'se crearían' : 'se crearon'}: ${report.purchaseEntriesWouldCreate}`);
  console.log(`Asientos de pago que ${dryRun ? 'se crearían' : 'se crearon'}: ${report.paymentEntriesWouldCreate}`);
  if (report.skipped.length > 0) {
    console.log(`\nDocumentos que NO se pudieron mapear (${report.skipped.length}) — requieren asiento de apertura manual:`);
    for (const row of report.skipped) {
      console.log(`  [${row.kind} ${row.id}] ${row.reason}`);
    }
  } else {
    console.log('\nSin documentos sin mapear.');
  }
}

async function main() {
  assertScriptCanRun('scripts/backfill-accounting.ts');
  const { companyId, commit } = parseArgs();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error(`Empresa ${companyId} no encontrada`);
    process.exit(1);
  }

  const report = await runBackfill(companyId, !commit);
  printReport(report, !commit);

  if (!commit) {
    console.log('\nEsto fue una simulación: no se escribió ningún asiento. Revisa el informe y contrasta los saldos');
    console.log('resultantes contra F29/CxC/stock conocidos antes de correr con --commit.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\nERROR FATAL:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
