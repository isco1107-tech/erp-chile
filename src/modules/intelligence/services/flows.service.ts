import 'server-only';

import type { DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { leadToDeal, orderToCash, procureToPay, type BusinessFlow } from '@/lib/intelligence/process-flows';

/**
 * Datos de los flujos de punta a punta (últimos 180 días). Cada flujo se
 * arma solo con lo que la empresa usa: sin órdenes de compra, el flujo de
 * compras parte en la factura; sin CRM, no hay embudo comercial.
 */

const WINDOW_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVOICE_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56'];

export interface FlowsData {
  windowDays: number;
  flows: BusinessFlow[];
}

/** Fecha del último abono por documento: es la fecha en que quedó saldado. */
function lastPaymentByDocument(rows: Array<{ documentId: string | null; paymentDate: Date }>): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const row of rows) {
    if (!row.documentId) continue;
    const current = map.get(row.documentId);
    if (!current || row.paymentDate > current) map.set(row.documentId, row.paymentDate);
  }
  return map;
}

export async function getBusinessFlows(companyId: string, options: { hasSalesPipeline: boolean }): Promise<FlowsData> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

  const [quotes, invoices, orders, purchaseInvoices] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, dteType: 'COTIZACION', status: { not: 'CANCELLED' }, issueDate: { gte: since } },
      select: { issueDate: true, totalAmount: true },
    }),
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', dteType: { in: INVOICE_TYPES }, issueDate: { gte: since } },
      select: { id: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, paymentStatus: true, paymentMethod: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId, issueDate: { gte: since }, status: { not: 'DRAFT' } },
      select: {
        issueDate: true,
        status: true,
        items: { select: { quantity: true, unitCost: true } },
        goodsReceipts: { select: { receivedAt: true }, orderBy: { receivedAt: 'asc' }, take: 1 },
      },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', issueDate: { gte: since } },
      select: { id: true, issueDate: true, totalAmount: true, paidAmount: true, paymentStatus: true, purchaseOrderId: true, matchStatus: true, approvalStatus: true },
    }),
  ]);

  const [salesPayments, purchasePayments] = await Promise.all([
    invoices.length
      ? prisma.payment.findMany({
          where: { companyId, type: 'INCOME', salesDocumentId: { in: invoices.map((i) => i.id) } },
          select: { salesDocumentId: true, paymentDate: true },
        })
      : Promise.resolve([]),
    purchaseInvoices.length
      ? prisma.payment.findMany({
          where: { companyId, type: 'EXPENSE', purchaseDocumentId: { in: purchaseInvoices.map((i) => i.id) } },
          select: { purchaseDocumentId: true, paymentDate: true },
        })
      : Promise.resolve([]),
  ]);
  const salesPaidAt = lastPaymentByDocument(salesPayments.map((p) => ({ documentId: p.salesDocumentId, paymentDate: p.paymentDate })));
  const purchasePaidAt = lastPaymentByDocument(purchasePayments.map((p) => ({ documentId: p.purchaseDocumentId, paymentDate: p.paymentDate })));

  const flows: BusinessFlow[] = [];

  if (invoices.length > 0 || quotes.length > 0) {
    flows.push(
      orderToCash({
        quotes,
        invoices: invoices.map((inv) => ({
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          // Un documento saldado sin ningún `Payment` (datos anteriores al
          // registro de cobros) se considera cobrado al emitirse: contado.
          fullyPaidAt: inv.paymentStatus === 'PAID' ? (salesPaidAt.get(inv.id) ?? inv.issueDate) : null,
          onCredit: inv.paymentMethod === 'CREDITO_30',
        })),
      })
    );
  }

  if (orders.length > 0 || purchaseInvoices.length > 0) {
    flows.push(
      procureToPay({
        orders: orders.map((order) => ({
          issueDate: order.issueDate,
          totalAmount: order.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCost), 0),
          firstReceiptAt: order.goodsReceipts[0]?.receivedAt ?? null,
          cancelled: order.status === 'CANCELLED',
        })),
        invoices: purchaseInvoices.map((inv) => ({
          issueDate: inv.issueDate,
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          fullyPaidAt: inv.paymentStatus === 'PAID' ? (purchasePaidAt.get(inv.id) ?? inv.issueDate) : null,
          fromOrder: inv.purchaseOrderId !== null,
          mismatched: inv.matchStatus === 'MISMATCHED',
          pendingApproval: inv.approvalStatus === 'PENDING',
        })),
      })
    );
  }

  if (options.hasSalesPipeline) {
    const opportunities = await prisma.opportunity.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: { stage: true, amount: true, createdAt: true, closedAt: true },
    });
    if (opportunities.length > 0) flows.push(leadToDeal({ opportunities }));
  }

  return { windowDays: WINDOW_DAYS, flows };
}
