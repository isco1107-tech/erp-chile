import type { DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPortalToken, isPortalTokenShape, newPortalToken } from '@/lib/security/portal-token';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { BANK_ACCOUNT_TYPE_LABELS, bankName } from '@/lib/treasury/banks';
import type { SalesDocumentWithRelations } from '@/modules/sales/services/sales.service';

/**
 * Portal del cliente (`/cliente/[token]`): estado de cuenta, documentos,
 * pagos y órdenes de servicio de un cliente, sin cuenta ERP. El enlace se
 * genera desde la ficha del contacto; generar uno nuevo invalida el anterior.
 *
 * Todo se arma campo por campo desde el contacto dueño del token: el portal
 * nunca recibe un id de empresa o de contacto desde el navegador.
 */

export class CustomerPortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerPortalError';
  }
}

export async function createCustomerPortalLink(companyId: string, contactId: string): Promise<{ token: string }> {
  const token = newPortalToken();
  const { count } = await prisma.contact.updateMany({
    where: { id: contactId, companyId },
    data: { portalTokenHash: hashPortalToken(token), portalTokenCreatedAt: new Date() },
  });
  if (count === 0) throw new CustomerPortalError('Contacto no encontrado');
  return { token };
}

export async function revokeCustomerPortalLink(companyId: string, contactId: string): Promise<void> {
  const { count } = await prisma.contact.updateMany({ where: { id: contactId, companyId }, data: { portalTokenHash: null, portalTokenCreatedAt: null } });
  if (count === 0) throw new CustomerPortalError('Contacto no encontrado');
}

export async function getCustomerPortalStatus(companyId: string, contactId: string): Promise<{ active: boolean; createdAt: Date | null } | null> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { portalTokenHash: true, portalTokenCreatedAt: true } });
  if (!contact) return null;
  return { active: Boolean(contact.portalTokenHash), createdAt: contact.portalTokenCreatedAt };
}

/** Documentos que no son deuda propia: la guía la formaliza su factura y la nota de crédito ya rebajó el original. */
const NON_RECEIVABLE_TYPES: DteType[] = ['GUIA_DESPACHO_52', 'NOTA_CREDITO_61', 'COTIZACION'];

type PortalDocumentState = 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL' | 'INFO';

export interface CustomerPortalView {
  company: { name: string; rut: string; logoUrl: string | null; phone: string | null; email: string | null; address: string | null };
  customer: { name: string; rut: string };
  summary: { balance: number; overdue: number; overdueCount: number; openCount: number; nextDue: Date | null };
  documents: { id: string; dteType: DteType; folio: number | null; issueDate: Date; dueDate: Date | null; total: number; paid: number; balance: number; state: PortalDocumentState }[];
  quotes: { id: string; folio: number | null; issueDate: Date; total: number }[];
  payments: { date: Date; amount: number; method: string; reference: string | null }[];
  serviceTickets: { folio: number; equipment: string; status: string; trackingToken: string; createdAt: Date }[];
  bankAccounts: { bank: string; accountType: string; accountNumber: string }[];
}

async function contactForToken(token: string) {
  if (!isPortalTokenShape(token)) return null;
  const contact = await prisma.contact.findUnique({
    where: { portalTokenHash: hashPortalToken(token) },
    select: {
      id: true,
      companyId: true,
      razonSocial: true,
      rut: true,
      company: { select: { businessName: true, rut: true, logoUrl: true, phone: true, email: true, address: true, status: true, features: { select: { hasServiceDesk: true } } } },
    },
  });
  if (!contact || contact.company.status !== 'ACTIVE') return null;
  return contact;
}

export async function getCustomerPortalView(token: string): Promise<CustomerPortalView | null> {
  const contact = await contactForToken(token);
  if (!contact) return null;
  const { companyId, id: contactId } = contact;
  const today = startOfTodaySantiago();
  const since = new Date(today.getTime() - 730 * 24 * 60 * 60 * 1000);

  const [documents, quotes, payments, tickets, accounts] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, contactId, status: 'ISSUED', dteType: { not: 'COTIZACION' }, issueDate: { gte: since } },
      orderBy: { issueDate: 'desc' },
      take: 150,
      select: { id: true, dteType: true, folio: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, paymentStatus: true },
    }),
    prisma.salesDocument.findMany({
      where: { companyId, contactId, status: 'ISSUED', dteType: 'COTIZACION', issueDate: { gte: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000) } },
      orderBy: { issueDate: 'desc' },
      take: 20,
      select: { id: true, folio: true, issueDate: true, totalAmount: true },
    }),
    prisma.payment.findMany({
      where: { companyId, contactId, type: 'INCOME', salesDocumentId: { not: null } },
      orderBy: { paymentDate: 'desc' },
      take: 20,
      select: { paymentDate: true, amount: true, paymentMethod: true, referenceNumber: true },
    }),
    contact.company.features?.hasServiceDesk
      ? prisma.serviceTicket.findMany({
          where: { companyId, contactId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { folio: true, equipment: true, status: true, trackingToken: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.bankAccount.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], take: 2, select: { bankCode: true, accountType: true, accountNumber: true } }),
  ]);

  let balance = 0;
  let overdue = 0;
  let overdueCount = 0;
  let openCount = 0;
  let nextDue: Date | null = null;
  const rows = documents.map((document) => {
    const receivable = !NON_RECEIVABLE_TYPES.includes(document.dteType);
    const pending = receivable && document.paymentStatus !== 'PAID' ? Math.max(0, document.totalAmount - document.paidAmount) : 0;
    let state: PortalDocumentState = 'INFO';
    if (receivable) {
      if (pending === 0) state = 'PAID';
      else if (document.dueDate && document.dueDate < today) state = 'OVERDUE';
      else state = document.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
    }
    if (pending > 0) {
      balance += pending;
      openCount += 1;
      if (state === 'OVERDUE') {
        overdue += pending;
        overdueCount += 1;
      } else if (document.dueDate && (!nextDue || document.dueDate < nextDue)) {
        nextDue = document.dueDate;
      }
    }
    return {
      id: document.id,
      dteType: document.dteType,
      folio: document.folio,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      total: document.totalAmount,
      paid: document.paidAmount,
      balance: pending,
      state,
    };
  });

  return {
    company: {
      name: contact.company.businessName,
      rut: contact.company.rut,
      logoUrl: contact.company.logoUrl,
      phone: contact.company.phone,
      email: contact.company.email,
      address: contact.company.address,
    },
    customer: { name: contact.razonSocial, rut: contact.rut },
    summary: { balance, overdue, overdueCount, openCount, nextDue },
    documents: rows,
    quotes: quotes.map((quote) => ({ id: quote.id, folio: quote.folio, issueDate: quote.issueDate, total: quote.totalAmount })),
    payments: payments.map((payment) => ({ date: payment.paymentDate, amount: payment.amount, method: payment.paymentMethod, reference: payment.referenceNumber })),
    serviceTickets: tickets.map((ticket) => ({ folio: ticket.folio, equipment: ticket.equipment, status: ticket.status, trackingToken: ticket.trackingToken, createdAt: ticket.createdAt })),
    bankAccounts: accounts.map((account) => ({
      bank: bankName(account.bankCode),
      accountType: BANK_ACCOUNT_TYPE_LABELS[account.accountType as keyof typeof BANK_ACCOUNT_TYPE_LABELS] ?? account.accountType,
      accountNumber: account.accountNumber,
    })),
  };
}

/**
 * Un documento del cliente para verlo o imprimirlo. Solo documentos emitidos
 * del mismo contacto dueño del token: un id de otro cliente responde igual
 * que uno inexistente.
 */
export async function getCustomerPortalDocument(token: string, documentId: string): Promise<SalesDocumentWithRelations | null> {
  const contact = await contactForToken(token);
  if (!contact) return null;
  const document = await prisma.salesDocument.findFirst({
    where: { id: documentId, companyId: contact.companyId, contactId: contact.id, status: 'ISSUED' },
    include: { items: true, contact: true, warehouse: true, company: true },
  });
  return document;
}
