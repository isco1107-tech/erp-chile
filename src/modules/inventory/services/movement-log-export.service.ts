import 'server-only';

import ExcelJS from 'exceljs';
import { LOG_KIND_LABELS, listMovementLog, summarizeOutflows, type MovementLogFilter, type MovementLogRow } from './movement-log.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const CLP = '#,##0';

/** Tope de filas de un archivo: un registro más largo se acota con las fechas. */
export const MAX_EXPORT_ROWS = 10_000;

const TYPE_LABELS: Record<MovementLogRow['type'], string> = {
  PURCHASE_IN: 'Llegada',
  ADJUSTMENT_IN: 'Ajuste de entrada',
  SALE_OUT: 'Venta',
  ADJUSTMENT_OUT: 'Salida / merma',
  TRANSFER: 'Traslado',
};

/**
 * Registro de movimientos de UNA bodega a Excel: lo mismo que ve la pantalla, con el operario, el
 * motivo y el enlace a la foto de respaldo en cada fila, más una hoja con las salidas por motivo.
 */
export async function buildMovementLogWorkbook(companyId: string, warehouseName: string, filter: MovementLogFilter, options: { includeCosts: boolean }): Promise<{ buffer: Buffer; truncated: boolean }> {
  const rows: MovementLogRow[] = [];
  let cursor: string | undefined;
  let truncated = false;
  while (rows.length < MAX_EXPORT_ROWS) {
    const page = await listMovementLog(companyId, { ...filter, cursor, take: 200 }, { includeCosts: options.includeCosts });
    rows.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    if (rows.length >= MAX_EXPORT_ROWS) truncated = true;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Fecha', key: 'date', width: 18 },
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'product', width: 36 },
    { header: 'Movimiento', key: 'type', width: 18 },
    { header: 'Cantidad', key: 'quantity', width: 12 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Motivo', key: 'reason', width: 30 },
    { header: 'Operario', key: 'operator', width: 24 },
    { header: 'Proveedor', key: 'supplier', width: 28 },
    { header: 'Detalle', key: 'note', width: 44 },
    { header: 'Referencia', key: 'reference', width: 16 },
    { header: 'Stock después', key: 'after', width: 14 },
    ...(options.includeCosts ? [{ header: 'Costo', key: 'cost', width: 14 }] : []),
    { header: 'Foto de respaldo', key: 'photo', width: 40 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  const date = (d: Date) => d.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (const row of rows) {
    const added = ws.addRow({
      date: date(row.createdAt),
      warehouse: warehouseName,
      sku: row.sku,
      product: row.productName,
      type: TYPE_LABELS[row.type],
      quantity: row.direction === 'in' ? row.quantity : -row.quantity,
      unit: row.unit,
      reason: row.reasonLabel ?? '',
      operator: row.operator ?? '',
      supplier: row.supplier ?? '',
      note: row.note ?? '',
      reference: row.reference ?? '',
      after: row.stockAfter,
      cost: row.totalCost ?? undefined,
      photo: row.evidenceUrl ?? '',
    });
    if (row.evidenceUrl) added.getCell('photo').value = { text: 'Ver foto', hyperlink: row.evidenceUrl };
  }
  ws.getColumn('quantity').numFmt = QTY;
  ws.getColumn('after').numFmt = QTY;
  if (options.includeCosts) ws.getColumn('cost').numFmt = CLP;

  const summary = await summarizeOutflows(companyId, filter, { includeCosts: options.includeCosts });
  const sheet = wb.addWorksheet('Salidas por motivo', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Motivo', key: 'reason', width: 40 },
    { header: 'Movimientos', key: 'movements', width: 14 },
    { header: 'Unidades', key: 'units', width: 14 },
    ...(options.includeCosts ? [{ header: 'Costo', key: 'cost', width: 14 }] : []),
  ];
  const sheetHeader = sheet.getRow(1);
  sheetHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sheetHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  for (const row of summary) sheet.addRow({ reason: row.reasonLabel, movements: row.movements, units: row.units, cost: row.totalCost ?? undefined });
  sheet.getColumn('units').numFmt = QTY;
  if (options.includeCosts) sheet.getColumn('cost').numFmt = CLP;
  sheet.addRow({});
  const note = sheet.addRow({ reason: `${warehouseName} · ${LOG_KIND_LABELS[filter.kind ?? 'ALL']}${filter.from ? ` · desde ${filter.from}` : ''}${filter.to ? ` · hasta ${filter.to}` : ''}` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), truncated };
}
