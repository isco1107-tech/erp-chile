import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { seedChartOfAccounts } from '../src/modules/accounting/chart-of-accounts';
import { createAndPostEntry, reverseEntry, resolveMappedAccountId, JournalError } from '../src/modules/accounting/services/journal.service';
import { getAccountBalance, getTrialBalance } from '../src/modules/accounting/services/ledger.service';
import { BATCH_TX_OPTIONS } from '../src/lib/prisma-tx';

/**
 * Fase B.6 de PROMPT_ERP_V2.md — lo que `tests/accounting-core.test.ts` no
 * puede cubrir porque necesita una base real: reverso con contrapartida
 * exacta, período cerrado rechazando escrituras, y que el balance de
 * comprobación efectivamente cuadre sobre datos reales.
 */

const RUN_TAG = `ENGINE_VERIFY_${Date.now()}`;
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
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER "trg_journal_line_immutable"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER "trg_journal_entry_immutable"`);
  try {
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER "trg_journal_line_immutable"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER "trg_journal_entry_immutable"`);
  }
  await prisma.accountMapping.deleteMany({ where: { companyId } });
  await prisma.account.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.journalEntrySequence.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

async function main() {
  console.log(`=== Verificación del motor de asientos (${RUN_TAG}) ===\n`);

  const company = await prisma.company.create({
    data: { rut: `${Date.now()}-K`.slice(0, 12), businessName: `${RUN_TAG} Empresa` },
  });

  try {
    console.log('1. Siembra del plan de cuentas');
    await prisma.$transaction(async (tx) => {
      await seedChartOfAccounts(tx, company.id, 'COMMERCE');
    }, BATCH_TX_OPTIONS);
    const accountCount = await prisma.account.count({ where: { companyId: company.id } });
    check('Plan de cuentas sembrado (46 cuentas)', accountCount === 46, `obtuvo ${accountCount}`);

    const cajaId = await prisma.$transaction((tx) => resolveMappedAccountId(tx, company.id, 'CAJA'));
    const ventasId = await prisma.$transaction((tx) => resolveMappedAccountId(tx, company.id, 'VENTAS_AFECTAS'));

    console.log('\n2. Crear y contabilizar un asiento');
    const entry = await prisma.$transaction((tx) =>
      createAndPostEntry(tx, {
        companyId: company.id,
        date: new Date('2026-03-10'),
        description: 'Venta de prueba',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cajaId, debit: 119000, credit: 0 },
          { accountId: ventasId, debit: 0, credit: 119000 },
        ],
      })
    );
    check('Asiento queda POSTED', entry.status === 'POSTED', entry.status);
    check('Numeración arranca en 1', entry.entryNumber === 1, String(entry.entryNumber));

    console.log('\n3. Saldos por cuenta');
    const cajaBalance = await getAccountBalance(company.id, cajaId);
    const ventasBalance = await getAccountBalance(company.id, ventasId);
    check('Saldo de Caja = 119.000 (deudor)', cajaBalance.net === 119000, String(cajaBalance.net));
    check('Saldo de Ventas = -119.000 (acreedor)', ventasBalance.net === -119000, String(ventasBalance.net));

    console.log('\n4. Balance de comprobación cuadra');
    const trialBalance = await getTrialBalance(company.id, 2026, 3);
    const totalClosingDebit = trialBalance.reduce((sum, row) => sum + row.closingDebit, 0);
    const totalClosingCredit = trialBalance.reduce((sum, row) => sum + row.closingCredit, 0);
    check(
      `Suma columna debe ($${totalClosingDebit}) = suma columna haber ($${totalClosingCredit})`,
      totalClosingDebit === totalClosingCredit
    );

    console.log('\n5. Reverso genera contrapartida exacta');
    const reversal = await prisma.$transaction((tx) => reverseEntry(tx, entry.id, 'Prueba de reverso'));
    check('El reverso queda POSTED', reversal.status === 'POSTED', reversal.status);
    check('El reverso enlaza al original', reversal.reversalOfId === entry.id);
    const reversalLines = reversal.lines.sort((a, b) => a.lineNumber - b.lineNumber);
    check(
      'La línea de Caja del reverso tiene debe/haber invertidos (0/119.000)',
      reversalLines[0]?.accountId === cajaId && reversalLines[0]?.debit === 0 && reversalLines[0]?.credit === 119000
    );
    check(
      'La línea de Ventas del reverso tiene debe/haber invertidos (119.000/0)',
      reversalLines[1]?.accountId === ventasId && reversalLines[1]?.debit === 119000 && reversalLines[1]?.credit === 0
    );

    const originalAfterReversal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    check('El asiento original queda REVERSED', originalAfterReversal.status === 'REVERSED');

    const cajaBalanceAfterReversal = await getAccountBalance(company.id, cajaId);
    check('El saldo de Caja vuelve a 0 tras el reverso', cajaBalanceAfterReversal.net === 0, String(cajaBalanceAfterReversal.net));

    console.log('\n6. Un período cerrado rechaza escrituras nuevas');
    await prisma.accountingPeriod.update({
      where: { companyId_year_month: { companyId: company.id, year: 2026, month: 4 } },
      data: { status: 'CLOSED' },
    }).catch(async () => {
      // El período de abril todavía no existía (nadie contabilizó ahí antes): se crea ya cerrado.
      await prisma.accountingPeriod.create({ data: { companyId: company.id, year: 2026, month: 4, status: 'CLOSED' } });
    });

    let rejectedClosedPeriod = false;
    try {
      await prisma.$transaction((tx) =>
        createAndPostEntry(tx, {
          companyId: company.id,
          date: new Date('2026-04-05'),
          description: 'No debería poder crearse',
          sourceType: 'MANUAL',
          lines: [
            { accountId: cajaId, debit: 1000, credit: 0 },
            { accountId: ventasId, debit: 0, credit: 1000 },
          ],
        })
      );
    } catch (error) {
      rejectedClosedPeriod = error instanceof JournalError;
    }
    check('Escritura contra un período CLOSED es rechazada por la aplicación', rejectedClosedPeriod);
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
