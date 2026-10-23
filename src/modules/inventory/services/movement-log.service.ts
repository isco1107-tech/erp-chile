import { Prisma, type MovementType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { santiagoMidnightUtc } from '@/lib/chile/timezone';
import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';

/**
 * Registro de movimientos de inventario POR BODEGA: qué entró y salió, quién lo hizo, por qué y con
 * qué foto de respaldo. Cada bodega se consulta por separado (nunca mezcladas) y todo filtra por
 * `companyId`.
 */

/** Tipos de movimiento que se pueden filtrar. */
export const LOG_KINDS = ['ALL', 'ARRIVALS', 'ADJUST_IN', 'OUTFLOWS', 'SALES', 'TRANSFERS'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABELS: Record<LogKind, string> = {
  ALL: 'Todos los movimientos',
  ARRIVALS: 'Llegadas de mercadería',
  ADJUST_IN: 'Ajustes de entrada (sobrantes, devoluciones)',
  OUTFLOWS: 'Salidas y mermas',
  SALES: 'Ventas',
  TRANSFERS: 'Traslados',
};

const KIND_TYPES: Record<Exclude<LogKind, 'ALL'>, MovementType[]> = {
  ARRIVALS: ['PURCHASE_IN'],
  ADJUST_IN: ['ADJUSTMENT_IN'],
  OUTFLOWS: ['ADJUSTMENT_OUT'],
  SALES: ['SALE_OUT'],
  TRANSFERS: ['TRANSFER'],
};

export interface MovementLogFilter {
  /** Obligatoria: el registro es de UNA bodega. */
  warehouseId: string;
  kind?: LogKind;
  /** Código de motivo (`WASTE_REASONS`) o `NONE` para los que no tienen. */
  reason?: string;
  userId?: string;
  supplierId?: string;
  /** Producto: nombre, SKU o marca. */
  q?: string;
  /** Fechas `YYYY-MM-DD` en hora de Chile, ambas inclusive. */
  from?: string;
  to?: string;
  cursor?: string;
  take?: number;
}

export interface MovementLogRow {
  id: string;
  createdAt: Date;
  type: MovementType;
  /** Entró (+) o salió (−) de ESTA bodega. */
  direction: 'in' | 'out';
  quantity: number;
  unit: string;
  sku: string;
  productName: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  note: string | null;
  reference: string | null;
  operator: string | null;
  supplier: string | null;
  evidenceUrl: string | null;
  stockAfter: number;
  /** Costo total del movimiento (solo se entrega a quien puede ver costos). */
  totalCost: number | null;
}

function parseDay(value: string | undefined): { year: number; month: number; day: number } | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function dateRange(from: string | undefined, to: string | undefined): Prisma.DateTimeFilter | undefined {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start && !end) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (start) range.gte = santiagoMidnightUtc(start.year, start.month, start.day);
  // "hasta" es inclusivo: llega hasta el inicio del día siguiente.
  if (end) range.lt = santiagoMidnightUtc(end.year, end.month, end.day + 1);
  return range;
}

function whereFor(companyId: string, filter: MovementLogFilter): Prisma.InventoryMovementWhereInput {
  const where: Prisma.InventoryMovementWhereInput = { companyId, warehouseId: filter.warehouseId };
  if (filter.kind && filter.kind !== 'ALL') where.type = { in: KIND_TYPES[filter.kind] };
  if (filter.reason === 'NONE') where.reasonCode = null;
  else if (filter.reason) where.reasonCode = filter.reason;
  if (filter.userId) where.userId = filter.userId;
  if (filter.supplierId) where.supplierId = filter.supplierId;
  const createdAt = dateRange(filter.from, filter.to);
  if (createdAt) where.createdAt = createdAt;
  const text = filter.q?.trim();
  if (text) {
    where.product = { OR: [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { brand: { contains: text, mode: 'insensitive' } }] };
  }
  return where;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export async function listMovementLog(companyId: string, filter: MovementLogFilter, options: { includeCosts?: boolean } = {}): Promise<{ rows: MovementLogRow[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(filter.take ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const found = await prisma.inventoryMovement.findMany({
    where: whereFor(companyId, filter),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      type: true,
      quantity: true,
      previousStock: true,
      newStock: true,
      totalCost: true,
      reasonCode: true,
      notes: true,
      reference: true,
      evidenceUrl: true,
      product: { select: { sku: true, name: true, unit: true } },
      user: { select: { name: true } },
      supplier: { select: { razonSocial: true, nombreFantasia: true } },
    },
  });
  const page = found.slice(0, take);
  return {
    rows: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      direction: row.newStock >= row.previousStock ? 'in' : 'out',
      quantity: row.quantity,
      unit: row.product.unit,
      sku: row.product.sku,
      productName: row.product.name,
      reasonCode: row.reasonCode,
      reasonLabel: wasteReasonLabel(row.reasonCode),
      note: row.notes,
      reference: row.reference,
      operator: row.user?.name ?? null,
      supplier: row.supplier ? row.supplier.nombreFantasia?.trim() || row.supplier.razonSocial : null,
      evidenceUrl: row.evidenceUrl,
      stockAfter: row.newStock,
      totalCost: options.includeCosts ? row.totalCost : null,
    })),
    nextCursor: found.length > take ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export interface OutflowSummaryRow {
  reasonCode: string | null;
  reasonLabel: string;
  movements: number;
  units: number;
  totalCost: number | null;
}

/** Salidas y mermas del período, por motivo: cuánto se pierde y por qué (de ESTA bodega). */
export async function summarizeOutflows(companyId: string, filter: MovementLogFilter, options: { includeCosts?: boolean } = {}): Promise<OutflowSummaryRow[]> {
  const where = whereFor(companyId, { ...filter, kind: 'OUTFLOWS', reason: undefined, userId: filter.userId, q: filter.q });
  const groups = await prisma.inventoryMovement.groupBy({ by: ['reasonCode'], where, _sum: { quantity: true, totalCost: true }, _count: { _all: true } });
  return groups
    .map((group) => ({
      reasonCode: group.reasonCode,
      reasonLabel: wasteReasonLabel(group.reasonCode) ?? (group.reasonCode ? group.reasonCode : 'Sin motivo (faltantes y ajustes antiguos)'),
      movements: group._count._all,
      units: Math.round((group._sum.quantity ?? 0) * 1000) / 1000,
      totalCost: options.includeCosts ? (group._sum.totalCost ?? 0) : null,
    }))
    .sort((a, b) => b.units - a.units);
}

export interface MovementLogFacets {
  operators: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}

/** Quiénes han hecho movimientos en esta bodega y de qué proveedores llegó mercadería (para los filtros). */
export async function movementLogFacets(companyId: string, warehouseId: string): Promise<MovementLogFacets> {
  const [users, suppliers] = await Promise.all([
    prisma.inventoryMovement.groupBy({ by: ['userId'], where: { companyId, warehouseId, userId: { not: null } } }),
    prisma.inventoryMovement.groupBy({ by: ['supplierId'], where: { companyId, warehouseId, supplierId: { not: null } } }),
  ]);
  const userIds = users.map((row) => row.userId).filter((id): id is string => Boolean(id));
  const supplierIds = suppliers.map((row) => row.supplierId).filter((id): id is string => Boolean(id));
  const [userRows, supplierRows] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds }, companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
    supplierIds.length ? prisma.contact.findMany({ where: { id: { in: supplierIds }, companyId }, select: { id: true, razonSocial: true, nombreFantasia: true }, orderBy: { razonSocial: 'asc' } }) : [],
  ]);
  return {
    operators: userRows,
    suppliers: supplierRows.map((row) => ({ id: row.id, name: row.nombreFantasia?.trim() || row.razonSocial })),
  };
}

/** Bodega de la empresa por id (null si no es suya). */
export async function getWarehouseOf(companyId: string, warehouseId: string): Promise<{ id: string; name: string } | null> {
  return prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true, name: true } });
}

export async function listWarehousesForLog(companyId: string): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
  return prisma.warehouse.findMany({ where: { companyId }, select: { id: true, name: true, isDefault: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
}
