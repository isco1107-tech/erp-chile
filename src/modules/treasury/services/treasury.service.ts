import { prisma } from '@/lib/prisma';
import type {
  Contact,
  Payment,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
  PurchaseDocument,
  SalesDocument,
} from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postPurchasePaymentEntry, postSalesPaymentEntry } from '@/modules/accounting/posting-rules/treasury-posting';
import type { RegisterPaymentInput } from '../schema';

interface RegisterPaymentData extends RegisterPaymentInput {
  paymentMethod: PaymentMethodType;
}

/**
 * Deuda vigente de un cliente: suma de `SalesDocument` emitidos y no pagados
 * en su totalidad. Alimenta tanto el resumen de CxC como la validación de
 * límite de crédito al emitir una venta nueva — por eso acepta un cliente de
 * transacción opcional, para poder correr atómicamente junto a la emisión.
 */
export async function getContactOutstandingBalance(
  companyId: string,
  contactId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const result = await db.salesDocument.aggregate({
    where: {
      companyId,
      contactId,
      status: 'ISSUED',
      paymentStatus: { not: 'PAID' },
      // Una Guía de Despacho no es su propia cuenta por cobrar: en el ciclo
      // guía + factura diferida (ver sales.service.ts), la factura que
      // formaliza la guía queda como un SalesDocument aparte, así que sumar
      // ambas duplicaría la misma venta económica.
      dteType: { not: 'GUIA_DESPACHO_52' },
    },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return (result._sum.totalAmount ?? 0) - (result._sum.paidAmount ?? 0);
}

export async function registerSalesPayment(
  companyId: string,
  salesDocumentId: string,
  data: RegisterPaymentData
): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    // Lock sobre el documento: sin él, dos cobros concurrentes leían el mismo
    // paidAmount y el segundo pisaba al primero, dando por pagado un documento
    // que no lo estaba.
    await tx.$queryRaw`SELECT id FROM "SalesDocument" WHERE id = ${salesDocumentId} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.salesDocument.findFirst({ where: { id: salesDocumentId, companyId } });
    if (!doc) throw new Error('Documento de venta no encontrado');
    if (doc.status !== 'ISSUED') throw new Error('Solo se pueden registrar cobros sobre documentos emitidos');

    const pendingBalance = doc.totalAmount - doc.paidAmount;
    if (data.amount > pendingBalance) throw new Error('El monto cobrado supera el saldo pendiente del documento');

    const newPaidAmount = doc.paidAmount + data.amount;
    const paymentStatus: PaymentStatus = newPaidAmount >= doc.totalAmount ? 'PAID' : 'PARTIAL';

    const payment = await tx.payment.create({
      data: {
        companyId,
        type: 'INCOME',
        contactId: doc.contactId,
        salesDocumentId: doc.id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
        referenceNumber: data.referenceNumber,
        bankAccount: data.bankAccount,
        notes: data.notes,
      },
    });

    await tx.salesDocument.update({
      where: { id: doc.id },
      data: { paidAmount: newPaidAmount, paymentStatus },
    });

    await postSalesPaymentEntry(tx, companyId, payment);

    return payment;
  }, LOCKING_TX_OPTIONS);
}

export async function registerPurchasePayment(
  companyId: string,
  purchaseDocumentId: string,
  data: RegisterPaymentData
): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    // Mismo lock que en cobros: evita que dos pagos concurrentes se pisen.
    await tx.$queryRaw`SELECT id FROM "PurchaseDocument" WHERE id = ${purchaseDocumentId} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.purchaseDocument.findFirst({ where: { id: purchaseDocumentId, companyId } });
    if (!doc) throw new Error('Documento de compra no encontrado');
    if (doc.status !== 'ISSUED') throw new Error('Solo se pueden registrar pagos sobre documentos registrados');
    // Matching de 3 vías: una factura que no cuadra con su Orden de Compra
    // no libera pago hasta que alguien con `purchases:override_match` la
    // fuerce explícitamente (pasa a OVERRIDDEN) o se corrija el documento.
    if (doc.matchStatus === 'MISMATCHED') {
      throw new Error(
        `El pago está bloqueado: esta factura no coincide con su Orden de Compra${doc.matchNotes ? ` (${doc.matchNotes})` : ''}`
      );
    }

    const pendingBalance = doc.totalAmount - doc.paidAmount;
    if (data.amount > pendingBalance) throw new Error('El monto pagado supera el saldo pendiente del documento');

    const newPaidAmount = doc.paidAmount + data.amount;
    const paymentStatus: PaymentStatus = newPaidAmount >= doc.totalAmount ? 'PAID' : 'PARTIAL';

    const payment = await tx.payment.create({
      data: {
        companyId,
        type: 'EXPENSE',
        contactId: doc.contactId,
        purchaseDocumentId: doc.id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
        referenceNumber: data.referenceNumber,
        bankAccount: data.bankAccount,
        notes: data.notes,
      },
    });

    await tx.purchaseDocument.updateMany({
      where: { id: doc.id, companyId },
      data: { paidAmount: newPaidAmount, paymentStatus },
    });

    await postPurchasePaymentEntry(tx, companyId, payment);

    return payment;
  }, LOCKING_TX_OPTIONS);
}

export type ReceivableRow = SalesDocument & { contact: Contact };

export async function listReceivables(companyId: string): Promise<ReceivableRow[]> {
  return prisma.salesDocument.findMany({
    where: {
      companyId,
      status: 'ISSUED',
      paymentStatus: { not: 'PAID' },
      // Misma exclusión que `getContactOutstandingBalance`: en el ciclo guía +
      // factura diferida, la guía nunca queda marcada PAID cuando se emite la
      // factura que la formaliza (son dos SalesDocument distintos para la
      // misma venta económica) — sin este filtro, esta lista dobla el monto
      // pendiente de cada venta que pasó por guía.
      dteType: { not: 'GUIA_DESPACHO_52' },
    },
    include: { contact: true },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    take: 200,
  });
}

export type PayableRow = PurchaseDocument & { contact: Contact };

export async function listPayables(companyId: string): Promise<PayableRow[]> {
  return prisma.purchaseDocument.findMany({
    where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
    include: { contact: true },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    take: 200,
  });
}

export async function listPaymentsForSalesDocument(companyId: string, salesDocumentId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { companyId, salesDocumentId }, orderBy: { paymentDate: 'desc' } });
}

export async function listPaymentsForPurchaseDocument(companyId: string, purchaseDocumentId: string): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { companyId, purchaseDocumentId }, orderBy: { paymentDate: 'desc' } });
}

export interface DebtorRow {
  contactId: string;
  razonSocial: string;
  rut: string;
  balance: number;
}

export interface CxCSummary {
  totalReceivable: number;
  overdueAmount: number;
  collectedThisMonth: number;
  topDebtors: DebtorRow[];
}

export async function getCxCSummary(companyId: string): Promise<CxCSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Misma exclusión que `getContactOutstandingBalance`/`listReceivables`: sin
  // ella, una guía y la factura que la formaliza suman el doble de la misma
  // venta económica.
  const pendingWhere: Prisma.SalesDocumentWhereInput = {
    companyId,
    status: 'ISSUED',
    paymentStatus: { not: 'PAID' },
    dteType: { not: 'GUIA_DESPACHO_52' },
  };

  const [totalAgg, overdueAgg, collected, debtorGroups] = await Promise.all([
    prisma.salesDocument.aggregate({ where: pendingWhere, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.salesDocument.aggregate({
      where: { ...pendingWhere, dueDate: { lt: now } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.payment.aggregate({
      where: { companyId, type: 'INCOME', paymentDate: { gte: monthStart } },
      _sum: { amount: true },
    }),
    // Agrupado por contacto: acotado por # de deudores, no por # de documentos.
    prisma.salesDocument.groupBy({
      by: ['contactId'],
      where: pendingWhere,
      _sum: { totalAmount: true, paidAmount: true },
    }),
  ]);

  const totalReceivable = (totalAgg._sum.totalAmount ?? 0) - (totalAgg._sum.paidAmount ?? 0);
  const overdueAmount = (overdueAgg._sum.totalAmount ?? 0) - (overdueAgg._sum.paidAmount ?? 0);

  const topDebtorBalances = debtorGroups
    .map((g) => ({ contactId: g.contactId, balance: (g._sum.totalAmount ?? 0) - (g._sum.paidAmount ?? 0) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  const topDebtorContacts = await prisma.contact.findMany({
    where: { companyId, id: { in: topDebtorBalances.map((d) => d.contactId) } },
    select: { id: true, razonSocial: true, rut: true },
  });
  const contactById = new Map(topDebtorContacts.map((c) => [c.id, c]));
  const topDebtors: DebtorRow[] = topDebtorBalances.map((d) => ({
    contactId: d.contactId,
    razonSocial: contactById.get(d.contactId)?.razonSocial ?? '',
    rut: contactById.get(d.contactId)?.rut ?? '',
    balance: d.balance,
  }));

  return {
    totalReceivable,
    overdueAmount,
    collectedThisMonth: collected._sum.amount ?? 0,
    topDebtors,
  };
}

export interface CxPSummary {
  totalPayable: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
}

export async function getCxPSummary(companyId: string): Promise<CxPSummary> {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const pendingWhere: Prisma.PurchaseDocumentWhereInput = { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } };

  const [totalAgg, dueThisWeekAgg] = await Promise.all([
    prisma.purchaseDocument.aggregate({ where: pendingWhere, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.purchaseDocument.aggregate({
      where: { ...pendingWhere, dueDate: { gte: now, lte: weekEnd } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
  ]);

  return {
    totalPayable: (totalAgg._sum.totalAmount ?? 0) - (totalAgg._sum.paidAmount ?? 0),
    dueThisWeekCount: dueThisWeekAgg._count,
    dueThisWeekAmount: (dueThisWeekAgg._sum.totalAmount ?? 0) - (dueThisWeekAgg._sum.paidAmount ?? 0),
  };
}

export interface CashFlowPoint {
  date: string;
  income: number;
  expense: number;
}

export type CashFlowMovement = Payment & { contact: Contact };

export interface CashFlowMethodBreakdown {
  method: PaymentMethodType;
  income: number;
  expense: number;
  net: number;
}

export interface CashFlowResult {
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  series: CashFlowPoint[];
  /** Consolidado por medio de pago: cuánto entró y salió de cada uno (efectivo, transferencia, tarjeta, etc). */
  byPaymentMethod: CashFlowMethodBreakdown[];
  movements: CashFlowMovement[];
}

export async function getCashFlow(companyId: string, startDate: Date, endDate: Date): Promise<CashFlowResult> {
  const payments = await prisma.payment.findMany({
    where: { companyId, paymentDate: { gte: startDate, lte: endDate } },
    include: { contact: true },
    orderBy: { paymentDate: 'desc' },
  });

  const totalIncome = payments.filter((p) => p.type === 'INCOME').reduce((sum, p) => sum + p.amount, 0);
  const totalExpense = payments.filter((p) => p.type === 'EXPENSE').reduce((sum, p) => sum + p.amount, 0);

  const byDate = new Map<string, { income: number; expense: number }>();
  const byMethod = new Map<PaymentMethodType, { income: number; expense: number }>();
  for (const p of payments) {
    const dateKey = p.paymentDate.toISOString().slice(0, 10);
    const dateEntry = byDate.get(dateKey) ?? { income: 0, expense: 0 };
    const methodEntry = byMethod.get(p.paymentMethod) ?? { income: 0, expense: 0 };
    if (p.type === 'INCOME') {
      dateEntry.income += p.amount;
      methodEntry.income += p.amount;
    } else {
      dateEntry.expense += p.amount;
      methodEntry.expense += p.amount;
    }
    byDate.set(dateKey, dateEntry);
    byMethod.set(p.paymentMethod, methodEntry);
  }
  const series = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byPaymentMethod = Array.from(byMethod.entries())
    .map(([method, v]) => ({ method, ...v, net: v.income - v.expense }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));

  return { totalIncome, totalExpense, netAmount: totalIncome - totalExpense, series, byPaymentMethod, movements: payments };
}
