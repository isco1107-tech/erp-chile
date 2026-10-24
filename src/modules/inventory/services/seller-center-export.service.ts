import 'server-only';

import ExcelJS from 'exceljs';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type { SellerCenterView } from './seller-center-view.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const CLP = '"$"#,##0';

export const RESPONSIBLE_LABELS = { YOU: 'Tú', STORE: 'La tienda', UNASSIGNED: 'Sin asignar', OTHER: 'Otro responsable' } as const;

function sheet(wb: ExcelJS.Workbook, name: string, columns: Array<Partial<ExcelJS.Column>>) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;
  return ws;
}

/** El mes del Seller Center a Excel: ventas, existencias y mermas. Valores como datos, nunca fórmulas. */
export async function buildSellerCenterWorkbook(view: SellerCenterView, names: { company: string; supplier: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const sales = sheet(wb, 'Ventas', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 40 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Vendido', key: 'units', width: 12 },
    { header: 'Neto cobrado', key: 'net', width: 16 },
    { header: 'Precio neto promedio', key: 'avg', width: 18 },
  ]);
  for (const row of view.sales.rows) sales.addRow({ sku: row.sku, name: row.name, unit: row.unit, units: row.units, net: row.net, avg: row.averagePrice ?? undefined });
  sales.getColumn('units').numFmt = QTY;
  sales.getColumn('net').numFmt = CLP;
  sales.getColumn('avg').numFmt = CLP;
  sales.addRow({});
  const note = sales.addRow({ sku: `${names.supplier} en ${names.company} · ${view.monthLabel} · neto sin IVA de boletas y facturas emitidas menos notas de crédito · solo productos que surtes en exclusiva` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  const stock = sheet(wb, 'Existencias', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 40 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'En bodega', key: 'total', width: 12 },
    { header: 'Mínimo', key: 'min', width: 10 },
    { header: 'Por bodega', key: 'byWarehouse', width: 40 },
  ]);
  for (const row of view.inventory.rows) {
    stock.addRow({ sku: row.sku, name: row.name, unit: row.unit, total: row.total, min: row.minStock || undefined, byWarehouse: row.byWarehouse.map((entry) => `${entry.warehouse}: ${entry.quantity}`).join(' · ') });
  }
  stock.getColumn('total').numFmt = QTY;

  const losses = sheet(wb, 'Mermas', [
    { header: 'Fecha', key: 'date', width: 16 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 36 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Cantidad', key: 'quantity', width: 12 },
    { header: 'Motivo', key: 'reason', width: 28 },
    { header: 'Responde', key: 'responsible', width: 16 },
    { header: 'Foto', key: 'photo', width: 40 },
  ]);
  for (const row of view.losses.rows) {
    losses.addRow({
      date: dayTimeLabel(new Date(row.createdAt)),
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      reason: row.reason,
      responsible: row.responsible ? RESPONSIBLE_LABELS[row.responsible] : '',
      photo: row.evidenceUrl ?? '',
    });
  }
  losses.getColumn('quantity').numFmt = QTY;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
