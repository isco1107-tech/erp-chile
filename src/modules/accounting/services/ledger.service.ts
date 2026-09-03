import { prisma } from '@/lib/prisma';
import type { Account, JournalLine } from '@prisma/client';

/**
 * Consultas de saldo sobre el libro mayor.
 *
 * Ningún saldo es un campo que se actualiza: todo se agrega en vivo desde
 * `JournalLine`. Un asiento REVERSED sigue contando (su reverso ya anuló el
 * efecto con líneas propias); solo DRAFT queda fuera, porque un asiento en
 * borrador todavía no es un hecho contable consumado.
 */

const POSTED_STATUSES = ['POSTED', 'REVERSED'] as const;

export interface AccountBalance {
  accountId: string;
  debit: number;
  credit: number;
  /** SUM(debit) − SUM(credit). Positivo = saldo deudor, negativo = saldo acreedor. */
  net: number;
}

export async function getAccountBalance(
  companyId: string,
  accountId: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<AccountBalance> {
  const result = await prisma.journalLine.aggregate({
    where: {
      companyId,
      accountId,
      entry: {
        status: { in: [...POSTED_STATUSES] },
        ...(dateFrom || dateTo ? { date: { gte: dateFrom, lte: dateTo } } : {}),
      },
    },
    _sum: { debit: true, credit: true },
  });

  const debit = result._sum.debit ?? 0;
  const credit = result._sum.credit ?? 0;
  return { accountId, debit, credit, net: debit - credit };
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: Account['type'];
  isPostable: boolean;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

/** Convierte un neto (debit − credit) en su par de columnas debe/haber para presentación. Exportada para tests puros. */
export function netToColumns(net: number): { debit: number; credit: number } {
  return net >= 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
}

/**
 * Balance de comprobación de 8 columnas: saldo inicial, movimientos del
 * período y saldo final, cada uno en su columna debe/haber, por cuenta.
 * Incluye únicamente cuentas hoja (isPostable) — las agrupadoras se suman en
 * la capa de presentación a partir de sus hijas, no aquí.
 */
export async function getTrialBalance(companyId: string, year: number, month: number): Promise<TrialBalanceRow[]> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const accounts = await prisma.account.findMany({
    where: { companyId, isPostable: true },
    orderBy: { code: 'asc' },
  });
  if (accounts.length === 0) return [];

  const accountIds = accounts.map((account) => account.id);

  const [openingLines, periodLines] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { companyId, accountId: { in: accountIds }, entry: { status: { in: [...POSTED_STATUSES] }, date: { lt: periodStart } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        accountId: { in: accountIds },
        entry: { status: { in: [...POSTED_STATUSES] }, date: { gte: periodStart, lt: periodEnd } },
      },
      _sum: { debit: true, credit: true },
    }),
  ]);

  const openingByAccount = new Map(openingLines.map((row) => [row.accountId, row._sum]));
  const periodByAccount = new Map(periodLines.map((row) => [row.accountId, row._sum]));

  return accounts.map((account) => {
    const opening = openingByAccount.get(account.id);
    const period = periodByAccount.get(account.id);

    const openingNet = (opening?.debit ?? 0) - (opening?.credit ?? 0);
    const periodDebit = period?.debit ?? 0;
    const periodCredit = period?.credit ?? 0;
    const closingNet = openingNet + periodDebit - periodCredit;

    const openingCols = netToColumns(openingNet);
    const closingCols = netToColumns(closingNet);

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      isPostable: account.isPostable,
      openingDebit: openingCols.debit,
      openingCredit: openingCols.credit,
      periodDebit,
      periodCredit,
      closingDebit: closingCols.debit,
      closingCredit: closingCols.credit,
    };
  });
}

export type LedgerLine = JournalLine & {
  entry: { entryNumber: number; year: number; date: Date; description: string; status: string; sourceType: string; sourceId: string | null };
};

export interface LedgerResult {
  accountId: string;
  openingBalance: number;
  lines: (LedgerLine & { runningBalance: number })[];
  closingBalance: number;
}

/** Mayor de una cuenta: cada movimiento con saldo corrido, partiendo del saldo antes de `dateFrom`. */
export async function getLedger(companyId: string, accountId: string, dateFrom: Date, dateTo: Date): Promise<LedgerResult> {
  const opening = await getAccountBalance(companyId, accountId, undefined, new Date(dateFrom.getTime() - 1));

  const lines = await prisma.journalLine.findMany({
    where: {
      companyId,
      accountId,
      entry: { status: { in: [...POSTED_STATUSES] }, date: { gte: dateFrom, lte: dateTo } },
    },
    include: {
      entry: { select: { entryNumber: true, year: true, date: true, description: true, status: true, sourceType: true, sourceId: true } },
    },
    orderBy: [{ entry: { date: 'asc' } }, { entry: { entryNumber: 'asc' } }, { lineNumber: 'asc' }],
  });

  let running = opening.net;
  const withRunning = lines.map((line) => {
    running += line.debit - line.credit;
    return { ...line, runningBalance: running };
  });

  return { accountId, openingBalance: opening.net, lines: withRunning, closingBalance: running };
}
