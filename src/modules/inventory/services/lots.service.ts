import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { daysToExpiry, expiryStatus, type ExpiryStatus } from '@/lib/inventory/lots';
import { startOfTodaySantiago } from '@/lib/chile/timezone';

export interface LotRow {
  id: string;
  lotNumber: string;
  expiryDate: Date | null;
  quantity: number;
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  warehouseName: string;
  status: ExpiryStatus;
  daysToExpiry: number | null;
  /** Valor al PMP (0 si quien mira no ve costos). */
  value: number;
}

export type LotFilter = 'all' | 'expired' | 'soon' | 'ok';

/** Días de anticipación con que un lote cuenta como "por vencer". */
export const EXPIRY_SOON_DAYS = 30;

export async function listLots(
  companyId: string,
  options: { now: Date; filter?: LotFilter; warehouseId?: string; query?: string }
): Promise<LotRow[]> {
  // Un lote vale hasta el fin de su día de vencimiento: se compara contra la
  // medianoche de hoy en Santiago, no contra la hora exacta.
  const today = startOfTodaySantiago(options.now);
  const where: Prisma.InventoryLotWhereInput = { companyId, quantity: { gt: 0 } };
  if (options.warehouseId) where.warehouseId = options.warehouseId;
  const soonLimit = new Date(today.getTime() + (EXPIRY_SOON_DAYS + 1) * 86_400_000);
  if (options.filter === 'expired') where.expiryDate = { lt: today };
  else if (options.filter === 'soon') where.expiryDate = { gte: today, lt: soonLimit };
  else if (options.filter === 'ok') where.OR = [{ expiryDate: { gte: soonLimit } }, { expiryDate: null }];
  const query = options.query?.trim();
  if (query) {
    where.AND = [
      {
        OR: [
          { lotNumber: { contains: query, mode: 'insensitive' } },
          { product: { name: { contains: query, mode: 'insensitive' } } },
          { product: { sku: { contains: query, mode: 'insensitive' } } },
        ],
      },
    ];
  }

  const lots = await prisma.inventoryLot.findMany({
    where,
    include: {
      product: { select: { sku: true, name: true, unit: true, costPricePMP: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 1000,
  });

  return lots.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    expiryDate: lot.expiryDate,
    quantity: lot.quantity,
    productId: lot.productId,
    sku: lot.product.sku,
    productName: lot.product.name,
    unit: lot.product.unit,
    warehouseName: lot.warehouse.name,
    status: expiryStatus(lot.expiryDate, today, EXPIRY_SOON_DAYS),
    daysToExpiry: lot.expiryDate ? daysToExpiry(lot.expiryDate, today) : null,
    value: Math.round(lot.quantity * lot.product.costPricePMP),
  }));
}

export interface ExpirySummary {
  expiredLots: number;
  soonLots: number;
  expiredValue: number;
  soonValue: number;
}

/** Resumen para alertas: lotes con saldo ya vencidos y por vencer. */
export async function getExpirySummary(companyId: string, now: Date): Promise<ExpirySummary> {
  const today = startOfTodaySantiago(now);
  const soonLimit = new Date(today.getTime() + (EXPIRY_SOON_DAYS + 1) * 86_400_000);
  const lots = await prisma.inventoryLot.findMany({
    where: { companyId, quantity: { gt: 0 }, expiryDate: { lt: soonLimit } },
    select: { expiryDate: true, quantity: true, product: { select: { costPricePMP: true } } },
    take: 5000,
  });
  const summary: ExpirySummary = { expiredLots: 0, soonLots: 0, expiredValue: 0, soonValue: 0 };
  for (const lot of lots) {
    const value = Math.round(lot.quantity * lot.product.costPricePMP);
    if (lot.expiryDate && lot.expiryDate < today) {
      summary.expiredLots += 1;
      summary.expiredValue += value;
    } else {
      summary.soonLots += 1;
      summary.soonValue += value;
    }
  }
  return summary;
}

/** Hitos en que se avisa de un lote: a 30 y 7 días, el día que vence y el día siguiente. */
export const LOT_EXPIRY_MILESTONES: readonly number[] = [30, 7, 0, -1];

export interface LotExpiryMilestone {
  sku: string;
  productName: string;
  lotNumber: string;
  warehouseName: string;
  quantity: number;
  daysToExpiry: number;
}

/**
 * Lotes con saldo que HOY cumplen un hito de vencimiento. La alerta diaria
 * los emite como `LOT_EXPIRING`: así una regla de automatización avisa tres o
 * cuatro veces por lote, no todos los días del último mes.
 */
export async function findLotExpiryMilestones(companyId: string, now: Date): Promise<LotExpiryMilestone[]> {
  const today = startOfTodaySantiago(now);
  const from = new Date(today.getTime() - 2 * 86_400_000);
  const to = new Date(today.getTime() + 32 * 86_400_000);
  const lots = await prisma.inventoryLot.findMany({
    where: { companyId, quantity: { gt: 0 }, expiryDate: { gte: from, lt: to } },
    select: {
      lotNumber: true,
      expiryDate: true,
      quantity: true,
      product: { select: { sku: true, name: true } },
      warehouse: { select: { name: true } },
    },
    take: 2000,
  });
  return lots.flatMap((lot) => {
    if (!lot.expiryDate) return [];
    const days = daysToExpiry(lot.expiryDate, today);
    if (!LOT_EXPIRY_MILESTONES.includes(days)) return [];
    return [{ sku: lot.product.sku, productName: lot.product.name, lotNumber: lot.lotNumber, warehouseName: lot.warehouse.name, quantity: lot.quantity, daysToExpiry: days }];
  });
}
