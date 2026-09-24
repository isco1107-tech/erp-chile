import 'server-only';

import type { DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { startOfTodaySantiago } from '@/lib/chile/timezone';

/**
 * Estado de cuenta de un cliente: lo que debe (documentos emitidos con saldo),
 * cuánto está vencido y por cuántos días, y lo que pagó últimamente. Es lo que
 * se imprime o se manda al cliente para cobrar. Solo lee.
 */

const DAY_MS = 86_400_000;

/** Documentos que NO son deuda propia: se excluyen igual que en `getContactOutstandingBalance`. */
const NON_RECEIVABLE_TYPES: DteType[] = ['COTIZACION', 'GUIA_DESPACHO_52', 'NOTA_CREDITO_61'];

export interface StatementDocument {
  id: string;
  dteType: DteType;
  folio: number | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  pending: number;
  daysOverdue: number;
}

export interface AgingBuckets {
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
}

export interface CustomerStatement {
  contact: { id: string; rut: string; razonSocial: string; email: string | null; phone: string | null; address: string | null; comuna: string | null };
  company: { businessName: string; rut: string; address: string | null; comuna: string | null; logoUrl: string | null };
  documents: StatementDocument[];
  payments: Array<{ id: string; paymentDate: Date; amount: number; paymentMethod: string; reference: string | null; documentFolio: number | null }>;
  totals: { due: number; overdue: number; aging: AgingBuckets };
  generatedAt: Date;
}

/** Tramo de antigüedad de un saldo según días de atraso (0 = al día). Pura, para testear. */
export function agingBucket(daysOverdue: number): keyof AgingBuckets {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1to30';
  if (daysOverdue <= 60) return 'd31to60';
  if (daysOverdue <= 90) return 'd61to90';
  return 'over90';
}

export async function getCustomerStatement(companyId: string, contactId: string): Promise<CustomerStatement | null> {
  const [contact, company] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true, rut: true, razonSocial: true, email: true, phone: true, address: true, comuna: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true, rut: true, address: true, comuna: true, logoUrl: true } }),
  ]);
  if (!contact || !company) return null;

  const since = new Date(Date.now() - 180 * DAY_MS);
  const [docs, payments] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, contactId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { notIn: NON_RECEIVABLE_TYPES } },
      select: { id: true, dteType: true, folio: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    }),
    prisma.payment.findMany({
      where: { companyId, contactId, type: 'INCOME', paymentDate: { gte: since } },
      select: { id: true, paymentDate: true, amount: true, paymentMethod: true, referenceNumber: true, salesDocument: { select: { folio: true } } },
      orderBy: { paymentDate: 'desc' },
      take: 50,
    }),
  ]);

  const today = startOfTodaySantiago();
  const aging: AgingBuckets = { current: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0 };
  const documents: StatementDocument[] = docs.map((doc) => {
    const pending = doc.totalAmount - doc.paidAmount;
    const daysOverdue = doc.dueDate && doc.dueDate < today ? Math.floor((today.getTime() - doc.dueDate.getTime()) / DAY_MS) : 0;
    aging[agingBucket(daysOverdue)] += pending;
    return { ...doc, pending, daysOverdue };
  });

  const due = documents.reduce((sum, doc) => sum + doc.pending, 0);
  return {
    contact,
    company,
    documents,
    payments: payments.map((p) => ({ id: p.id, paymentDate: p.paymentDate, amount: p.amount, paymentMethod: p.paymentMethod, reference: p.referenceNumber, documentFolio: p.salesDocument?.folio ?? null })),
    totals: { due, overdue: due - aging.current, aging },
    generatedAt: new Date(),
  };
}
