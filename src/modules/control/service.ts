import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/auth/guards';
import {
  startOfMonthSantiago,
  startOfTodaySantiago,
  startOfTomorrowSantiago,
} from '@/lib/chile/timezone';
import type { DteType } from '@prisma/client';
import { exportAccess } from '@/lib/exports/access';
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
  // Boletas del mostrador incluidas: una empresa que vende solo por el POS (sin Facturación, que hoy no se
  // vende) quedaba sin «Ventas de hoy» en la app del dueño. Misma regla que «Exportar datos».
  const sales = exportAccess(context).sales;
  const inventory = context.permissions.includes('products:read');
  const treasury = context.permissions.includes('treasury:read');
  const pos = context.permissions.includes('pos:operate');
  const raw = await prisma.$transaction(
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
              productId: true,
              warehouseId: true,
              userId: true,
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
              cashRegisterId: true,
              userId: true,
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
              userId: true,
              cashShiftId: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          })
        : [];
      return {
        daily,
        monthly,
        documents,
        movements,
        registers,
        cashGroups,
        manualGroups,
        income,
        expense,
        registerCount,
        cashActivity,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
  const {
    daily,
    monthly,
    documents,
    movements,
    registers,
    cashGroups,
    manualGroups,
    income,
    expense,
    registerCount,
    cashActivity,
  } = raw;

  // Los nombres se leen DESPUÉS de la transacción: dentro de ella Prisma lanza las
  // relaciones anidadas en paralelo sobre la única conexión y `pg` avisa (en pg@9 fallará).
  const idsOf = (values: (string | null)[]) => [
    ...new Set(values.filter((id): id is string => id !== null)),
  ];
  const shiftIds = idsOf(cashActivity.map((movement) => movement.cashShiftId));
  const shiftRegisters = shiftIds.length
    ? await prisma.cashShift.findMany({
        where: { companyId, id: { in: shiftIds } },
        select: { id: true, cashRegisterId: true },
      })
    : [];
  const registerIds = idsOf([
    ...registers.map((shift) => shift.cashRegisterId),
    ...shiftRegisters.map((shift) => shift.cashRegisterId),
  ]);
  const productIds = idsOf(movements.map((movement) => movement.productId));
  const warehouseIds = idsOf(movements.map((movement) => movement.warehouseId));
  const userIds = idsOf([
    ...movements.map((movement) => movement.userId),
    ...registers.map((shift) => shift.userId),
    ...cashActivity.map((movement) => movement.userId),
  ]);
  const [registerRows, productRows, warehouseRows, userRows] =
    await Promise.all([
      registerIds.length
        ? prisma.cashRegister.findMany({
            where: { companyId, id: { in: registerIds } },
            select: { id: true, name: true },
          })
        : [],
      productIds.length
        ? prisma.product.findMany({
            where: { companyId, id: { in: productIds } },
            select: { id: true, name: true },
          })
        : [],
      warehouseIds.length
        ? prisma.warehouse.findMany({
            where: { companyId, id: { in: warehouseIds } },
            select: { id: true, name: true },
          })
        : [],
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
  const namesOf = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.id, row.name]));
  const registerNames = namesOf(registerRows);
  const productNames = namesOf(productRows);
  const warehouseNames = namesOf(warehouseRows);
  const userNames = namesOf(userRows);
  const registerOfShift = new Map(
    shiftRegisters.map((shift) => [shift.id, shift.cashRegisterId]),
  );
  const registerNameOfShift = (shiftId: string) =>
    registerNames.get(registerOfShift.get(shiftId) ?? '') ?? 'Caja';
  const userName = (userId: string | null) =>
    userId ? (userNames.get(userId) ?? null) : null;

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
      name: registerNames.get(shift.cashRegisterId) ?? 'Caja',
      cashier: userName(shift.userId) ?? 'Usuario eliminado',
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
      ...cashActivity.map((movement) => {
        const person = userName(movement.userId);
        return {
          id: `cash:${movement.id}`,
          label:
            movement.type === 'INFLOW' ? 'Ingreso de caja' : 'Retiro de caja',
          detail: `${registerNameOfShift(movement.cashShiftId)} · ${movement.reason}${person ? ` · ${person}` : ''}`,
          amount:
            movement.type === 'INFLOW' ? movement.amount : -movement.amount,
          at: movement.createdAt.toISOString(),
          kind: 'cash',
        };
      }),
      ...documents.map((doc) => ({
        id: `sale:${doc.id}`,
        label: `${doc.dteType === 'NOTA_CREDITO_61' ? 'Nota de crédito' : 'Venta'} #${doc.folio ?? '—'}`,
        detail: 'Documento emitido en el ERP',
        amount:
          doc.dteType === 'NOTA_CREDITO_61' ? -doc.totalAmount : doc.totalAmount,
        at: doc.issueDate.toISOString(),
        kind: 'sale',
      })),
      ...movements.map((movement) => {
        const person = userName(movement.userId);
        return {
          id: `stock:${movement.id}`,
          label: productNames.get(movement.productId) ?? 'Producto',
          detail: `${warehouseNames.get(movement.warehouseId) ?? 'Bodega'} · ${MOVEMENT_LABELS[movement.type]} · ${movement.newStock >= movement.previousStock ? '+' : '−'}${movement.quantity} unidades${person ? ` · ${person}` : ''}`,
          amount: null,
          at: movement.createdAt.toISOString(),
          kind: 'stock',
        };
      }),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20),
  };
}
export type ControlSnapshot = Awaited<ReturnType<typeof controlSnapshot>>;
