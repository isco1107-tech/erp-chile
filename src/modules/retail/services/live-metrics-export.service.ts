import 'server-only';

import ExcelJS from 'exceljs';
import { LIVE_STATUS_META } from '@/lib/retail/live-metrics';
import { getLiveMetrics, type LiveMetricsFilter } from './live-metrics.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';

/**
 * "Retail en vivo" de UNA bodega a Excel: lo mismo que ve la pantalla con los
 * mismos filtros, una fila por producto. Los valores van como datos (texto o
 * número), nunca como fórmulas.
 */
export async function buildLiveMetricsWorkbook(companyId: string, warehouseName: string, filter: LiveMetricsFilter): Promise<{ buffer: Buffer; rows: number }> {
  const data = await getLiveMetrics(companyId, filter);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Retail en vivo', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'product', width: 36 },
    { header: 'Marca', key: 'brand', width: 18 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Stock', key: 'stock', width: 12 },
    { header: 'Vendido hoy', key: 'today', width: 12 },
    { header: `Vendido ${filter.periodDays} días`, key: 'sold', width: 14 },
    { header: 'Entró', key: 'received', width: 12 },
    { header: 'Sell-through %', key: 'sellThrough', width: 14 },
    { header: 'Venta diaria', key: 'velocity', width: 12 },
    { header: 'Días con stock', key: 'availableDays', width: 14 },
    { header: 'Días restantes', key: 'coverage', width: 14 },
    { header: 'Estado', key: 'status', width: 22 },
    { header: 'Última venta', key: 'lastSale', width: 18 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  const date = (iso: string) => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (const row of data.rows) {
    ws.addRow({
      warehouse: warehouseName,
      sku: row.sku,
      product: row.name,
      brand: row.brand ?? '',
      category: row.category ?? '',
      unit: row.unit,
      stock: row.stock,
      today: row.soldToday,
      sold: row.sold,
      received: row.received,
      sellThrough: row.sellThroughPct === null ? '' : Math.round(row.sellThroughPct * 10) / 10,
      velocity: row.dailyVelocity === null ? '' : Math.round(row.dailyVelocity * 100) / 100,
      availableDays: row.availableDays,
      coverage: row.coverageDays ?? '',
      status: LIVE_STATUS_META[row.status].label,
      lastSale: row.lastSaleAt ? date(row.lastSaleAt) : '',
    });
  }
  for (const key of ['stock', 'today', 'sold', 'received']) ws.getColumn(key).numFmt = QTY;

  ws.addRow({});
  const note = ws.addRow({ warehouse: `${warehouseName} · últimos ${filter.periodDays} días y hoy · se agota pronto con ${filter.lowCoverageDays} días o menos · calculado el ${date(data.generatedAt)}` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rows: data.rows.length };
}
