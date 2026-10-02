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

export interface ProductLookupRow {
  sku: string;
  name: string;
  unit: string;
  netPrice: number;
  grossPrice: number;
  isExempt: boolean;
  minStock: number;
  totalStock: number;
  stockByWarehouse: { warehouse: string; quantity: number }[];
  costPMP: number;
}

export interface ProductLookup {
  query: string;
  products: ProductLookupRow[];
  /** Hubo más coincidencias que las devueltas: conviene afinar la búsqueda. */
  truncated: boolean;
}

const PRODUCT_LOOKUP_LIMIT = 8;

/** Productos por SKU, código de barras o nombre, con precio y stock por bodega. */
export async function findProducts(companyId: string, args: { query: string }): Promise<ProductLookup> {
  const query = (args.query ?? '').trim();
  if (!query) throw new Error('Indica el nombre, SKU o código del producto');
  const products = await prisma.product.findMany({
    where: {
      companyId,
      OR: [{ sku: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }, { barcode: query }],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      netPrice: true,
      grossPrice: true,
      isExempt: true,
      minStock: true,
      costPricePMP: true,
      stocks: { where: { companyId }, select: { quantity: true, warehouse: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
    take: PRODUCT_LOOKUP_LIMIT + 1,
  });

  return {
    query,
    truncated: products.length > PRODUCT_LOOKUP_LIMIT,
    products: products.slice(0, PRODUCT_LOOKUP_LIMIT).map((product) => ({
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      netPrice: product.netPrice,
      grossPrice: product.grossPrice,
      isExempt: product.isExempt,
      minStock: product.minStock,
      costPMP: product.costPricePMP,
      totalStock: product.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
      stockByWarehouse: product.stocks.map((stock) => ({ warehouse: stock.warehouse.name, quantity: stock.quantity })),
    })),
  };
}

export interface LowStockProducts {
  products: { sku: string; name: string; unit: string; totalStock: number; minStock: number }[];
  total: number;
}

/** Productos con stock mínimo definido cuyo stock total (todas las bodegas) está en o bajo ese mínimo. */
export async function getLowStockProducts(companyId: string, args: { limit?: number }): Promise<LowStockProducts> {
  const limit = Math.min(Math.max(Math.round(args.limit ?? 15), 1), 50);
  const [products, stockGroups] = await Promise.all([
    prisma.product.findMany({ where: { companyId, minStock: { gt: 0 } }, select: { id: true, sku: true, name: true, unit: true, minStock: true } }),
    prisma.stock.groupBy({ by: ['productId'], where: { companyId }, _sum: { quantity: true } }),
  ]);
  const stockByProduct = new Map(stockGroups.map((group) => [group.productId, group._sum.quantity ?? 0]));
  const low = products
    .map((product) => ({ sku: product.sku, name: product.name, unit: product.unit, minStock: product.minStock, totalStock: stockByProduct.get(product.id) ?? 0 }))
    .filter((product) => product.totalStock <= product.minStock)
    .sort((a, b) => a.totalStock - a.minStock - (b.totalStock - b.minStock));
  return { products: low.slice(0, limit), total: low.length };
}

export interface ContactBalanceRow {
  razonSocial: string;
  rut: string;
  receivable: number;
  receivableOverdue: number;
  receivableDocuments: number;
  payable: number;
  payableOverdue: number;
  payableDocuments: number;
}

/**
 * Saldo pendiente de un cliente o proveedor. Mismo criterio que Tesorería
 * (`getContactOutstandingBalance`): documentos emitidos no pagados, sin
 * contar la guía de despacho que después formaliza una factura.
 */
export async function getContactBalance(companyId: string, args: { query: string }): Promise<{ query: string; contacts: ContactBalanceRow[] }> {
  const query = (args.query ?? '').trim();
  if (!query) throw new Error('Indica el nombre o RUT del cliente o proveedor');
  const contacts = await prisma.contact.findMany({
    where: { companyId, OR: [{ razonSocial: { contains: query, mode: 'insensitive' } }, { rut: { contains: query } }] },
    select: { id: true, razonSocial: true, rut: true },
    take: 5,
  });
  const now = new Date();
  const rows = await Promise.all(
    contacts.map(async (contact) => {
      const salesWhere = { companyId, contactId: contact.id, status: 'ISSUED' as const, paymentStatus: { not: 'PAID' as const }, dteType: { not: 'GUIA_DESPACHO_52' as const } };
      const purchaseWhere = { companyId, contactId: contact.id, status: 'ISSUED' as const, paymentStatus: { not: 'PAID' as const } };
      const [sales, salesOverdue, purchases, purchasesOverdue] = await Promise.all([
        prisma.salesDocument.aggregate({ where: salesWhere, _sum: { totalAmount: true, paidAmount: true }, _count: true }),
        prisma.salesDocument.aggregate({ where: { ...salesWhere, dueDate: { lt: now } }, _sum: { totalAmount: true, paidAmount: true } }),
        prisma.purchaseDocument.aggregate({ where: purchaseWhere, _sum: { totalAmount: true, paidAmount: true }, _count: true }),
        prisma.purchaseDocument.aggregate({ where: { ...purchaseWhere, dueDate: { lt: now } }, _sum: { totalAmount: true, paidAmount: true } }),
      ]);
      const pending = (agg: { _sum: { totalAmount: number | null; paidAmount: number | null } }) => (agg._sum.totalAmount ?? 0) - (agg._sum.paidAmount ?? 0);
      return {
        razonSocial: contact.razonSocial,
        rut: contact.rut,
        receivable: pending(sales),
        receivableOverdue: pending(salesOverdue),
        receivableDocuments: sales._count,
        payable: pending(purchases),
        payableOverdue: pending(purchasesOverdue),
        payableDocuments: purchases._count,
      };
    })
  );
  return { query, contacts: rows };
}

function formatQuantity(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
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
    case 'findProducts': {
      const r = result as ProductLookup;
      if (r.products.length === 0) return `No hay productos que coincidan con "${r.query}".`;
      const lines = r.products.map((p) => {
        const price = p.isExempt ? `${formatCurrency(p.netPrice)} (exento)` : `${formatCurrency(p.netPrice)} neto / ${formatCurrency(p.grossPrice)} con IVA`;
        const byWarehouse = p.stockByWarehouse.length > 1 ? ` [${p.stockByWarehouse.map((w) => `${w.warehouse}: ${formatQuantity(w.quantity)}`).join(', ')}]` : '';
        // El costo PMP revela el margen: sin `products:costs` no se le entrega al modelo.
        const cost = options.includeMargin ? `, costo PMP ${formatCurrency(Math.round(p.costPMP))}` : '';
        const low = p.minStock > 0 && p.totalStock <= p.minStock ? ' (bajo el mínimo)' : '';
        return `- ${p.name} (SKU ${p.sku}): precio ${price}${cost}; stock ${formatQuantity(p.totalStock)} ${p.unit}${low}${byWarehouse}`;
      });
      return `${lines.join('\n')}${r.truncated ? '\nHay más coincidencias: pide un nombre o SKU más preciso.' : ''}`;
    }
    case 'getLowStockProducts': {
      const r = result as LowStockProducts;
      if (r.total === 0) return 'Ningún producto está bajo su stock mínimo.';
      const lines = r.products.map((p) => `- ${p.name} (SKU ${p.sku}): ${formatQuantity(p.totalStock)} ${p.unit}, mínimo ${formatQuantity(p.minStock)}`);
      return `${r.total} producto(s) en o bajo su stock mínimo${r.total > r.products.length ? ` (se muestran ${r.products.length})` : ''}:\n${lines.join('\n')}`;
    }
    case 'getContactBalance': {
      const r = result as { query: string; contacts: ContactBalanceRow[] };
      if (r.contacts.length === 0) return `No hay contactos que coincidan con "${r.query}".`;
      return r.contacts
        .map(
          (c) =>
            `- ${c.razonSocial} (RUT ${c.rut}): te debe ${formatCurrency(c.receivable)} en ${c.receivableDocuments} documento(s), vencido ${formatCurrency(c.receivableOverdue)}; le debes ${formatCurrency(c.payable)} en ${c.payableDocuments} documento(s), vencido ${formatCurrency(c.payableOverdue)}.`
        )
        .join('\n');
    }
    default:
      return JSON.stringify(result);
  }
}
