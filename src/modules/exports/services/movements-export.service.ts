import 'server-only';

import ExcelJS from 'exceljs';
import type { MovementType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { describeRange, type DayRange } from '@/lib/exports/ranges';
import type { MovementsExportFilter } from '@/lib/exports/filters';
import { KIND_TYPES, LOG_KIND_LABELS, MOVEMENT_TYPE_LABELS } from '@/lib/inventory/movement-kinds';
import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { dateRange } from '@/modules/inventory/services/movement-log.service';
import { CLP_FORMAT, DATETIME_FORMAT, QTY_FORMAT, safeCell, santiagoWallClock, styleHeader } from './excel';

/**
 * Movimientos de inventario de TODAS las bodegas de la empresa (o de una), con
 * los mismos filtros en pantalla y en el Excel. El saldo «antes → después» de
 * cada fila es el del producto EN la bodega de esa fila, así que sigue siendo
 * correcto aunque las bodegas aparezcan mezcladas en la lista.
 */

/** Tope de filas por archivo: pasado esto se acota con las fechas. */
export const MAX_MOVEMENT_EXPORT_ROWS = 50_000;
export const MOVEMENTS_PAGE_SIZE = 50;

export function movementsWhere(companyId: string, filter: MovementsExportFilter): Prisma.InventoryMovementWhereInput {
  const where: Prisma.InventoryMovementWhereInput = { companyId };
  if (filter.warehouseId) where.warehouseId = filter.warehouseId;
  if (filter.kind !== 'ALL') where.type = { in: KIND_TYPES[filter.kind] };
  const createdAt = dateRange(filter.from, filter.to);
  if (createdAt) where.createdAt = createdAt;
  const text = filter.q?.trim();
  if (text) {
    where.product = { OR: [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { brand: { contains: text, mode: 'insensitive' } }] };
  }
  return where;
}

const MOVEMENT_SELECT = {
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
  warehouse: { select: { name: true } },
  product: { select: { sku: true, name: true, unit: true } },
  user: { select: { name: true } },
  supplier: { select: { razonSocial: true, nombreFantasia: true } },
} satisfies Prisma.InventoryMovementSelect;

type MovementRecord = Prisma.InventoryMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;

export interface MovementExportRow {
  id: string;
  date: Date;
  type: MovementType;
  typeLabel: string;
  direction: 'in' | 'out';
  warehouse: string;
  sku: string;
  product: string;
  unit: string;
  quantity: number;
  before: number;
  after: number;
  reason: string | null;
  operator: string | null;
  supplier: string | null;
  note: string | null;
  reference: string | null;
  evidenceUrl: string | null;
  /** Solo para quien puede ver costos. */
  totalCost: number | null;
}

function toRow(record: MovementRecord, includeCosts: boolean): MovementExportRow {
  return {
    id: record.id,
    date: record.createdAt,
    type: record.type,
    typeLabel: MOVEMENT_TYPE_LABELS[record.type],
    direction: record.newStock >= record.previousStock ? 'in' : 'out',
    warehouse: record.warehouse.name,
    sku: record.product.sku,
    product: record.product.name,
    unit: record.product.unit,
    quantity: record.quantity,
    before: record.previousStock,
    after: record.newStock,
    reason: wasteReasonLabel(record.reasonCode),
    operator: record.user?.name ?? null,
    supplier: record.supplier ? record.supplier.nombreFantasia?.trim() || record.supplier.razonSocial : null,
    note: record.notes,
    reference: record.reference,
    evidenceUrl: record.evidenceUrl && isAllowedBlobUrl(record.evidenceUrl) ? record.evidenceUrl : null,
    totalCost: includeCosts ? record.totalCost : null,
  };
}

/** Una página de la lista en pantalla (el movimiento más reciente primero). */
export async function listMovements(
  companyId: string,
  filter: MovementsExportFilter,
  page: number,
  options: { includeCosts: boolean }
): Promise<{ rows: MovementExportRow[]; total: number }> {
  const where = movementsWhere(companyId, filter);
  const [total, found] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (Math.max(page, 1) - 1) * MOVEMENTS_PAGE_SIZE,
      take: MOVEMENTS_PAGE_SIZE,
      select: MOVEMENT_SELECT,
    }),
  ]);
  return { rows: found.map((record) => toRow(record, options.includeCosts)), total };
}

export interface MovementsSummary {
  total: number;
  byType: Array<{ type: MovementType; label: string; movements: number }>;
  byWarehouse: Array<{ warehouseId: string; name: string; movements: number }>;
}

/** Conteos del filtro completo (no de la página): cuántos de cada tipo y en qué bodega. */
export async function summarizeMovements(companyId: string, filter: MovementsExportFilter): Promise<MovementsSummary> {
  const where = movementsWhere(companyId, filter);
  const [types, warehouses] = await Promise.all([
    prisma.inventoryMovement.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.inventoryMovement.groupBy({ by: ['warehouseId'], where, _count: { _all: true } }),
  ]);
  const names = warehouses.length
    ? await prisma.warehouse.findMany({ where: { companyId, id: { in: warehouses.map((row) => row.warehouseId) } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  return {
    total: types.reduce((sum, row) => sum + row._count._all, 0),
    byType: types
      .map((row) => ({ type: row.type, label: MOVEMENT_TYPE_LABELS[row.type], movements: row._count._all }))
      .sort((a, b) => b.movements - a.movements),
    byWarehouse: warehouses
      .map((row) => ({ warehouseId: row.warehouseId, name: nameOf.get(row.warehouseId) ?? 'Bodega eliminada', movements: row._count._all }))
      .sort((a, b) => b.movements - a.movements),
  };
}

const BATCH = 1000;

export interface MovementsWorkbook {
  buffer: Buffer;
  rows: number;
  truncated: boolean;
}

export async function buildMovementsWorkbook(
  companyId: string,
  filter: MovementsExportFilter,
  range: DayRange,
  options: { includeCosts: boolean; warehouseName?: string }
): Promise<MovementsWorkbook> {
  const where = movementsWhere(companyId, filter);
  const summary = await summarizeMovements(companyId, filter);
  const truncated = summary.total > MAX_MOVEMENT_EXPORT_ROWS;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aether ERP';
  const sheet = wb.addWorksheet('Movimientos');
  sheet.columns = [
    { header: 'Fecha y hora', key: 'date', width: 18 },
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'product', width: 38 },
    { header: 'Movimiento', key: 'type', width: 18 },
    { header: 'Cantidad', key: 'quantity', width: 11 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Stock antes', key: 'before', width: 12 },
    { header: 'Stock después', key: 'after', width: 13 },
    { header: 'Motivo', key: 'reason', width: 28 },
    { header: 'Operario', key: 'operator', width: 22 },
    { header: 'Proveedor', key: 'supplier', width: 26 },
    { header: 'Referencia', key: 'reference', width: 18 },
    { header: 'Detalle', key: 'note', width: 40 },
    ...(options.includeCosts ? [{ header: 'Costo total', key: 'cost', width: 13 }] : []),
    { header: 'Foto de respaldo', key: 'photo', width: 16 },
  ];
  styleHeader(sheet);

  let written = 0;
  let cursor: string | undefined;
  while (written < MAX_MOVEMENT_EXPORT_ROWS) {
    const batch = await prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(BATCH, MAX_MOVEMENT_EXPORT_ROWS - written),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: MOVEMENT_SELECT,
    });
    if (batch.length === 0) break;
    for (const record of batch) {
      const row = toRow(record, options.includeCosts);
      const added = sheet.addRow({
        date: santiagoWallClock(row.date),
        warehouse: safeCell(row.warehouse),
        sku: safeCell(row.sku),
        product: safeCell(row.product),
        type: row.typeLabel,
        quantity: row.direction === 'in' ? row.quantity : -row.quantity,
        unit: row.unit,
        before: row.before,
        after: row.after,
        reason: row.reason ?? '',
        operator: safeCell(row.operator),
        supplier: safeCell(row.supplier),
        reference: safeCell(row.reference),
        note: safeCell(row.note),
        cost: row.totalCost ?? undefined,
      });
      if (row.evidenceUrl) added.getCell('photo').value = { text: 'Ver foto', hyperlink: row.evidenceUrl };
    }
    written += batch.length;
    cursor = batch[batch.length - 1]?.id;
    if (batch.length < BATCH) break;
  }
  sheet.getColumn('date').numFmt = DATETIME_FORMAT;
  for (const key of ['quantity', 'before', 'after']) sheet.getColumn(key).numFmt = QTY_FORMAT;
  if (options.includeCosts) sheet.getColumn('cost').numFmt = CLP_FORMAT;

  const resume = wb.addWorksheet('Resumen');
  resume.columns = [
    { header: 'Resumen', key: 'label', width: 40 },
    { header: 'Movimientos', key: 'movements', width: 14 },
  ];
  styleHeader(resume, { filter: false });
  const section = (title: string, rows: Array<{ label: string; movements: number }>) => {
    resume.addRow({ label: title }).font = { bold: true };
    for (const row of rows) resume.addRow(row);
    resume.addRow({});
  };
  section('Por tipo de movimiento', summary.byType);
  section('Por bodega', summary.byWarehouse.map((row) => ({ label: row.name, movements: row.movements })));
  resume.addRow({ label: 'Total de movimientos', movements: summary.total }).font = { bold: true };
  resume.addRow({});
  const scope = options.warehouseName ?? 'Todas las bodegas';
  resume.addRow({ label: `${scope} · ${LOG_KIND_LABELS[filter.kind]} · ${describeRange(range)}` }).font = { italic: true, color: { argb: 'FF666666' } };
  if (truncated) {
    resume.addRow({
      label: `Hay ${summary.total.toLocaleString('es-CL')} movimientos en este filtro y el archivo incluye los ${MAX_MOVEMENT_EXPORT_ROWS.toLocaleString('es-CL')} más recientes. Acota las fechas para bajar el resto.`,
    }).font = { bold: true, color: { argb: 'FFB45309' } };
  }

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rows: written, truncated };
}
