import { prisma } from '@/lib/prisma';
import { calculateAndStoreF29 } from '@/lib/chile/f29';
import type { F29Result } from '@/lib/chile/f29';
import { getAccountBalance } from './ledger.service';
import { computeExpectedAmount } from '@/modules/pos/calc';
import { CASH_PAYMENT_METHODS } from '@/modules/pos/schema';

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

/**
 * Efectivo esperado de una caja: el último arqueo contado (o cero si la caja
 * nunca se ha cerrado) más lo que entró y salió después de ese arqueo.
 *
 * Sumar `actualAmount` de TODOS los turnos CLOSED (como antes) cuenta el mismo
 * fondo fijo una y otra vez cada vez que la caja se cierra y se vuelve a abrir
 * — dos cierres sucesivos con los mismos 100 de fondo sumaban 200 sin que
 * hubiera entrado plata adicional. El último arqueo ya es la foto acumulada
 * hasta ese momento; solo hace falta sumarle la actividad posterior.
 */
async function cajaExpectedForRegister(companyId: string, cashRegisterId: string): Promise<number> {
  const lastClosed = await prisma.cashShift.findFirst({
    where: { companyId, cashRegisterId, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  });
  const base = lastClosed?.actualAmount ?? 0;
  // Sin arqueo previo, se cuenta toda la actividad histórica de la caja.
  const cutoff = lastClosed?.closedAt ?? new Date(0);

  const [cashSales, inflows, outflows] = await Promise.all([
    prisma.salesDocument.aggregate({
      where: {
        companyId,
        status: 'ISSUED',
        paymentMethod: { in: CASH_PAYMENT_METHODS },
        issueDate: { gt: cutoff },
        cashShift: { cashRegisterId },
      },
      _sum: { totalAmount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { companyId, type: 'INFLOW', createdAt: { gt: cutoff }, cashShift: { cashRegisterId } },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { companyId, type: 'OUTFLOW', createdAt: { gt: cutoff }, cashShift: { cashRegisterId } },
      _sum: { amount: true },
    }),
  ]);

  return computeExpectedAmount({
    initialAmount: base,
    cashSales: cashSales._sum.totalAmount ?? 0,
    inflows: inflows._sum.amount ?? 0,
    outflows: outflows._sum.amount ?? 0,
  });
}

async function cajaExpected(companyId: string): Promise<number> {
  const registers = await prisma.cashRegister.findMany({ where: { companyId }, select: { id: true } });
  const perRegister = await Promise.all(registers.map((register) => cajaExpectedForRegister(companyId, register.id)));
  return perRegister.reduce((sum, amount) => sum + amount, 0);
}

export interface RunReconciliationOptions {
  /** Año/mes para las cuadraturas de IVA (comparan contra `f29.ts`, que es mensual). Por defecto, el mes en curso. */
  year?: number;
  month?: number;
}

export interface ReconciliationResult {
  f29: F29Result;
  checks: ReconciliationCheck[];
}

/**
 * Devuelve tanto el F29 del período (ya calculado y guardado por
 * `calculateAndStoreF29`) como las cuadraturas — pensado para
 * `monthly-closing-cron.service.ts`, que necesita ambos para el correo de
 * cierre mensual sin recalcular el F29 dos veces. Sin otros llamadores hoy
 * (`runReconciliation` de abajo era el único consumidor, y era él mismo sin
 * usar fuera de este archivo), así que este es el punto de entrada real.
 */
export async function runReconciliationWithF29(companyId: string, options: RunReconciliationOptions = {}): Promise<ReconciliationResult> {
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

  return { f29, checks: checks.filter((check): check is ReconciliationCheck => check !== null) };
}

/** Solo las cuadraturas, sin el detalle del F29 — mantiene el punto de
 * entrada original para quien solo necesite `ReconciliationCheck[]`. */
export async function runReconciliation(companyId: string, options: RunReconciliationOptions = {}): Promise<ReconciliationCheck[]> {
  const { checks } = await runReconciliationWithF29(companyId, options);
  return checks;
}
