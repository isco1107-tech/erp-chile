import 'server-only';

import ExcelJS from 'exceljs';
import { safeCell } from '@/modules/exports/services/excel';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type { TraceabilityOverview } from './traceability-overview.service';

const BRAND = 'FF12161F';

function header(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 26;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Estado de la trazabilidad de la empresa en Excel. Valores como datos, nunca fórmulas. */
export async function buildOverviewWorkbook(overview: TraceabilityOverview): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aether';

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Indicador', key: 'k', width: 46 },
    { header: 'Valor', key: 'v', width: 22 },
  ];
  header(summary);
  const rows: Array<[string, string | number]> = [
    ['Generado', dayTimeLabel(overview.generatedAt)],
    ['Productos con stock', overview.products.tracked],
    ['Productos con lotes', overview.products.withLots],
    ['Productos con series', overview.products.withSerials],
    ['Lotes vencidos con saldo', overview.lots.expired],
    ['Unidades en lotes vencidos', overview.lots.expiredUnits],
    [`Lotes que vencen en ${overview.lots.expiryDays} días`, overview.lots.soon],
    ['Productos con lotes y stock sin lote', overview.unlot.products],
    ['Unidades sin lote', overview.unlot.units],
    ['Series en bodega', overview.serials.inStock],
    ['Series vendidas', overview.serials.sold],
    ['Series perdidas', overview.serials.lost],
    ['Series devueltas al proveedor', overview.serials.returned],
    ['Bodegas con más series que stock', overview.serials.mismatches],
    ['Órdenes de compra en camino', overview.orders.inTransit],
    ['Órdenes de compra atrasadas', overview.orders.overdueCount],
    ['Ventas y llegadas (30 días)', overview.linkage.total],
    ['… con documento enlazado', overview.linkage.linked],
    ['% con documento enlazado', overview.linkage.ratePercent === null ? 'Sin datos suficientes' : overview.linkage.ratePercent],
  ];
  for (const [k, v] of rows) summary.addRow({ k, v });

  const attention = wb.addWorksheet('Qué atender');
  attention.columns = [
    { header: 'Prioridad', key: 'tone', width: 12 },
    { header: 'Asunto', key: 'title', width: 52 },
    { header: 'Detalle', key: 'detail', width: 70 },
  ];
  header(attention);
  for (const item of overview.attention) attention.addRow({ tone: item.tone === 'danger' ? 'Urgente' : item.tone === 'warning' ? 'Revisar' : 'Aviso', title: safeCell(item.title), detail: safeCell(item.detail) });

  const unlot = wb.addWorksheet('Stock sin lote');
  unlot.columns = [
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Producto', key: 'name', width: 44 },
    { header: 'Unidades', key: 'qty', width: 14, style: { numFmt: '#,##0.###' } },
    { header: 'Unidad', key: 'unit', width: 10 },
  ];
  header(unlot);
  for (const p of overview.unlot.top) unlot.addRow({ sku: safeCell(p.sku), name: safeCell(p.name), qty: p.quantity, unit: safeCell(p.unit) });

  const overdue = wb.addWorksheet('OC atrasadas');
  overdue.columns = [
    { header: 'OC', key: 'folio', width: 10 },
    { header: 'Proveedor', key: 'supplier', width: 40 },
    { header: 'Fecha esperada', key: 'date', width: 16 },
    { header: 'Días de atraso', key: 'late', width: 14 },
  ];
  header(overdue);
  for (const o of overview.orders.overdue) overdue.addRow({ folio: o.folio, supplier: safeCell(o.supplier), date: o.expectedDate.toISOString().slice(0, 10), late: o.daysLate });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
