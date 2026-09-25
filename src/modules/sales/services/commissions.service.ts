import { prisma } from '@/lib/prisma';
import type { CommissionBasis } from '@prisma/client';
import { addMonthsSantiago, startOfMonthSantiago } from '@/lib/chile/timezone';
import { computeCommissions, type SellerCommission } from '../commissions';

/**
 * Comisiones por vendedor de un mes calendario (hora de Chile): venta neta
 * facturada o cobro neto del mes, según la base configurada para cada uno.
 */

export interface CommissionReportRow extends SellerCommission {
  name: string;
  email: string;
}

export interface CommissionReport {
  from: Date;
  to: Date;
  rows: CommissionReportRow[];
  totalBase: number;
  totalCommission: number;
  /** Ventas del mes sin vendedor asignado (emitidas antes de este módulo). */
  unassignedBase: number;
}

export interface SellerOption {
  id: string;
  name: string;
  email: string;
  rateBps: number | null;
  basis: CommissionBasis | null;
}

export async function listSellers(companyId: string): Promise<SellerOption[]> {
  const [users, rates] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, OR: [{ companyId }, { companyMemberships: { some: { companyId } } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.salesCommissionRate.findMany({ where: { companyId }, select: { userId: true, rateBps: true, basis: true } }),
  ]);
  const rateByUser = new Map(rates.map((rate) => [rate.userId, rate]));
  return users.map((user) => ({ ...user, rateBps: rateByUser.get(user.id)?.rateBps ?? null, basis: rateByUser.get(user.id)?.basis ?? null }));
}

export async function setCommissionRate(companyId: string, userId: string, rateBps: number, basis: CommissionBasis): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, OR: [{ companyId }, { companyMemberships: { some: { companyId } } }] },
    select: { id: true },
  });
  if (!user) throw new Error('El vendedor no pertenece a esta empresa');
  await prisma.salesCommissionRate.upsert({
    where: { companyId_userId: { companyId, userId } },
    update: { rateBps, basis },
    create: { companyId, userId, rateBps, basis },
  });
}

export async function getCommissionReport(companyId: string, year: number, month: number): Promise<CommissionReport> {
  const reference = new Date(Date.UTC(year, month - 1, 15, 12));
  const from = startOfMonthSantiago(reference);
  const to = addMonthsSantiago(reference, 1);

  const [documents, payments, rates, sellers] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', issueDate: { gte: from, lt: to } },
      select: { sellerId: true, dteType: true, netAmount: true, exemptAmount: true, totalAmount: true },
    }),
    // También los egresos ligados a ventas (cheque protestado, devolución de
    // dinero): restan del cobrado, para no comisionar plata que no llegó.
    prisma.payment.findMany({
      where: { companyId, paymentDate: { gte: from, lt: to }, salesDocument: { status: 'ISSUED' } },
      select: { type: true, amount: true, salesDocument: { select: { sellerId: true, netAmount: true, exemptAmount: true, totalAmount: true } } },
    }),
    prisma.salesCommissionRate.findMany({ where: { companyId }, select: { userId: true, rateBps: true, basis: true } }),
    listSellers(companyId),
  ]);

  const rateMap = new Map(rates.map((rate) => [rate.userId, { rateBps: rate.rateBps, basis: rate.basis }]));
  const computed = computeCommissions(
    documents,
    payments
      .filter((payment) => payment.salesDocument)
      .map((payment) => ({
        sellerId: payment.salesDocument!.sellerId,
        amount: payment.type === 'EXPENSE' ? -payment.amount : payment.amount,
        documentNet: payment.salesDocument!.netAmount + payment.salesDocument!.exemptAmount,
        documentTotal: payment.salesDocument!.totalAmount,
      })),
    rateMap
  );

  const byId = new Map(sellers.map((seller) => [seller.id, seller]));
  const rows = computed.map((row) => ({ ...row, name: byId.get(row.sellerId)?.name ?? 'Usuario eliminado', email: byId.get(row.sellerId)?.email ?? '' }));
  const unassignedBase = documents
    .filter((doc) => !doc.sellerId)
    .reduce((sum, doc) => sum + (doc.dteType === 'NOTA_CREDITO_61' ? -1 : ['COTIZACION', 'GUIA_DESPACHO_52'].includes(doc.dteType) ? 0 : 1) * (doc.netAmount + doc.exemptAmount), 0);

  return {
    from,
    to,
    rows,
    totalBase: rows.reduce((sum, row) => sum + row.base, 0),
    totalCommission: rows.reduce((sum, row) => sum + row.commission, 0),
    unassignedBase,
  };
}
