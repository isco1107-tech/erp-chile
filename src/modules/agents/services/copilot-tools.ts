import 'server-only';

import type { DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { signForSalesDteType, signForPurchaseDocumentType, TAXABLE_SALES_DTE_TYPES, TAXABLE_PURCHASE_DOCUMENT_TYPES } from '@/lib/chile/document-sign';
import { getCxCSummary, getCxPSummary } from '@/modules/treasury/services/treasury.service';

/**
 * Consultas de datos del Asistente (ver `assistant-data-tools.ts`, que decide
 * cuáles se ofrecen según permisos y módulos) — cada una de solo lectura, cerrada
 * sobre el `companyId` de la sesión (nunca aceptado como argumento del
 * modelo, para que no pueda "preguntar" por otra empresa). Reutilizan las
 * mismas fórmulas que ya usa el resto del sistema (`document-sign.ts`,
 * `treasury.service.ts`) en vez de recalcular con lógica propia — mismo
 * criterio que ya documenta `business-metrics.service.ts` para el snapshot
 * del agente CFO.
 *
 * Deliberadamente NO se llama `calculateAndStoreF29`: persiste un `TaxPeriod`
 * real, y una pregunta informativa del Copilot no debe tener ese efecto
 * secundario tributario.
 */

const SALES_TYPES: DteType[] = TAXABLE_SALES_DTE_TYPES;

export interface SalesMarginSummary {
  from: string;
  to: string;
  netSales: number;
  exemptSales: number;
  marginAmount: number;
  marginPercent: number;
  documentCount: number;
}

export async function getSalesMarginSummary(companyId: string, args: { from: string; to: string }): Promise<SalesMarginSummary> {
  const from = new Date(args.from);
  const to = new Date(args.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Rango de fechas inválido');

  const documents = await prisma.salesDocument.findMany({
    where: { companyId, status: 'ISSUED', dteType: { in: SALES_TYPES }, issueDate: { gte: from, lte: to } },
    include: { items: true },
  });

  let netSales = 0;
  let exemptSales = 0;
  let revenue = 0;
  let cost = 0;
  for (const document of documents) {
    const sign = signForSalesDteType(document.dteType);
    netSales += sign * document.netAmount;
    exemptSales += sign * document.exemptAmount;
    revenue += sign * (document.netAmount + document.exemptAmount);
    cost += sign * document.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
  }
  const marginAmount = revenue - cost;

  return {
    from: args.from,
    to: args.to,
    netSales,
    exemptSales,
    marginAmount,
    marginPercent: revenue === 0 ? 0 : (marginAmount / revenue) * 100,
    documentCount: documents.length,
  };
}

export interface OverdueParty {
  razonSocial: string;
  rut: string;
  balance: number;
  daysOverdue: number;
}

export interface OverdueBalances {
  minDaysOverdue: number;
  customersTotal: number;
  overdueCustomers: OverdueParty[];
  suppliersTotal: number;
  overdueSuppliers: OverdueParty[];
}

/**
 * "Morosos": documentos vencidos hace más de `minDaysOverdue` días, agrupados
 * por contacto. El lado de clientes reutiliza `getCxCSummary` para el total;
 * el lado de proveedores no tenía equivalente (`getCxPSummary` no agrupa por
 * proveedor) — se agrega acá con el mismo patrón `groupBy` que ya usa
 * `treasury.service.ts` para `topDebtors`.
 */
export async function getOverdueBalances(companyId: string, args: { minDaysOverdue?: number }): Promise<OverdueBalances> {
  const minDaysOverdue = args.minDaysOverdue ?? 0;
  const now = new Date();
  const cutoff = new Date(now.getTime() - minDaysOverdue * 24 * 60 * 60 * 1000);

  const [cxc, cxp, overdueSalesGroups, overduePurchaseGroups] = await Promise.all([
    getCxCSummary(companyId),
    getCxPSummary(companyId),
    prisma.salesDocument.groupBy({
      by: ['contactId'],
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { not: 'GUIA_DESPACHO_52' }, dueDate: { lt: cutoff } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.purchaseDocument.groupBy({
      by: ['contactId'],
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dueDate: { lt: cutoff } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
  ]);

  async function toPartyRows(groups: { contactId: string; _sum: { totalAmount: number | null; paidAmount: number | null } }[]): Promise<OverdueParty[]> {
    const contacts = await prisma.contact.findMany({
      where: { companyId, id: { in: groups.map((g) => g.contactId) } },
      select: { id: true, razonSocial: true, rut: true },
    });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return groups
      .map((g) => ({
        razonSocial: byId.get(g.contactId)?.razonSocial ?? '',
        rut: byId.get(g.contactId)?.rut ?? '',
        balance: (g._sum.totalAmount ?? 0) - (g._sum.paidAmount ?? 0),
        daysOverdue: minDaysOverdue,
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);
  }

  const [overdueCustomers, overdueSuppliers] = await Promise.all([
    toPartyRows(overdueSalesGroups),
    toPartyRows(overduePurchaseGroups),
  ]);

  return {
    minDaysOverdue,
    customersTotal: cxc.overdueAmount,
    overdueCustomers,
    suppliersTotal: overdueSuppliers.reduce((sum, s) => sum + s.balance, 0),
    overdueSuppliers,
  };
}

export interface VatProjection {
  year: number;
  month: number;
  debitVat: number;
  creditVat: number;
  netVat: number;
}

export async function getVatProjection(companyId: string, args: { year?: number; month?: number }): Promise<VatProjection> {
  const now = new Date();
  const year = args.year ?? now.getUTCFullYear();
  const month = args.month ?? now.getUTCMonth() + 1;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const [sales, purchases] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', dteType: { in: TAXABLE_SALES_DTE_TYPES }, issueDate: { gte: from, lt: to } },
      select: { dteType: true, ivaAmount: true },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', documentType: { in: TAXABLE_PURCHASE_DOCUMENT_TYPES }, issueDate: { gte: from, lt: to } },
      select: { documentType: true, ivaAmount: true },
    }),
  ]);

  const debitVat = sales.reduce((sum, d) => sum + signForSalesDteType(d.dteType) * d.ivaAmount, 0);
  const creditVat = purchases.reduce((sum, d) => sum + signForPurchaseDocumentType(d.documentType) * d.ivaAmount, 0);

  return { year, month, debitVat, creditVat, netVat: debitVat - creditVat };
}

/** Formatea el resultado de una tool en texto plano en español para pasárselo de vuelta al modelo — nunca se le pide que "recuerde" o invente un número que no esté acá. */
export function formatToolResultForPrompt(toolName: string, result: unknown, options: { includeMargin: boolean } = { includeMargin: true }): string {
  switch (toolName) {
    case 'getSalesMarginSummary': {
      const r = result as SalesMarginSummary;
      const sales = `Ventas netas ${formatCurrency(r.netSales)} + exentas ${formatCurrency(r.exemptSales)} entre ${r.from} y ${r.to} (${r.documentCount} documentos).`;
      // El margen revela el costo PMP: sin `products:costs` no se le entrega al modelo.
      return options.includeMargin ? `${sales} Margen PMP: ${formatCurrency(r.marginAmount)} (${r.marginPercent.toFixed(1)}%).` : sales;
    }
    case 'getOverdueBalances': {
      const r = result as OverdueBalances;
      const customers = r.overdueCustomers.map((c) => `${c.razonSocial} (${formatCurrency(c.balance)})`).join(', ') || 'ninguno';
      const suppliers = r.overdueSuppliers.map((s) => `${s.razonSocial} (${formatCurrency(s.balance)})`).join(', ') || 'ninguno';
      return `Vencidos hace más de ${r.minDaysOverdue} días. Clientes morosos: ${customers} (total CxC vencida: ${formatCurrency(r.customersTotal)}). Proveedores morosos: ${suppliers} (total: ${formatCurrency(r.suppliersTotal)}).`;
    }
    case 'getVatProjection': {
      const r = result as VatProjection;
      return `IVA del ${r.month}/${r.year}: débito ${formatCurrency(r.debitVat)}, crédito ${formatCurrency(r.creditVat)}, neto ${formatCurrency(r.netVat)} (${r.netVat >= 0 ? 'a pagar' : 'a favor'}).`;
    }
    default:
      return JSON.stringify(result);
  }
}
