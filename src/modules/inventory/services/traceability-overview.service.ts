import { prisma } from '@/lib/prisma';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { NO_LOT } from '@/lib/inventory/lots';
import { serialCoverage } from '@/lib/inventory/traceability';
import { buildAttention, linkRate, type AttentionItem, type OverviewFacts } from '@/lib/inventory/traceability-overview';
import { EXPIRY_SOON_DAYS } from './lots.service';

/**
 * Panel de trazabilidad de TODA la empresa: cuánto del inventario se puede
 * seguir (lotes, series, documentos enlazados) y qué hay que atender. Cada
 * consulta filtra por `companyId`; lo que no tiene datos no se muestra.
 */

const DAY_MS = 86_400_000;
const MAX_SERIAL_GROUPS = 2000;

export interface UnlotProduct {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface OverdueOrder {
  folio: number;
  supplier: string;
  expectedDate: Date;
  daysLate: number;
}

export interface TraceabilityOverview {
  generatedAt: Date;
  products: { tracked: number; withLots: number; withSerials: number };
  lots: { expired: number; expiredUnits: number; soon: number; soonUnits: number; expiryDays: number };
  unlot: { products: number; units: number; top: UnlotProduct[] };
  serials: { inStock: number; sold: number; lost: number; returned: number; mismatches: number };
  orders: { inTransit: number; overdue: OverdueOrder[]; overdueCount: number };
  linkage: { total: number; linked: number; ratePercent: number | null };
  attention: AttentionItem[];
}

export async function getTraceabilityOverview(companyId: string, now: Date = new Date()): Promise<TraceabilityOverview> {
  const today = startOfTodaySantiago(now);
  const soonLimit = new Date(today.getTime() + (EXPIRY_SOON_DAYS + 1) * DAY_MS);
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const linkable = { companyId, createdAt: { gte: since }, type: { in: ['SALE_OUT', 'PURCHASE_IN'] as ('SALE_OUT' | 'PURCHASE_IN')[] } };

  const [tracked, withLots, serialGroups, expiredLots, soonLots, unlotLots, serialByStatus, lostEvents, inTransit, overdue, linkTotal, linkLinked, serialStock] = await Promise.all([
    prisma.product.count({ where: { companyId, isTrackable: true } }),
    prisma.product.count({ where: { companyId, tracksLots: true } }),
    prisma.productSerial.groupBy({ by: ['productId'], where: { companyId } }),
    prisma.inventoryLot.findMany({ where: { companyId, quantity: { gt: 0 }, expiryDate: { lt: today } }, select: { quantity: true } }),
    prisma.inventoryLot.findMany({ where: { companyId, quantity: { gt: 0 }, expiryDate: { gte: today, lt: soonLimit } }, select: { quantity: true } }),
    prisma.inventoryLot.findMany({
      where: { companyId, lotNumber: NO_LOT, quantity: { gt: 0 }, product: { tracksLots: true } },
      select: { productId: true, quantity: true, product: { select: { sku: true, name: true, unit: true } } },
    }),
    prisma.productSerial.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.productSerialEvent.count({ where: { companyId, kind: 'LOST', createdAt: { gte: since } } }),
    prisma.purchaseOrder.count({ where: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } } }),
    prisma.purchaseOrder.findMany({
      where: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: today } },
      orderBy: { expectedDate: 'asc' },
      take: 10,
      select: { folio: true, expectedDate: true, contact: { select: { razonSocial: true, nombreFantasia: true } } },
    }),
    prisma.inventoryMovement.count({ where: linkable }),
    prisma.inventoryMovement.count({ where: { ...linkable, sourceKind: { not: null } } }),
    prisma.productSerial.groupBy({ by: ['productId', 'warehouseId'], where: { companyId, status: 'IN_STOCK' }, _count: { _all: true }, orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }], take: MAX_SERIAL_GROUPS }),
  ]);

  // Series en bodega contra el stock de esa bodega.
  let mismatches = 0;
  if (serialStock.length > 0) {
    const stocks = await prisma.stock.findMany({
      where: { companyId, productId: { in: [...new Set(serialStock.map((g) => g.productId))] } },
      select: { productId: true, warehouseId: true, quantity: true },
    });
    const stockOf = new Map(stocks.map((s) => [`${s.productId}:${s.warehouseId}`, s.quantity]));
    for (const group of serialStock) {
      const state = serialCoverage(stockOf.get(`${group.productId}:${group.warehouseId}`) ?? 0, group._count._all).state;
      if (state === 'OVER') mismatches += 1;
    }
  }

  const unlotByProduct = new Map<string, UnlotProduct>();
  for (const lot of unlotLots) {
    const entry = unlotByProduct.get(lot.productId) ?? { productId: lot.productId, sku: lot.product.sku, name: lot.product.name, unit: lot.product.unit, quantity: 0 };
    entry.quantity += lot.quantity;
    unlotByProduct.set(lot.productId, entry);
  }
  const unlotProducts = [...unlotByProduct.values()].sort((a, b) => b.quantity - a.quantity);

  const [serialSalesAgg, assignedSerials] = await Promise.all([
    prisma.salesDocumentItem.aggregate({
      _sum: { quantity: true },
      where: {
        companyId,
        product: { tracksSerials: true },
        document: { companyId, status: 'ISSUED', issueDate: { gte: since }, dteType: { notIn: ['NOTA_CREDITO_61', 'NOTA_DEBITO_56', 'COTIZACION'] } },
      },
    }),
    prisma.productSerial.count({ where: { companyId, salesDocumentId: { not: null }, soldAt: { gte: since } } }),
  ]);
  const unassignedSerialSales = Math.max(0, Math.round(serialSalesAgg._sum.quantity ?? 0) - assignedSerials);
  const countOf = (status: string) => serialByStatus.find((g) => g.status === status)?._count._all ?? 0;
  const overdueCount = await prisma.purchaseOrder.count({ where: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: today } } });
  const sum = (rows: Array<{ quantity: number }>) => rows.reduce((total, row) => total + row.quantity, 0);

  const facts: OverviewFacts = {
    expiredLots: expiredLots.length,
    expiredUnits: sum(expiredLots),
    soonLots: soonLots.length,
    unlotProducts: unlotProducts.length,
    unlotUnits: sum(unlotProducts),
    serialMismatches: mismatches,
    overdueOrders: overdueCount,
    lostSerials30d: lostEvents,
    unassignedSerialSales,
    linkableMovements30d: linkTotal,
    linkedMovements30d: linkLinked,
    expiryDays: EXPIRY_SOON_DAYS,
  };

  return {
    generatedAt: now,
    products: { tracked, withLots, withSerials: serialGroups.length },
    lots: { expired: expiredLots.length, expiredUnits: sum(expiredLots), soon: soonLots.length, soonUnits: sum(soonLots), expiryDays: EXPIRY_SOON_DAYS },
    unlot: { products: unlotProducts.length, units: facts.unlotUnits, top: unlotProducts.slice(0, 8) },
    serials: { inStock: countOf('IN_STOCK'), sold: countOf('SOLD'), lost: countOf('LOST'), returned: countOf('RETURNED'), mismatches },
    orders: {
      inTransit,
      overdueCount,
      overdue: overdue
        .filter((o): o is typeof o & { expectedDate: Date } => o.expectedDate !== null)
        .map((o) => ({
          folio: o.folio,
          supplier: o.contact.nombreFantasia?.trim() || o.contact.razonSocial,
          expectedDate: o.expectedDate,
          daysLate: Math.max(1, Math.floor((today.getTime() - o.expectedDate.getTime()) / DAY_MS)),
        })),
    },
    linkage: { total: linkTotal, linked: linkLinked, ratePercent: linkRate(linkLinked, linkTotal) },
    attention: buildAttention(facts),
  };
}
