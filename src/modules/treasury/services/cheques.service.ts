import type { Cheque, ChequeDirection, ChequeStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { registerPurchasePayment, registerSalesPayment, reversePayment } from './treasury.service';

/**
 * Cartera de cheques. Un cheque recibido que salda una factura registra el
 * cobro al recibirlo (así lo hace el comercio chileno: el cliente queda al
 * día), y si después el banco lo protesta, el cobro se reversa y la factura
 * vuelve a quedar pendiente.
 */

export interface ChequeInput {
  direction: ChequeDirection;
  number: string;
  bankCode: string;
  drawerName?: string;
  drawerRut?: string;
  contactId?: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  /** Documento que salda (venta si es recibido, compra si es girado). */
  documentId?: string;
  bankAccountId?: string;
  notes?: string;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

export type ChequeRow = Cheque & {
  contact: { razonSocial: string; rut: string } | null;
  bankAccount: { name: string } | null;
  documentLabel: string | null;
};

export async function listCheques(
  companyId: string,
  options: { direction: ChequeDirection; status?: ChequeStatus | 'OPEN' | 'ALL'; query?: string }
): Promise<ChequeRow[]> {
  const where: Prisma.ChequeWhereInput = { companyId, direction: options.direction };
  if (options.status === 'OPEN') where.status = { in: ['PORTFOLIO', 'DEPOSITED'] };
  else if (options.status && options.status !== 'ALL') where.status = options.status;
  const term = options.query?.trim();
  if (term) {
    where.OR = [
      { number: { contains: term } },
      { drawerName: { contains: term, mode: 'insensitive' } },
      { contact: { razonSocial: { contains: term, mode: 'insensitive' } } },
    ];
  }
  const cheques = await prisma.cheque.findMany({
    where,
    include: {
      contact: { select: { razonSocial: true, rut: true } },
      bankAccount: { select: { name: true } },
      payment: { select: { salesDocument: { select: { folio: true } }, purchaseDocument: { select: { folio: true } } } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 500,
  });
  return cheques.map(({ payment, ...cheque }) => ({
    ...cheque,
    documentLabel: payment?.salesDocument ? `Doc. N° ${payment.salesDocument.folio ?? 's/n'}` : payment?.purchaseDocument ? `Doc. N° ${payment.purchaseDocument.folio}` : null,
  }));
}

export interface ChequeSummary {
  portfolioCount: number;
  portfolioAmount: number;
  dueNowCount: number;
  dueNowAmount: number;
  bouncedCount: number;
  bouncedAmount: number;
  issuedOutstandingCount: number;
  issuedOutstandingAmount: number;
}

export async function getChequeSummary(companyId: string, now: Date): Promise<ChequeSummary> {
  const tomorrow = new Date(startOfTodaySantiago(now).getTime() + 86_400_000);
  const [portfolio, dueNow, bounced, issued] = await Promise.all([
    prisma.cheque.aggregate({ where: { companyId, direction: 'RECEIVED', status: 'PORTFOLIO' }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.cheque.aggregate({ where: { companyId, direction: 'RECEIVED', status: 'PORTFOLIO', dueDate: { lt: tomorrow } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.cheque.aggregate({ where: { companyId, direction: 'RECEIVED', status: 'BOUNCED' }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.cheque.aggregate({ where: { companyId, direction: 'ISSUED', status: 'PORTFOLIO' }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  return {
    portfolioCount: portfolio._count._all,
    portfolioAmount: portfolio._sum.amount ?? 0,
    dueNowCount: dueNow._count._all,
    dueNowAmount: dueNow._sum.amount ?? 0,
    bouncedCount: bounced._count._all,
    bouncedAmount: bounced._sum.amount ?? 0,
    issuedOutstandingCount: issued._count._all,
    issuedOutstandingAmount: issued._sum.amount ?? 0,
  };
}

export async function createCheque(companyId: string, userId: string, input: ChequeInput): Promise<Cheque> {
  return prisma.$transaction(async (tx) => {
    let contactId = input.contactId || null;
    if (contactId) {
      const contact = await tx.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
      if (!contact) throw new Error('Cliente o proveedor no encontrado');
    }
    if (input.bankAccountId) {
      const account = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId }, select: { id: true } });
      if (!account) throw new Error('Cuenta bancaria no encontrada');
    }

    let paymentId: string | null = null;
    if (input.documentId) {
      const paymentData = {
        amount: input.amount,
        paymentMethod: 'CHEQUE' as const,
        paymentDate: input.issueDate,
        referenceNumber: `Cheque ${input.number}`,
        bankAccountId: input.direction === 'ISSUED' ? input.bankAccountId : undefined,
        notes: input.notes,
      };
      const payment =
        input.direction === 'RECEIVED'
          ? await registerSalesPayment(companyId, input.documentId, paymentData, tx)
          : await registerPurchasePayment(companyId, input.documentId, paymentData, tx);
      paymentId = payment.id;
      contactId = payment.contactId;
    }

    return tx.cheque.create({
      data: {
        companyId,
        direction: input.direction,
        number: input.number,
        bankCode: input.bankCode,
        drawerName: input.drawerName || null,
        drawerRut: input.drawerRut || null,
        contactId,
        amount: input.amount,
        issueDate: dateOnly(input.issueDate),
        dueDate: dateOnly(input.dueDate),
        paymentId,
        bankAccountId: input.direction === 'ISSUED' ? (input.bankAccountId ?? null) : null,
        notes: input.notes || null,
        createdById: userId,
      },
    });
  }, LOCKING_TX_OPTIONS);
}

async function lockCheque(tx: Prisma.TransactionClient, companyId: string, id: string): Promise<Cheque> {
  await tx.$queryRaw`SELECT id FROM "Cheque" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const cheque = await tx.cheque.findFirst({ where: { id, companyId } });
  if (!cheque) throw new Error('Cheque no encontrado');
  return cheque;
}

/** Deposita un cheque recibido en una cuenta propia (el cobro pasa a esa cuenta para conciliarlo). */
export async function depositCheque(companyId: string, id: string, bankAccountId: string, date: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cheque = await lockCheque(tx, companyId, id);
    if (cheque.direction !== 'RECEIVED' || cheque.status !== 'PORTFOLIO') throw new Error('Solo se deposita un cheque recibido que está en cartera');
    const account = await tx.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: { id: true } });
    if (!account) throw new Error('Cuenta bancaria no encontrada');
    await tx.cheque.updateMany({ where: { id, companyId }, data: { status: 'DEPOSITED', bankAccountId, depositedAt: dateOnly(date) } });
    if (cheque.paymentId) await tx.payment.updateMany({ where: { id: cheque.paymentId, companyId }, data: { bankAccountId } });
  }, LOCKING_TX_OPTIONS);
}

/** El banco hizo efectivo el cheque (recibido depositado, o girado cobrado por el proveedor). */
export async function clearCheque(companyId: string, id: string, date: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cheque = await lockCheque(tx, companyId, id);
    const allowed = cheque.direction === 'RECEIVED' ? cheque.status === 'DEPOSITED' || cheque.status === 'PORTFOLIO' : cheque.status === 'PORTFOLIO';
    if (!allowed) throw new Error('Este cheque ya no está pendiente de cobro');
    await tx.cheque.updateMany({ where: { id, companyId }, data: { status: 'CLEARED', clearedAt: dateOnly(date) } });
  }, LOCKING_TX_OPTIONS);
}

/**
 * Protesto de un cheque recibido: el cobro se reversa (asiento incluido) y el
 * documento vuelve a quedar con saldo por cobrar.
 */
export async function bounceCheque(companyId: string, userId: string, id: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cheque = await lockCheque(tx, companyId, id);
    if (cheque.direction !== 'RECEIVED') throw new Error('Solo un cheque recibido puede protestarse');
    if (cheque.status === 'BOUNCED' || cheque.status === 'VOIDED') throw new Error('Este cheque ya fue protestado o anulado');
    if (cheque.paymentId) await reversePayment(tx, companyId, cheque.paymentId, `Cheque N° ${cheque.number} protestado: ${reason}`, userId);
    await tx.cheque.updateMany({ where: { id, companyId }, data: { status: 'BOUNCED', bouncedAt: new Date(), bounceReason: reason } });
  }, LOCKING_TX_OPTIONS);
}

/** Anula un cheque aún no cobrado (girado por error, devuelto al cliente): reversa su pago. */
export async function voidCheque(companyId: string, userId: string, id: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cheque = await lockCheque(tx, companyId, id);
    if (cheque.status !== 'PORTFOLIO') throw new Error('Solo se anula un cheque que aún no se deposita ni se cobra');
    if (cheque.paymentId) await reversePayment(tx, companyId, cheque.paymentId, `Cheque N° ${cheque.number} anulado: ${reason}`, userId);
    await tx.cheque.updateMany({ where: { id, companyId }, data: { status: 'VOIDED', notes: [cheque.notes, `Anulado: ${reason}`].filter(Boolean).join(' · ') } });
  }, LOCKING_TX_OPTIONS);
}
