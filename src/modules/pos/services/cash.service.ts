import { prisma } from '@/lib/prisma';
import type { CashMovement, CashRegister, CashShift, Prisma } from '@prisma/client';
import { constraintInvolves } from '@/lib/prisma-errors';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postCashShiftDifference } from '@/modules/accounting/posting-rules/inventory-posting';
import { computeDifference, computeExpectedAmount, sumCashPayments } from '../calc';
import type { CashMovementInput, OpenShiftInput } from '../schema';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { latidoCajaSupersuite } from '@/lib/supersuite';

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

  try {
    return await prisma.cashRegister.upsert({
      where: { companyId_name: { companyId, name: 'Caja Principal' } },
      update: { isActive: true },
      create: { companyId, warehouseId: warehouse.id, name: 'Caja Principal' },
      include: { warehouse: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (constraintInvolves(error, 'name')) {
      const winner = await prisma.cashRegister.findFirst({
        where: { companyId, name: 'Caja Principal', isActive: true },
        include: { warehouse: { select: { id: true, name: true } } },
      });
      if (winner) return winner;
    }
    throw error;
  }
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

export type CashRegisterStatus = CashRegisterWithWarehouse & {
  occupied: boolean;
  cashierName: string | null;
  ownShift: boolean;
};

/** Solo ocupación e identidad: nunca expone el arqueo de otro cajero. */
export async function listCashRegisterStatuses(companyId: string, userId: string): Promise<CashRegisterStatus[]> {
  const registers = await prisma.cashRegister.findMany({
    where: { companyId, isActive: true },
    include: {
      warehouse: { select: { id: true, name: true } },
      shifts: { where: { companyId, status: 'OPEN' }, select: { userId: true, user: { select: { name: true } } }, take: 1 },
    },
    orderBy: { name: 'asc' },
  });
  return registers.map(({ shifts, ...register }) => ({
    ...register,
    occupied: shifts.length > 0,
    cashierName: shifts[0]?.user?.name ?? null,
    ownShift: shifts[0]?.userId === userId,
  }));
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
    const shift = await prisma.cashShift.create({
      data: {
        companyId,
        cashRegisterId: input.cashRegisterId,
        userId,
        initialAmount: input.initialAmount,
        openingNotes: input.openingNotes || undefined,
      },
    });
    // La caja aparece en línea en la Supersuite desde que abre el turno.
    latidoCajaSupersuite(companyId, { id: register.id, name: register.name });
    return shift;
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
  CREDITO_30: 'Crédito (a plazo)',
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
    if (input.idempotencyKey) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos-movement:${companyId}:${input.idempotencyKey}`}, 0))`;
      const existing = await tx.cashMovement.findUnique({
        where: { companyId_idempotencyKey: { companyId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        if (existing.cashShiftId !== shiftId || existing.userId !== userId || existing.type !== input.type || existing.amount !== input.amount || existing.reason !== input.reason.trim()) {
          throw new Error('La clave del movimiento ya se usó con otros datos. Actualiza la caja antes de continuar');
        }
        return existing;
      }
    }
    await lockShiftRow(tx, companyId, shiftId);
    const shift = await tx.cashShift.findFirst({ where: { id: shiftId, companyId } });
    if (!shift) throw new Error('Turno no encontrado');
    if (shift.status !== 'OPEN') throw new Error('El turno ya está cerrado');
    if (shift.userId !== userId) throw new Error('Solo el cajero del turno puede registrar ingresos o retiros');
    if (input.type === 'OUTFLOW') {
      const summary = await getShiftSummary(companyId, shiftId, tx);
      if (input.amount > summary.expectedAmount) throw new Error('El retiro supera el efectivo disponible en esta caja');
    }

    return tx.cashMovement.create({
      data: {
        companyId,
        cashShiftId: shiftId,
        userId,
        type: input.type,
        amount: input.amount,
        reason: input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
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
  input: { actualAmount: number; closingNotes?: string },
  actorUserId?: string
): Promise<ClosedShiftResult> {
  const { shift, summary, replayed } = await prisma.$transaction(async (tx) => {
    // Lock del turno ANTES de calcular el resumen: si el resumen se calculara
    // afuera de esta transacción (como antes), una venta que entra justo entre
    // el cálculo y el UPDATE quedaría fuera del arqueo congelado aunque el
    // dinero sí entró al cajón. Con el lock tomado acá, esa venta (que también
    // bloquea el turno al vender) espera a que este cierre termine — o, si el
    // cierre ganó la carrera, la venta encuentra el turno ya CLOSED y se
    // rechaza antes de mutar nada.
    await lockShiftRow(tx, companyId, shiftId);
    const summary = await getShiftSummary(companyId, shiftId, tx);

    if (computeDifference(input.actualAmount, summary.expectedAmount) !== 0 && (input.closingNotes?.trim().length ?? 0) < 3) {
      throw new Error('Explica el faltante o sobrante antes de cerrar la caja');
    }

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
        closingNotes: input.closingNotes?.trim() || undefined,
      },
    });
    const result = await tx.cashShift.findFirst({ where: { id: shiftId, companyId } });
    if (!result) throw new Error('Turno no encontrado');
    if (updated.count !== 1) {
      if (result.status === 'CLOSED' && result.actualAmount === input.actualAmount && (result.closingNotes ?? '') === (input.closingNotes?.trim() ?? '')) {
        return { shift: result, summary, replayed: true };
      }
      throw new Error('El turno ya fue cerrado. Consulta su comprobante en el historial');
    }

    // Cada boleta del turno ya posteó su propio asiento al emitirse
    // (`postSalesDocumentIssued`): acá solo se contabiliza el descuadre entre
    // lo esperado y lo contado, nunca el total vendido de nuevo.
    await postCashShiftDifference(tx, companyId, { id: result.id, difference: result.difference ?? 0 }, { createdByUserId: actorUserId });

    return { shift: result, summary, replayed: false };
  }, LOCKING_TX_OPTIONS);

  if (replayed) return { shift, summary };
  const cashRegister = await prisma.cashRegister.findFirst({ where: { id: shift.cashRegisterId, companyId }, select: { name: true } });
  // Turno cerrado: en la Supersuite la caja queda "apagada", no "sin señal".
  latidoCajaSupersuite(companyId, { id: shift.cashRegisterId, name: cashRegister?.name ?? 'Caja' }, true);
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

export async function listShifts(companyId: string, options?: { take?: number; userId?: string; cursor?: string }): Promise<ShiftHistoryItem[]> {
  return prisma.cashShift.findMany({
    where: { companyId, ...(options?.userId ? { userId: options.userId } : {}) },
    include: {
      cashRegister: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: options?.take ?? 30,
  });
}
