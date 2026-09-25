import type { PaymentBatch, PurchaseDocumentType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BATCH_TX_OPTIONS } from '@/lib/prisma-tx';
import { paymentFileIssues, type PaymentFileIssue, type PaymentFileItem } from '@/lib/treasury/payment-file';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { registerPurchasePayment } from './treasury.service';

/**
 * Nómina de pago a proveedores: se eligen las facturas a pagar, se descarga
 * el archivo para el portal del banco y, cuando el banco confirma, se marca
 * pagada: recién ahí se registra el pago de cada factura (con su asiento).
 */

export interface PayableOption {
  id: string;
  contactId: string;
  contactName: string;
  contactRut: string;
  label: string;
  dueDate: Date | null;
  pending: number;
  hasBankData: boolean;
  blocked: boolean;
}

function docLabel(documentType: PurchaseDocumentType, folio: string): string {
  return `${PURCHASE_DOCUMENT_TYPE_LABELS[documentType as keyof typeof PURCHASE_DOCUMENT_TYPE_LABELS] ?? documentType} N° ${folio}`;
}

/** Facturas de proveedor con saldo, que no estén ya en otra nómina abierta. */
export async function listPayableOptions(companyId: string): Promise<PayableOption[]> {
  const [docs, inOpenBatches] = await Promise.all([
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, documentType: { notIn: ['NOTA_CREDITO', 'GUIA_DESPACHO'] } },
      select: {
        id: true,
        documentType: true,
        folio: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        matchStatus: true,
        contact: { select: { id: true, razonSocial: true, rut: true, bankCode: true, bankAccountType: true, bankAccountNumber: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
      take: 1000,
    }),
    prisma.paymentBatchItem.findMany({ where: { companyId, batch: { status: 'DRAFT' } }, select: { purchaseDocumentId: true } }),
  ]);
  const taken = new Set(inOpenBatches.map((item) => item.purchaseDocumentId));
  return docs
    .filter((doc) => !taken.has(doc.id))
    .map((doc) => ({
      id: doc.id,
      contactId: doc.contact.id,
      contactName: doc.contact.razonSocial,
      contactRut: doc.contact.rut,
      label: docLabel(doc.documentType, doc.folio),
      dueDate: doc.dueDate,
      pending: doc.totalAmount - doc.paidAmount,
      hasBankData: !!(doc.contact.bankCode && doc.contact.bankAccountType && doc.contact.bankAccountNumber),
      blocked: doc.matchStatus === 'MISMATCHED',
    }))
    .filter((doc) => doc.pending > 0);
}

export interface PaymentBatchListItem extends PaymentBatch {
  bankAccountName: string;
  itemCount: number;
}

export async function listPaymentBatches(companyId: string): Promise<PaymentBatchListItem[]> {
  const batches = await prisma.paymentBatch.findMany({
    where: { companyId },
    include: { bankAccount: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: { folio: 'desc' },
    take: 100,
  });
  return batches.map(({ bankAccount, _count, ...batch }) => ({ ...batch, bankAccountName: bankAccount.name, itemCount: _count.items }));
}

export interface PaymentBatchDetail extends PaymentBatch {
  bankAccountName: string;
  items: Array<{
    id: string;
    purchaseDocumentId: string;
    label: string;
    amount: number;
    pending: number;
    paymentId: string | null;
    file: PaymentFileItem;
  }>;
  issues: PaymentFileIssue[];
}

export async function getPaymentBatch(companyId: string, id: string): Promise<PaymentBatchDetail | null> {
  const batch = await prisma.paymentBatch.findFirst({
    where: { id, companyId },
    include: {
      bankAccount: { select: { name: true } },
      items: {
        include: {
          purchaseDocument: { select: { documentType: true, folio: true, totalAmount: true, paidAmount: true } },
          contact: { select: { rut: true, razonSocial: true, bankCode: true, bankAccountType: true, bankAccountNumber: true, paymentNoticeEmail: true, email: true } },
        },
      },
    },
  });
  if (!batch) return null;
  const { bankAccount, items, ...rest } = batch;
  const mapped = items
    .map((item) => {
      const label = docLabel(item.purchaseDocument.documentType, item.purchaseDocument.folio);
      return {
        id: item.id,
        purchaseDocumentId: item.purchaseDocumentId,
        label,
        amount: item.amount,
        pending: item.purchaseDocument.totalAmount - item.purchaseDocument.paidAmount,
        paymentId: item.paymentId,
        file: {
          rut: item.contact.rut,
          name: item.contact.razonSocial,
          bankCode: item.contact.bankCode,
          accountType: item.contact.bankAccountType,
          accountNumber: item.contact.bankAccountNumber,
          email: item.contact.paymentNoticeEmail ?? item.contact.email,
          amount: item.amount,
          detail: `Pago ${label}`,
        },
      };
    })
    .sort((a, b) => a.file.name.localeCompare(b.file.name, 'es'));
  return { ...rest, bankAccountName: bankAccount.name, items: mapped, issues: paymentFileIssues(mapped.map((item) => item.file)) };
}

export async function createPaymentBatch(
  companyId: string,
  userId: string,
  input: { bankAccountId: string; paymentDate: string; notes?: string; items: { purchaseDocumentId: string; amount: number }[] }
): Promise<{ id: string; folio: number }> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId, isActive: true }, select: { id: true } });
    if (!account) throw new Error('Cuenta bancaria no encontrada');
    const ids = input.items.map((item) => item.purchaseDocumentId);
    const docs = await tx.purchaseDocument.findMany({
      where: { companyId, id: { in: ids }, status: 'ISSUED' },
      select: { id: true, contactId: true, totalAmount: true, paidAmount: true, matchStatus: true, folio: true },
    });
    if (docs.length !== new Set(ids).size) throw new Error('Alguna factura no existe o ya no está vigente');
    const inOpen = await tx.paymentBatchItem.findFirst({
      where: { companyId, purchaseDocumentId: { in: ids }, batch: { status: 'DRAFT' } },
      select: { batch: { select: { folio: true } } },
    });
    if (inOpen) throw new Error(`Una de las facturas ya está en la nómina #${inOpen.batch.folio}, aún abierta`);
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    for (const item of input.items) {
      const doc = byId.get(item.purchaseDocumentId)!;
      if (doc.matchStatus === 'MISMATCHED') throw new Error(`La factura N° ${doc.folio} tiene diferencias con su orden de compra: no se puede pagar aún`);
      if (item.amount > doc.totalAmount - doc.paidAmount) throw new Error(`El monto a pagar de la factura N° ${doc.folio} supera su saldo`);
    }

    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'PAYMENT_BATCH' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'PAYMENT_BATCH', currentFolio: 1 },
    });
    const batch = await tx.paymentBatch.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        bankAccountId: input.bankAccountId,
        paymentDate: new Date(`${input.paymentDate}T12:00:00Z`),
        notes: input.notes || null,
        createdById: userId,
        totalAmount: input.items.reduce((sum, item) => sum + item.amount, 0),
        items: {
          create: input.items.map((item) => ({
            companyId,
            purchaseDocumentId: item.purchaseDocumentId,
            contactId: byId.get(item.purchaseDocumentId)!.contactId,
            amount: item.amount,
          })),
        },
      },
    });
    return { id: batch.id, folio: batch.folio };
  }, BATCH_TX_OPTIONS);
}

/** El banco confirmó la nómina: se registra el pago de cada factura en un solo paso. */
export async function markPaymentBatchPaid(companyId: string, userId: string, id: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentBatch" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const batch = await tx.paymentBatch.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!batch) throw new Error('Nómina no encontrada');
    if (batch.status !== 'DRAFT') throw new Error('Esta nómina ya fue pagada o anulada');
    for (const item of batch.items) {
      const payment = await registerPurchasePayment(
        companyId,
        item.purchaseDocumentId,
        {
          amount: item.amount,
          paymentMethod: 'TRANSFERENCIA',
          paymentDate: batch.paymentDate.toISOString().slice(0, 10),
          referenceNumber: `Nómina #${batch.folio}`,
          bankAccountId: batch.bankAccountId,
        },
        tx
      );
      await tx.paymentBatchItem.updateMany({ where: { id: item.id, companyId }, data: { paymentId: payment.id } });
    }
    await tx.paymentBatch.updateMany({ where: { id, companyId }, data: { status: 'PAID', paidAt: new Date(), paidById: userId } });
    return batch.items.length;
  }, BATCH_TX_OPTIONS);
}

export async function cancelPaymentBatch(companyId: string, id: string): Promise<void> {
  const result = await prisma.paymentBatch.updateMany({ where: { id, companyId, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
  if (result.count === 0) throw new Error('Solo se anula una nómina que aún no se marca como pagada');
}

export async function removePaymentBatchItem(companyId: string, batchId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const batch = await tx.paymentBatch.findFirst({ where: { id: batchId, companyId }, select: { status: true } });
    if (!batch) throw new Error('Nómina no encontrada');
    if (batch.status !== 'DRAFT') throw new Error('La nómina ya no se puede modificar');
    const removed = await tx.paymentBatchItem.deleteMany({ where: { id: itemId, batchId, companyId } });
    if (removed.count === 0) throw new Error('Línea no encontrada');
    const total = await tx.paymentBatchItem.aggregate({ where: { batchId, companyId }, _sum: { amount: true } });
    await tx.paymentBatch.updateMany({ where: { id: batchId, companyId }, data: { totalAmount: total._sum.amount ?? 0 } });
  });
}
