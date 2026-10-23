import 'server-only';

import ExcelJS from 'exceljs';
import { DEAD_STOCK_SUGGESTIONS } from '@/lib/retail/dead-stock';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { getDeadStock, type DeadStockFilter } from './dead-stock.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const CLP = '#,##0';

/** Stock muerto de UNA bodega a Excel, con los filtros de la pantalla. Valores como datos, nunca fórmulas. */
export async function buildDeadStockWorkbook(companyId: string, warehouseName: string, filter: DeadStockFilter, options: { includeCosts: boolean }): Promise<{ buffer: Buffer; rows: number }> {
  const data = await getDeadStock(companyId, filter, options);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stock muerto', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'product', width: 36 },
    { header: 'Marca', key: 'brand', width: 18 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Stock', key: 'stock', width: 12 },
    { header: 'Días sin rotar', key: 'days', width: 14 },
    { header: 'Última venta', key: 'lastSale', width: 16 },
    { header: 'Días para vencer', key: 'expiry', width: 16 },
    ...(options.includeCosts ? [{ header: 'Valor (PMP)', key: 'value', width: 14 }] : []),
    { header: 'Sugerencia', key: 'suggestion', width: 70 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  for (const row of data.rows) {
    ws.addRow({
      warehouse: warehouseName,
      sku: row.sku,
      product: row.name,
      brand: row.brand ?? '',
      category: row.category ?? '',
      unit: row.unit,
      stock: row.stock,
      days: row.daysStopped,
      lastSale: row.lastSaleAt ? dayTimeLabel(new Date(row.lastSaleAt)) : 'Nunca',
      expiry: row.daysToExpiry ?? '',
      value: row.value ?? undefined,
      suggestion: DEAD_STOCK_SUGGESTIONS[row.suggestion],
    });
  }
  ws.getColumn('stock').numFmt = QTY;
  if (options.includeCosts) ws.getColumn('value').numFmt = CLP;

  ws.addRow({});
  const note = ws.addRow({ warehouse: `${warehouseName} · detenido desde ${filter.thresholdDays} días sin rotar (venta o traslado) · calculado el ${dayTimeLabel(new Date(data.generatedAt))}` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rows: data.rows.length };
}
