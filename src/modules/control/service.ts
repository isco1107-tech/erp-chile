import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/auth/guards';
import {
  startOfMonthSantiago,
  startOfTodaySantiago,
  startOfTomorrowSantiago,
} from '@/lib/chile/timezone';
import type { DteType } from '@prisma/client';
const MOVEMENT_LABELS = {
  PURCHASE_IN: 'Llegada de mercadería',
  SALE_OUT: 'Salida por venta',
  ADJUSTMENT_IN: 'Entrada por ajuste',
  ADJUSTMENT_OUT: 'Salida por ajuste',
  TRANSFER: 'Traslado',
};
const TYPES: DteType[] = [
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'BOLETA_EXENTA_41',
  'NOTA_CREDITO_61',
  'NOTA_DEBITO_56',
];
export async function controlSnapshot(context: AuthContext) {
  const companyId = context.companyId;
  const now = new Date();
  const today = startOfTodaySantiago(now);
  const tomorrow = startOfTomorrowSantiago(now);
  const sales = context.permissions.includes('sales:read');
  const inventory = context.permissions.includes('products:read');
  const treasury = context.permissions.includes('treasury:read');
  const pos = context.permissions.includes('pos:operate');
  return prisma.$transaction(
    async (tx) => {
      const groups = async (from: Date) =>
        tx.salesDocument.groupBy({
          by: ['dteType'],
          where: {
            companyId,
            status: 'ISSUED',
            dteType: { in: TYPES },
            issueDate: { gte: from, lt: tomorrow },
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        });
      const daily = await (sales ? groups(today) : []);
      const monthly = await (sales ? groups(startOfMonthSantiago(now)) : []);
      const documents = await (sales
        ? tx.salesDocument.findMany({
            where: { companyId, status: 'ISSUED', dteType: { in: TYPES } },
            select: {
              id: true,
              folio: true,
              dteType: true,
              totalAmount: true,
              issueDate: true,
            },
            orderBy: { issueDate: 'desc' },
            take: 12,
          })
        : []);
      const movements = await (inventory
        ? tx.inventoryMovement.findMany({
            where: { companyId },
            select: {
              id: true,
              quantity: true,
              previousStock: true,
              newStock: true,
              type: true,
              createdAt: true,
              product: { select: { name: true } },
              warehouse: { select: { name: true } },
              user: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          })
        : []);
      const registers = await (pos
        ? tx.cashShift.findMany({
            where: { companyId, status: 'OPEN' },
            select: {
              id: true,
              initialAmount: true,
              openedAt: true,
              cashRegister: { select: { name: true } },
              user: { select: { name: true } },
            },
            orderBy: { openedAt: 'desc' },
            take: 20,
          })
        : []);
      const cashGroups = await (pos
        ? tx.salesDocument.groupBy({
            by: ['cashShiftId'],
            where: {
              companyId,
              status: 'ISSUED',
              paymentMethod: 'EFECTIVO',
              cashShift: { status: 'OPEN', companyId },
            },
            _sum: { totalAmount: true },
          })
        : []);
      const manualGroups = await (pos
        ? tx.cashMovement.groupBy({
            by: ['cashShiftId', 'type'],
            where: { companyId, cashShift: { status: 'OPEN', companyId } },
            _sum: { amount: true },
          })
        : []);
      const income = await (treasury
        ? tx.payment.aggregate({
            where: {
              companyId,
              type: 'INCOME',
              paymentDate: { gte: today, lt: tomorrow },
            },
            _sum: { amount: true },
          })
        : null);
      const expense = await (treasury
        ? tx.payment.aggregate({
            where: {
              companyId,
              type: 'EXPENSE',
              paymentDate: { gte: today, lt: tomorrow },
            },
            _sum: { amount: true },
          })
        : null);
      const registerCount = await (pos
        ? tx.cashShift.count({ where: { companyId, status: 'OPEN' } })
        : null);
      const cashActivity = pos
        ? await tx.cashMovement.findMany({
            where: { companyId },
            select: {
              id: true,
              type: true,
              amount: true,
              reason: true,
              createdAt: true,
              user: { select: { name: true } },
              cashShift: {
                select: { cashRegister: { select: { name: true } } },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          })
        : [];
      const net = (rows: typeof daily) =>
        rows.reduce(
          (sum, row) =>
            sum +
            (row.dteType === 'NOTA_CREDITO_61' ? -1 : 1) *
              (row._sum.totalAmount ?? 0),
          0,
        );
      return {
        at: now.toISOString(),
        company: context.companyName,
        user: context.name,
        salesToday: sales ? net(daily) : null,
        salesMonth: sales ? net(monthly) : null,
        documentsToday: sales
          ? daily.reduce((sum, row) => sum + row._count._all, 0)
          : null,
        incomeToday: income ? (income._sum.amount ?? 0) : null,
        expenseToday: expense ? (expense._sum.amount ?? 0) : null,
        openRegisters: registerCount,
        registers: registers.map((shift) => ({
          id: shift.id,
          name: shift.cashRegister.name,
          cashier: shift.user?.name ?? 'Usuario eliminado',
          openedAt: shift.openedAt.toISOString(),
          expected:
            shift.initialAmount +
            (cashGroups.find((group) => group.cashShiftId === shift.id)?._sum
              .totalAmount ?? 0) +
            manualGroups
              .filter((group) => group.cashShiftId === shift.id)
              .reduce(
                (sum, group) =>
                  sum +
                  (group.type === 'INFLOW' ? 1 : -1) * (group._sum.amount ?? 0),
                0,
              ),
        })),
        activity: [
          ...cashActivity.map((movement) => ({
            id: `cash:${movement.id}`,
            label:
              movement.type === 'INFLOW' ? 'Ingreso de caja' : 'Retiro de caja',
            detail: `${movement.cashShift.cashRegister.name} · ${movement.reason}${movement.user ? ` · ${movement.user.name}` : ''}`,
            amount:
              movement.type === 'INFLOW' ? movement.amount : -movement.amount,
            at: movement.createdAt.toISOString(),
            kind: 'cash',
          })),
          ...documents.map((doc) => ({
            id: `sale:${doc.id}`,
            label: `${doc.dteType === 'NOTA_CREDITO_61' ? 'Nota de crédito' : 'Venta'} #${doc.folio ?? '—'}`,
            detail: 'Documento emitido en el ERP',
            amount:
              doc.dteType === 'NOTA_CREDITO_61'
                ? -doc.totalAmount
                : doc.totalAmount,
            at: doc.issueDate.toISOString(),
            kind: 'sale',
          })),
          ...movements.map((movement) => ({
            id: `stock:${movement.id}`,
            label: movement.product.name,
            detail: `${movement.warehouse.name} · ${MOVEMENT_LABELS[movement.type]} · ${movement.newStock >= movement.previousStock ? '+' : '−'}${movement.quantity} unidades${movement.user ? ` · ${movement.user.name}` : ''}`,
            amount: null,
            at: movement.createdAt.toISOString(),
            kind: 'stock',
          })),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 20),
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export type ControlSnapshot = Awaited<ReturnType<typeof controlSnapshot>>;
