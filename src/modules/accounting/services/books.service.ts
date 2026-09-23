import { prisma } from '@/lib/prisma';
import type { Account, JournalEntryStatus, JournalSourceType } from '@prisma/client';

/**
 * Consultas de solo lectura para los libros contables (Libro Diario y
 * selector de cuentas del Libro Mayor). Todo filtrado por `companyId`.
 */

export interface JournalBookLine {
  id: string;
  lineNumber: number;
  accountCode: string;
  accountName: string;
  description: string | null;
  debit: number;
  credit: number;
}

export interface JournalBookEntry {
  id: string;
  entryNumber: number;
  year: number;
  date: Date;
  description: string;
  status: JournalEntryStatus;
  sourceType: JournalSourceType;
  sourceId: string | null;
  totalDebit: number;
  totalCredit: number;
  lines: JournalBookLine[];
}

export interface JournalBookPage {
  entries: JournalBookEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Sumas del PERÍODO completo, no solo de la página: el pie del libro. */
  periodDebit: number;
  periodCredit: number;
}

/**
 * Libro Diario: asientos contabilizados (POSTED y REVERSED, igual que el
 * mayor) entre `from` (incluido) y `to` (excluido), en orden cronológico.
 * Los borradores quedan fuera: todavía no son hechos contables.
 */
export async function listJournalEntries(
  companyId: string,
  from: Date,
  to: Date,
  { page = 1, pageSize = 25 }: { page?: number; pageSize?: number } = {}
): Promise<JournalBookPage> {
  const where = {
    companyId,
    status: { in: ['POSTED', 'REVERSED'] as JournalEntryStatus[] },
    date: { gte: from, lt: to },
  };

  const [entries, total, sums] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { entryNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
          include: { account: { select: { code: true, name: true } } },
        },
      },
    }),
    prisma.journalEntry.count({ where }),
    prisma.journalLine.aggregate({
      where: { companyId, entry: where },
      _sum: { debit: true, credit: true },
    }),
  ]);

  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      entryNumber: entry.entryNumber,
      year: entry.year,
      date: entry.date,
      description: entry.description,
      status: entry.status,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      totalDebit: entry.lines.reduce((sum, line) => sum + line.debit, 0),
      totalCredit: entry.lines.reduce((sum, line) => sum + line.credit, 0),
      lines: entry.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        accountCode: line.account.code,
        accountName: line.account.name,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
      })),
    })),
    total,
    page,
    pageSize,
    periodDebit: sums._sum.debit ?? 0,
    periodCredit: sums._sum.credit ?? 0,
  };
}

export type LedgerAccountOption = Pick<Account, 'id' | 'code' | 'name' | 'type'>;

/** Cuentas que pueden recibir movimientos (hojas del plan), para el selector del mayor. */
export async function listPostableAccounts(companyId: string): Promise<LedgerAccountOption[]> {
  return prisma.account.findMany({
    where: { companyId, isPostable: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  });
}

export interface EightColumnRow {
  accountId: string;
  code: string;
  name: string;
  type: Account['type'];
  sumDebit: number;
  sumCredit: number;
  balanceDebit: number;
  balanceCredit: number;
  /** Columnas de Inventario (cuentas de balance). */
  assets: number;
  liabilities: number;
  /** Columnas de Resultados (ingresos, costos y gastos). */
  losses: number;
  gains: number;
}

export interface EightColumnBalance {
  rows: EightColumnRow[];
  totals: Omit<EightColumnRow, 'accountId' | 'code' | 'name' | 'type'>;
  /** Ganancias − pérdidas. Positivo = utilidad; negativo = pérdida. */
  result: number;
}

const BALANCE_SHEET_TYPES: Account['type'][] = ['ASSET', 'LIABILITY', 'EQUITY'];

/** Una fila del balance de 8 columnas a partir de las sumas brutas de la cuenta. Exportada para tests puros. */
export function toEightColumnRow(
  account: Pick<Account, 'id' | 'code' | 'name' | 'type'>,
  sumDebit: number,
  sumCredit: number
): EightColumnRow {
  const net = sumDebit - sumCredit;
  const balanceDebit = net > 0 ? net : 0;
  const balanceCredit = net < 0 ? -net : 0;
  const isBalanceSheet = BALANCE_SHEET_TYPES.includes(account.type);
  return {
    accountId: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    sumDebit,
    sumCredit,
    balanceDebit,
    balanceCredit,
    assets: isBalanceSheet ? balanceDebit : 0,
    liabilities: isBalanceSheet ? balanceCredit : 0,
    losses: isBalanceSheet ? 0 : balanceDebit,
    gains: isBalanceSheet ? 0 : balanceCredit,
  };
}

/**
 * Balance de 8 columnas (tributario) acumulado hasta `to` (excluido): Sumas
 * (debe/haber brutos), Saldos (deudor/acreedor), Inventario (activo/pasivo) y
 * Resultados (pérdidas/ganancias). Cuentas sin movimiento quedan fuera.
 */
export async function getEightColumnBalance(companyId: string, to: Date): Promise<EightColumnBalance> {
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({
      where: { companyId, isPostable: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { companyId, entry: { status: { in: ['POSTED', 'REVERSED'] }, date: { lt: to } } },
      _sum: { debit: true, credit: true },
    }),
  ]);

  const byAccount = new Map(sums.map((row) => [row.accountId, row._sum]));
  const rows = accounts
    .map((account) => {
      const sum = byAccount.get(account.id);
      return toEightColumnRow(account, sum?.debit ?? 0, sum?.credit ?? 0);
    })
    .filter((row) => row.sumDebit !== 0 || row.sumCredit !== 0);

  const totals = rows.reduce(
    (acc, row) => ({
      sumDebit: acc.sumDebit + row.sumDebit,
      sumCredit: acc.sumCredit + row.sumCredit,
      balanceDebit: acc.balanceDebit + row.balanceDebit,
      balanceCredit: acc.balanceCredit + row.balanceCredit,
      assets: acc.assets + row.assets,
      liabilities: acc.liabilities + row.liabilities,
      losses: acc.losses + row.losses,
      gains: acc.gains + row.gains,
    }),
    { sumDebit: 0, sumCredit: 0, balanceDebit: 0, balanceCredit: 0, assets: 0, liabilities: 0, losses: 0, gains: 0 }
  );

  return { rows, totals, result: totals.gains - totals.losses };
}
