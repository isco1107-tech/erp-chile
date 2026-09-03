import { prisma } from '@/lib/prisma';
import { calculateAndStoreF29 } from '@/lib/chile/f29';
import { getAccountBalance } from './ledger.service';

/**
 * Cuadraturas automáticas (`PROMPT_ERP_V2.md`, Fase C.3): compara el saldo
 * contable de cada cuenta mapeada contra la fuente operativa independiente
 * que debería coincidir con ella. Las dos de IVA son las más valiosas — vienen
 * de dos cálculos completamente independientes (el libro mayor y `f29.ts`) —
 * si difieren, hay un error real en alguno de los dos.
 *
 * Sin UI de panel en esta fase: se corre por script/test. El dashboard es
 * Fase D.
 */

export interface ReconciliationCheck {
  key: 'EXISTENCIAS' | 'CLIENTES' | 'PROVEEDORES' | 'IVA_DEBITO' | 'IVA_CREDITO' | 'CAJA';
  label: string;
  /** Saldo esperado según la fuente operativa (kardex, CxC/CxP, F29, turnos cerrados). */
  expected: number;
  /** Saldo real según el libro mayor (`JournalLine` agregado). */
  actual: number;
  difference: number;
  inBalance: boolean;
}

async function resolveAccountId(companyId: string, key: string): Promise<string | null> {
  const mapping = await prisma.accountMapping.findUnique({ where: { companyId_key: { companyId, key } } });
  return mapping?.accountId ?? null;
}

/** `null` cuando la cuenta no está mapeada — la empresa no tiene el módulo contable configurado para ese rubro. */
/**
 * `getAccountBalance` siempre reporta `debit − credit`. Para una cuenta de
 * naturaleza acreedora (`PROVEEDORES`, `IVA_DEBITO`) ese neto normalmente sale
 * negativo, mientras que el "esperado" de la fuente operativa (deuda
 * pendiente, débito fiscal) se expresa en positivo — `flipSign` alinea ambos
 * antes de comparar.
 */
async function checkAccount(
  key: ReconciliationCheck['key'],
  label: string,
  companyId: string,
  expected: number,
  opts: { flipSign?: boolean; dateFrom?: Date; dateTo?: Date } = {}
): Promise<ReconciliationCheck | null> {
  const accountId = await resolveAccountId(companyId, key);
  if (!accountId) return null;

  const balance = await getAccountBalance(companyId, accountId, opts.dateFrom, opts.dateTo);
  const actual = opts.flipSign ? -balance.net : balance.net;
  const difference = Math.round((expected - actual) * 100) / 100;
  return { key, label, expected, actual, difference, inBalance: Math.abs(difference) < 1 };
}

async function existenciasExpected(companyId: string): Promise<number> {
  const stocks = await prisma.stock.findMany({ where: { companyId }, include: { product: { select: { costPricePMP: true } } } });
  return Math.round(stocks.reduce((sum, stock) => sum + stock.quantity * stock.product.costPricePMP, 0));
}

async function clientesExpected(companyId: string): Promise<number> {
  const agg = await prisma.salesDocument.aggregate({
    where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { not: 'GUIA_DESPACHO_52' } },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return (agg._sum.totalAmount ?? 0) - (agg._sum.paidAmount ?? 0);
}

async function proveedoresExpected(companyId: string): Promise<number> {
  const agg = await prisma.purchaseDocument.aggregate({
    where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return (agg._sum.totalAmount ?? 0) - (agg._sum.paidAmount ?? 0);
}

async function cajaExpected(companyId: string): Promise<number> {
  const agg = await prisma.cashShift.aggregate({
    where: { companyId, status: 'CLOSED' },
    _sum: { actualAmount: true },
  });
  return agg._sum.actualAmount ?? 0;
}

export interface RunReconciliationOptions {
  /** Año/mes para las cuadraturas de IVA (comparan contra `f29.ts`, que es mensual). Por defecto, el mes en curso. */
  year?: number;
  month?: number;
}

export async function runReconciliation(companyId: string, options: RunReconciliationOptions = {}): Promise<ReconciliationCheck[]> {
  const now = new Date();
  const year = options.year ?? now.getUTCFullYear();
  const month = options.month ?? now.getUTCMonth() + 1;
  const periodFrom = new Date(Date.UTC(year, month - 1, 1));
  const periodTo = new Date(Date.UTC(year, month, 1, 0, 0, 0, -1));

  const f29 = await calculateAndStoreF29(companyId, year, month);

  const checks = await Promise.all([
    checkAccount('EXISTENCIAS', 'Existencias', companyId, await existenciasExpected(companyId)),
    checkAccount('CLIENTES', 'Clientes', companyId, await clientesExpected(companyId)),
    checkAccount('PROVEEDORES', 'Proveedores', companyId, await proveedoresExpected(companyId), { flipSign: true }),
    checkAccount('IVA_DEBITO', 'IVA Débito Fiscal', companyId, f29.debitVat, { flipSign: true, dateFrom: periodFrom, dateTo: periodTo }),
    checkAccount('IVA_CREDITO', 'IVA Crédito Fiscal', companyId, f29.creditVat, { dateFrom: periodFrom, dateTo: periodTo }),
    checkAccount('CAJA', 'Caja', companyId, await cajaExpected(companyId)),
  ]);

  return checks.filter((check): check is ReconciliationCheck => check !== null);
}
