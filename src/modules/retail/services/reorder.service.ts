import 'server-only';

import { prisma } from '@/lib/prisma';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';
import { lastDays } from '@/lib/retail/heatmap';
import { dailySeries, roundQty } from '@/lib/retail/live-metrics';
import {
  HISTORY_DAYS,
  demandPattern,
  describePattern,
  medianLeadDays,
  planReorder,
  type ReorderStatus,
} from '@/lib/retail/reorder';
import { dailyKardex } from './live-metrics.service';
import { getRetailSettings } from './retail-settings.service';

/**
 * Reposición predictiva de UNA bodega: para cada producto, cuándo se agota y
 * cuánto pedir (ver `src/lib/retail/reorder.ts`). Solo lectura: arma la lista;
 * la solicitud de compra la crea la acción de Compras, con su permiso.
 */

export type LeadSource = 'CONFIGURED' | 'MEASURED' | 'DEFAULT';

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  CONFIGURED: 'configurado',
  MEASURED: 'medido en sus órdenes',
  DEFAULT: 'por defecto',
};

export interface ReorderRow {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  supplier: { id: string; name: string } | null;
  stock: number;
  /** Pendiente de recibir en órdenes de compra enviadas (solo se cuenta en la bodega principal). */
  incoming: number;
  dailyRate: number | null;
  rateDays: number;
  pattern: string | null;
  leadDays: number;
  leadSource: LeadSource;
  stockoutDay: string | null;
  daysToStockout: number | null;
  orderBy: string | null;
  suggestedQty: number;
  status: ReorderStatus;
}

export interface ReorderResult {
  generatedAt: string;
  today: string;
  coverDays: number;
  defaultLeadDays: number;
  countsIncoming: boolean;
  rows: ReorderRow[];
  counts: Record<ReorderStatus, number>;
}

/** Recepciones de los últimos 180 días para medir cuánto tarda cada proveedor. */
const LEAD_LOOKBACK_DAYS = 180;
const STATUS_ORDER: Record<ReorderStatus, number> = { NOW: 0, SOON: 1, OK: 2, NO_RATE: 3 };

async function measuredLeadDays(companyId: string, now: Date): Promise<Map<string, number>> {
  const receipts = await prisma.goodsReceipt.findMany({
    where: { companyId, status: 'CONFIRMED', receivedAt: { gte: new Date(now.getTime() - LEAD_LOOKBACK_DAYS * 86_400_000) }, order: { companyId, status: { not: 'CANCELLED' } } },
    select: { receivedAt: true, order: { select: { contactId: true, issueDate: true } } },
  });
  const samples = new Map<string, number[]>();
  for (const receipt of receipts) {
    const days = Math.floor((receipt.receivedAt.getTime() - receipt.order.issueDate.getTime()) / 86_400_000);
    if (days < 0) continue;
    const list = samples.get(receipt.order.contactId) ?? [];
    list.push(days);
    samples.set(receipt.order.contactId, list);
  }
  const result = new Map<string, number>();
  for (const [contactId, list] of samples) {
    const median = medianLeadDays(list);
    if (median !== null) result.set(contactId, median);
  }
  return result;
}

async function incomingByProduct(companyId: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const items = await prisma.purchaseOrderItem.findMany({
    where: { companyId, productId: { in: productIds }, order: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } } },
    select: { productId: true, quantity: true, receivedQuantity: true },
  });
  const result = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    result.set(item.productId, (result.get(item.productId) ?? 0) + Math.max(0, item.quantity - item.receivedQuantity));
  }
  return result;
}

export async function getReorderPlan(
  companyId: string,
  filter: { warehouseId: string; isDefaultWarehouse: boolean; categoryId?: string; supplierId?: string },
  now: Date = new Date()
): Promise<ReorderResult> {
  const keys = lastDays(santiagoDateParts(now), HISTORY_DAYS + 1);
  const today = keys[keys.length - 1]!;
  const [year, month, day] = keys[0]!.split('-').map(Number) as [number, number, number];
  const since = santiagoMidnightUtc(year, month, day);

  const [settings, stocks, kardex, measured] = await Promise.all([
    getRetailSettings(companyId),
    prisma.stock.findMany({
      where: {
        companyId,
        warehouseId: filter.warehouseId,
        product: {
          companyId,
          isTrackable: true,
          isActive: true,
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...(filter.supplierId ? { suppliers: { some: { supplierId: filter.supplierId, companyId } } } : {}),
        },
      },
      select: {
        productId: true,
        quantity: true,
        product: {
          select: {
            name: true,
            sku: true,
            unit: true,
            suppliers: { where: { companyId }, select: { lastReceivedAt: true, supplier: { select: { id: true, razonSocial: true } } } },
          },
        },
      },
    }),
    dailyKardex(companyId, filter.warehouseId, since),
    measuredLeadDays(companyId, now),
  ]);
  // Las órdenes de compra no dicen a qué bodega llegan: lo pendiente se descuenta en la principal.
  const incoming = filter.isDefaultWarehouse ? await incomingByProduct(companyId, stocks.map((stock) => stock.productId)) : new Map<string, number>();

  const rows: ReorderRow[] = [];
  for (const stock of stocks) {
    const days = kardex.get(stock.productId) ?? [];
    if (days.length === 0 && Math.abs(stock.quantity) < 1e-9) continue;
    const series = dailySeries(stock.quantity, days, keys);
    const pattern = demandPattern(series.slice(0, -1));

    // El proveedor del filtro, el único o el que entregó por última vez.
    const links = stock.product.suppliers;
    const chosen = filter.supplierId
      ? links.find((link) => link.supplier.id === filter.supplierId)
      : [...links].sort((a, b) => (b.lastReceivedAt?.getTime() ?? 0) - (a.lastReceivedAt?.getTime() ?? 0))[0];
    const supplier = chosen ? { id: chosen.supplier.id, name: chosen.supplier.razonSocial } : null;
    const configured = supplier ? settings.supplierLeadDays[supplier.id] : undefined;
    const measuredDays = supplier ? measured.get(supplier.id) : undefined;
    const [leadDays, leadSource]: [number, LeadSource] =
      configured !== undefined ? [configured, 'CONFIGURED'] : measuredDays !== undefined ? [measuredDays, 'MEASURED'] : [settings.reorderLeadDays, 'DEFAULT'];

    const pending = incoming.get(stock.productId) ?? 0;
    const plan = planReorder({ pattern, stock: stock.quantity, incoming: pending, today, leadDays, coverDays: settings.reorderCoverDays });
    rows.push({
      productId: stock.productId,
      name: stock.product.name,
      sku: stock.product.sku,
      unit: stock.product.unit,
      supplier,
      stock: roundQty(stock.quantity),
      incoming: roundQty(pending),
      dailyRate: pattern.base,
      rateDays: pattern.baseDays,
      pattern: describePattern(pattern),
      leadDays,
      leadSource,
      stockoutDay: plan.stockoutDay,
      daysToStockout: plan.daysToStockout,
      orderBy: plan.orderBy,
      suggestedQty: plan.suggestedQty,
      status: plan.status,
    });
  }

  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.daysToStockout ?? Infinity) - (b.daysToStockout ?? Infinity) || a.name.localeCompare(b.name, 'es'));
  const counts: Record<ReorderStatus, number> = { NOW: 0, SOON: 0, OK: 0, NO_RATE: 0 };
  for (const row of rows) counts[row.status] += 1;
  return {
    generatedAt: now.toISOString(),
    today,
    coverDays: settings.reorderCoverDays,
    defaultLeadDays: settings.reorderLeadDays,
    countsIncoming: filter.isDefaultWarehouse,
    rows,
    counts,
  };
}
