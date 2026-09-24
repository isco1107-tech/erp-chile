import { prisma } from '@/lib/prisma';
import type { CashMovement, CashRegister, CashShift, Prisma } from '@prisma/client';
import { constraintInvolves } from '@/lib/prisma-errors';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postCashShiftDifference } from '@/modules/accounting/posting-rules/inventory-posting';
import { computeDifference, computeExpectedAmount, sumCashPayments } from '../calc';
import type { CashMovementInput, OpenShiftInput } from '../schema';
import { emitWorkflowEvent } from '@/lib/workflows/engine';

/**
 * Acepta tanto el cliente global de Prisma como un `tx` de transacción: las
 * lecturas que solo muestran el arqueo en pantalla usan el primero, y las que
 * participan de una operación que debe serializarse con el turno (venta,
 * movimiento, cierre) pasan el `tx` para que todo corra bajo el mismo lock.
 */
type DbClient = Prisma.TransactionClient;

/**
 * Toma un lock exclusivo sobre la fila del turno hasta el fin de la
 * transacción. Es lo que serializa venta, movimiento de caja, anulación y
 * cierre de un mismo turno: sin este lock, `closeShift` puede calcular el
 * resumen mientras una venta concurrente todavía no confirma, y esa venta
 * queda fuera del arqueo congelado aunque el dinero sí entró al cajón.
 */
async function lockShiftRow(tx: DbClient, companyId: string, shiftId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} AND "companyId" = ${companyId} FOR UPDATE`;
}

export type CashRegisterWithWarehouse = CashRegister & { warehouse: { id: string; name: string } };

export async function listCashRegisters(companyId: string): Promise<CashRegisterWithWarehouse[]> {
  return prisma.cashRegister.findMany({
    where: { companyId, isActive: true },
    include: { warehouse: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
}

/**
 * Garantiza que exista al menos una caja. Un local nuevo no debería tener que
 * pasar por configuración antes de poder vender: se crea "Caja Principal" sobre
 * la bodega por defecto la primera vez que alguien abre el POS.
 */
export async function ensureDefaultCashRegister(companyId: string): Promise<CashRegisterWithWarehouse | null> {
  const existing = await listCashRegisters(companyId);
  if (existing.length > 0) return existing[0]!;

  const warehouse =
    (await prisma.warehouse.findFirst({ where: { companyId, isDefault: true } })) ??
    (await prisma.warehouse.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } }));
  if (!warehouse) return null;

  const created = await prisma.cashRegister.create({
    data: { companyId, warehouseId: warehouse.id, name: 'Caja Principal' },
    include: { warehouse: { select: { id: true, name: true } } },
  });
  return created;
}

export async function createCashRegister(
  companyId: string,
  input: { name: string; warehouseId: string }
): Promise<CashRegister> {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
  if (!warehouse) throw new Error('Bodega no encontrada');

  return prisma.cashRegister.create({
    data: { companyId, warehouseId: input.warehouseId, name: input.name.trim() },
  });
}

export type OpenShiftDetail = CashShift & {
  cashRegister: CashRegisterWithWarehouse;
  user: { id: string; name: string; email: string } | null;
};

/** Turno abierto del usuario, si tiene uno. La pantalla del POS gira en torno a esto. */
export async function getOpenShiftForUser(companyId: string, userId: string): Promise<OpenShiftDetail | null> {
  return prisma.cashShift.findFirst({
    where: { companyId, userId, status: 'OPEN' },
    include: {
      cashRegister: { include: { warehouse: { select: { id: true, name: true } } } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getShift(companyId: string, shiftId: string): Promise<OpenShiftDetail | null> {
  return prisma.cashShift.findFirst({
    where: { companyId, id: shiftId },
    include: {
      cashRegister: { include: { warehouse: { select: { id: true, name: true } } } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Traduce la violación de los índices únicos parciales del turno a un mensaje
 * útil. Esos índices son la defensa real contra dos aperturas simultáneas; sin
 * esta traducción el cajero vería el error crudo de Postgres.
 */
function toShiftConflictError(error: unknown): Error | null {
  if (constraintInvolves(error, 'userId')) {
    return new Error('Ya tienes un turno de caja abierto. Ciérralo antes de abrir otro');
  }
  if (constraintInvolves(error, 'cashRegisterId')) {
    return new Error('Esta caja ya tiene un turno abierto por otro usuario');
  }
  return null;
}

export async function openShift(companyId: string, userId: string, input: OpenShiftInput): Promise<CashShift> {
  const register = await prisma.cashRegister.findFirst({
    where: { id: input.cashRegisterId, companyId, isActive: true },
  });
  if (!register) throw new Error('Caja no encontrada');

  try {
    return await prisma.cashShift.create({
      data: {
        companyId,
        cashRegisterId: input.cashRegisterId,
        userId,
        initialAmount: input.initialAmount,
        openingNotes: input.openingNotes || undefined,
      },
    });
  } catch (error) {
    const conflict = toShiftConflictError(error);
    if (conflict) throw conflict;
    throw error;
  }
}

export interface PaymentMethodBreakdown {
  method: string;
  label: string;
  documentCount: number;
  total: number;
}

export interface ShiftSummary {
  shiftId: string;
  openedAt: Date;
  initialAmount: number;
  /** Ventas por medio de pago, incluidas las que no tocan el cajón. */
  byPaymentMethod: PaymentMethodBreakdown[];
  salesTotal: number;
  documentCount: number;
  cashSales: number;
  inflows: number;
  outflows: number;
  /**
   * Boletas anuladas dentro del turno. NO restan del esperado —ya quedaron
   * fuera del cálculo al excluirse—, pero se exponen para que el arqueo deje
   * rastro de cuánto dinero se devolvió y no sea un descuento invisible.
   */
  cancelledCount: number;
  cancelledTotal: number;
  cancelledCashTotal: number;
  /** Lo que debería haber físicamente en el cajón. */
  expectedAmount: number;
}

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA_DEBITO: 'Débito',
  TARJETA_CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transferencia',
  CREDITO_30: 'Crédito 30 días',
};

/**
 * Resumen del turno calculado en vivo desde las ventas y los movimientos.
 *
 * El esperado se deriva siempre de los datos, nunca de un acumulador guardado:
 * un contador incremental se desincroniza en cuanto una venta se anula, y el
 * arqueo dejaría de cuadrar sin que nadie sepa por qué.
 */
export async function getShiftSummary(
  companyId: string,
  shiftId: string,
  client: DbClient = prisma
): Promise<ShiftSummary> {
  const shift = await client.cashShift.findFirst({ where: { id: shiftId, companyId } });
  if (!shift) throw new Error('Turno no encontrado');

  const [salesGroups, movements, cancelledGroups] = await Promise.all([
    client.salesDocument.groupBy({
      by: ['paymentMethod'],
      // Las anuladas no cuentan: el dinero se devolvió del cajón.
      where: { companyId, cashShiftId: shiftId, status: 'ISSUED' },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    client.cashMovement.groupBy({
      by: ['type'],
      where: { companyId, cashShiftId: shiftId },
      _sum: { amount: true },
    }),
    client.salesDocument.groupBy({
      by: ['paymentMethod'],
      where: { companyId, cashShiftId: shiftId, status: 'CANCELLED' },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const byPaymentMethod: PaymentMethodBreakdown[] = salesGroups
    .map((group) => ({
      method: group.paymentMethod,
      label: METHOD_LABELS[group.paymentMethod] ?? group.paymentMethod,
      documentCount: group._count._all,
      total: group._sum.totalAmount ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const salesTotal = byPaymentMethod.reduce((sum, row) => sum + row.total, 0);
  const documentCount = byPaymentMethod.reduce((sum, row) => sum + row.documentCount, 0);
  const cashSales = sumCashPayments(byPaymentMethod);

  const inflows = movements.find((m) => m.type === 'INFLOW')?._sum.amount ?? 0;
  const outflows = movements.find((m) => m.type === 'OUTFLOW')?._sum.amount ?? 0;

  const cancelledTotals = cancelledGroups.map((group) => ({
    method: group.paymentMethod,
    total: group._sum.totalAmount ?? 0,
  }));

  return {
    shiftId,
    openedAt: shift.openedAt,
    initialAmount: shift.initialAmount,
    byPaymentMethod,
    salesTotal,
    documentCount,
    cashSales,
    inflows,
    outflows,
    cancelledCount: cancelledGroups.reduce((sum, group) => sum + group._count._all, 0),
    cancelledTotal: cancelledTotals.reduce((sum, row) => sum + row.total, 0),
    cancelledCashTotal: sumCashPayments(cancelledTotals),
    expectedAmount: computeExpectedAmount({ initialAmount: shift.initialAmount, cashSales, inflows, outflows }),
  };
}

export async function registerCashMovement(
  companyId: string,
  shiftId: string,
  userId: string,
  input: CashMovementInput
): Promise<CashMovement> {
  // Lock del turno antes de leer su estado: sin esto, un cierre en curso podría
  // congelar el resumen justo antes de que este movimiento se confirme, y el
  // ingreso/egreso quedaría fuera del arqueo aunque el turno siguiera OPEN al
  // momento de crearse.
  return prisma.$transaction(async (tx) => {
    await lockShiftRow(tx, companyId, shiftId);
    const shift = await tx.cashShift.findFirst({ where: { id: shiftId, companyId } });
    if (!shift) throw new Error('Turno no encontrado');
    if (shift.status !== 'OPEN') throw new Error('El turno ya está cerrado');

    return tx.cashMovement.create({
      data: {
        companyId,
        cashShiftId: shiftId,
        userId,
        type: input.type,
        amount: input.amount,
        reason: input.reason.trim(),
      },
    });
  }, LOCKING_TX_OPTIONS);
}

export async function listCashMovements(companyId: string, shiftId: string): Promise<CashMovement[]> {
  return prisma.cashMovement.findMany({
    where: { companyId, cashShiftId: shiftId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface ClosedShiftResult {
  shift: CashShift;
  summary: ShiftSummary;
}

/**
 * Cierra el turno congelando el esperado, lo contado y el descuadre.
 *
 * El esperado se recalcula acá dentro y no se acepta del cliente: si el cajero
 * pudiera enviarlo, podría declarar un descuadre de cero sobre cualquier monto.
 */
export async function closeShift(
  companyId: string,
  shiftId: string,
  input: { actualAmount: number; closingNotes?: string }
): Promise<ClosedShiftResult> {
  const { shift, summary } = await prisma.$transaction(async (tx) => {
    // Lock del turno ANTES de calcular el resumen: si el resumen se calculara
    // afuera de esta transacción (como antes), una venta que entra justo entre
    // el cálculo y el UPDATE quedaría fuera del arqueo congelado aunque el
    // dinero sí entró al cajón. Con el lock tomado acá, esa venta (que también
    // bloquea el turno al vender) espera a que este cierre termine — o, si el
    // cierre ganó la carrera, la venta encuentra el turno ya CLOSED y se
    // rechaza antes de mutar nada.
    await lockShiftRow(tx, companyId, shiftId);
    const summary = await getShiftSummary(companyId, shiftId, tx);

    // Cierre condicionado al estado OPEN: si otro cierre ganó la carrera, este
    // afecta 0 filas y falla, en vez de pisar el arqueo ya declarado.
    const updated = await tx.cashShift.updateMany({
      where: { id: shiftId, companyId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedAmount: summary.expectedAmount,
        actualAmount: input.actualAmount,
        difference: computeDifference(input.actualAmount, summary.expectedAmount),
        closingNotes: input.closingNotes || undefined,
      },
    });
    if (updated.count !== 1) throw new Error('El turno ya fue cerrado');

    const result = await tx.cashShift.findFirst({ where: { id: shiftId, companyId } });
    if (!result) throw new Error('Turno no encontrado');

    // Cada boleta del turno ya posteó su propio asiento al emitirse
    // (`postSalesDocumentIssued`): acá solo se contabiliza el descuadre entre
    // lo esperado y lo contado, nunca el total vendido de nuevo.
    await postCashShiftDifference(tx, companyId, { id: result.id, difference: result.difference ?? 0 });

    return { shift: result, summary };
  }, LOCKING_TX_OPTIONS);

  const cashRegister = await prisma.cashRegister.findFirst({ where: { id: shift.cashRegisterId, companyId }, select: { name: true } });
  void emitWorkflowEvent(companyId, 'CASH_SHIFT_CLOSED', {
    shiftId: shift.id,
    cashRegisterName: cashRegister?.name ?? null,
    expectedAmount: shift.expectedAmount ?? 0,
    actualAmount: shift.actualAmount ?? 0,
    difference: shift.difference ?? 0,
  });
  return { shift, summary };
}

export type ShiftHistoryItem = CashShift & {
  cashRegister: { name: string };
  user: { name: string; email: string } | null;
};

export async function listShifts(companyId: string, options?: { take?: number }): Promise<ShiftHistoryItem[]> {
  return prisma.cashShift.findMany({
    where: { companyId },
    include: {
      cashRegister: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: options?.take ?? 30,
  });
}
