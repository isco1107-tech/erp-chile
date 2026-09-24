import { prisma } from '@/lib/prisma';
import { calculateAndStoreF29 } from '@/lib/chile/f29';
import type { F29Result } from '@/lib/chile/f29';
import { getAccountBalance } from './ledger.service';
import { REVENUE_DTE_TYPES } from '../posting-rules/sales-posting';

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
 * Efectivo esperado en el mayor de CAJA: se calcula replicando exactamente
 * qué operaciones postean a esa cuenta (y solo esas), no todo lo que "pasa
 * por caja" operativamente. Fuentes que SÍ postean a CAJA (ver
 * `sales-posting.ts`, `treasury-posting.ts` y `inventory-posting.ts`):
 *
 *   1. Venta al contado en efectivo (`postSalesDocumentIssued`, dentro de
 *      `sales.service.ts::createSalesDocument`): cualquier `SalesDocument`
 *      ISSUED de un tipo que postea ingreso (`REVENUE_DTE_TYPES` — Factura,
 *      Boleta, Nota de Débito; una Guía no postea nada propio) con
 *      `paymentMethod: 'EFECTIVO'` carga CAJA por su `totalAmount` completo
 *      al emitirse — venga del POS o de Ventas directo. El check anterior
 *      solo miraba ventas ligadas a un `CashShift` (POS), así que una venta
 *      al contado en efectivo emitida desde Ventas nunca entraba al
 *      "esperado" aunque sí cargó CAJA en el mayor.
 *   2. Cobro posterior en efectivo de un documento a crédito
 *      (`postSalesPaymentEntry`, vía `registerSalesPayment`): un `Payment`
 *      INCOME en efectivo carga CAJA — pero solo cuando el documento de
 *      venta al que pertenece es `CREDITO_30`. Un documento al contado ya
 *      quedó cargado en (1) por su propio total; su `Payment` automático (el
 *      que crea `createSalesDocument` para dejar registro en Tesorería) NO
 *      tiene asiento propio (ver comentario en `sales.service.ts`), así que
 *      contarlo de nuevo acá lo duplicaría.
 *   3. Pago a proveedor en efectivo (`postPurchasePaymentEntry`, vía
 *      `registerPurchasePayment`): un `Payment` EXPENSE en efectivo ABONA
 *      CAJA. Una compra nunca carga CAJA al emitirse — siempre va a
 *      PROVEEDORES (`purchases-posting.ts`) — así que todo pago de compra en
 *      efectivo resta.
 *   4. Descuadre de cierre de turno (`postCashShiftDifference`, vía
 *      `closeShift`): al cerrar, el asiento ajusta CAJA al monto CONTADO, no
 *      al teórico — ese ajuste (`CashShift.difference`) es un movimiento real
 *      de la cuenta y debe sumarse, o cada descuadre físico quedaría como una
 *      diferencia "sin explicar" permanente en este mismo check.
 *
 * Fuentes que NO postean a CAJA, y por lo tanto NO deben sumarse al
 * esperado, aunque muevan el cajón físico o aparezcan en otras pantallas:
 * el fondo inicial de un turno (`CashShift.initialAmount`, `openShift` no
 * postea nada) y los movimientos sueltos de caja (`CashMovement` INFLOW/
 * OUTFLOW, `registerCashMovement` tampoco postea nada — son bitácora del
 * cajón físico, no hechos contables). Cobros de auspicios, pagarés y cuotas
 * en efectivo tampoco: no existe hoy una regla de posteo para esos módulos
 * (ver comentarios en `sponsorships.service.ts`/`promissory-notes.service.ts`),
 * así que no cargan CAJA y no deben sumarse al esperado.
 */
async function cajaExpected(companyId: string): Promise<number> {
  const [cashSales, cashCollections, cashSupplierPayments, closedShifts] = await Promise.all([
    prisma.salesDocument.aggregate({
      where: { companyId, status: 'ISSUED', paymentMethod: 'EFECTIVO', dteType: { in: REVENUE_DTE_TYPES } },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: {
        companyId,
        type: 'INCOME',
        paymentMethod: 'EFECTIVO',
        salesDocument: { paymentMethod: 'CREDITO_30' },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { companyId, type: 'EXPENSE', paymentMethod: 'EFECTIVO', purchaseDocumentId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.cashShift.aggregate({
      where: { companyId, status: 'CLOSED' },
      _sum: { difference: true },
    }),
  ]);

  return (
    (cashSales._sum.totalAmount ?? 0) +
    (cashCollections._sum.amount ?? 0) -
    (cashSupplierPayments._sum.amount ?? 0) +
    (closedShifts._sum.difference ?? 0)
  );
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
