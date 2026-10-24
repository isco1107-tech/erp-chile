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

/** El mes del Seller Center a Excel: ventas, mercadería, liquidaciones y mermas. Valores como datos, nunca fórmulas. */
export async function buildSellerCenterWorkbook(view: SellerCenterView, names: { company: string; supplier: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const sales = sheet(wb, 'Ventas', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 40 },
    { header: 'Vendido', key: 'units', width: 12 },
    { header: 'Neto vendido', key: 'net', width: 16 },
    { header: 'Comisión', key: 'commission', width: 14 },
    { header: 'Te corresponde', key: 'payout', width: 16 },
  ]);
  for (const row of view.sales.rows) sales.addRow({ sku: row.sku ?? '', name: row.name, units: row.units, net: row.net, commission: row.commission, payout: row.payout });
  sales.getColumn('units').numFmt = QTY;
  for (const key of ['net', 'commission', 'payout']) sales.getColumn(key).numFmt = CLP;
  sales.addRow({});
  const note = sales.addRow({ sku: `${names.supplier} en ${names.company} · ${view.monthLabel} · neto sin IVA de boletas y facturas emitidas menos notas de crédito, con la cuenta de las liquidaciones` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  const consignment = view.portal.consignment;
  const stock = sheet(wb, 'Mercadería', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 40 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'En bodega', key: 'total', width: 12 },
    { header: 'Comisión (%)', key: 'commission', width: 12 },
    { header: 'Por bodega', key: 'byWarehouse', width: 40 },
  ]);
  for (const row of consignment?.rows ?? []) {
    stock.addRow({
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      total: row.total,
      commission: row.commissionBps === null ? undefined : row.commissionBps / 100,
      byWarehouse: row.byWarehouse.map((entry) => `${entry.warehouse}: ${entry.quantity}`).join(' · '),
    });
  }
  stock.getColumn('total').numFmt = QTY;

  const settlements = sheet(wb, 'Liquidaciones', [
    { header: 'N°', key: 'number', width: 8 },
    { header: 'Fecha', key: 'date', width: 16 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Unidades', key: 'units', width: 12 },
    { header: 'Neto vendido', key: 'net', width: 16 },
    { header: 'Comisión', key: 'commission', width: 14 },
    { header: 'Ajuste', key: 'adjustment', width: 12 },
    { header: 'Te corresponde', key: 'payout', width: 16 },
    { header: 'Pagada el', key: 'paidAt', width: 16 },
  ]);
  for (const row of consignment?.settlements ?? []) {
    settlements.addRow({
      number: row.number,
      date: dayTimeLabel(new Date(row.createdAt)),
      status: row.status === 'PAID' ? 'Pagada' : 'Por pagar',
      units: row.units,
      net: row.netSales,
      commission: row.commissionAmount,
      adjustment: row.adjustmentAmount,
      payout: row.payoutAmount,
      paidAt: row.paidAt ? dayTimeLabel(new Date(row.paidAt)) : '',
    });
  }
  settlements.getColumn('units').numFmt = QTY;
  for (const key of ['net', 'commission', 'adjustment', 'payout']) settlements.getColumn(key).numFmt = CLP;

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
