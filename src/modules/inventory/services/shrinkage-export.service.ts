import 'server-only';

import ExcelJS from 'exceljs';
import { LIABILITY_STATE_LABELS } from '@/lib/inventory/shrinkage';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { listShrinkage, type ShrinkageFilter } from './shrinkage.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const CLP = '#,##0';

/** Pérdidas de UNA bodega con su responsable, para la liquidación. Valores como datos, nunca fórmulas. */
export async function buildShrinkageWorkbook(
  companyId: string,
  warehouseName: string,
  filter: ShrinkageFilter,
  options: { includeCosts: boolean }
): Promise<{ buffer: Buffer; rows: number; truncated: boolean }> {
  const { rows, summary, truncated } = await listShrinkage(companyId, filter, options);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mermas', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Fecha', key: 'date', width: 16 },
    { header: 'Bodega', key: 'warehouse', width: 18 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'product', width: 36 },
    { header: 'Unidad', key: 'unit', width: 8 },
    { header: 'Cantidad', key: 'quantity', width: 12 },
    { header: 'Motivo', key: 'reason', width: 26 },
    { header: 'Detalle', key: 'note', width: 36 },
    { header: 'Operario', key: 'operator', width: 20 },
    ...(options.includeCosts ? [{ header: 'Costo (PMP)', key: 'cost', width: 14 }] : []),
    { header: 'Responde', key: 'state', width: 14 },
    { header: 'Proveedor que responde', key: 'supplier', width: 30 },
    { header: 'Asignado por', key: 'assignedBy', width: 20 },
    { header: 'Foto de respaldo', key: 'photo', width: 40 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  for (const row of rows) {
    ws.addRow({
      date: dayTimeLabel(new Date(row.createdAt)),
      warehouse: warehouseName,
      sku: row.sku,
      product: row.productName,
      unit: row.unit,
      quantity: row.quantity,
      reason: row.reasonLabel,
      note: row.note ?? '',
      operator: row.operator ?? '',
      cost: row.totalCost ?? undefined,
      state: LIABILITY_STATE_LABELS[row.state],
      supplier: row.liability?.supplier?.name ?? '',
      assignedBy: row.liability?.assignedByName ?? '',
      photo: row.evidenceUrl ?? '',
    });
  }
  ws.getColumn('quantity').numFmt = QTY;
  if (options.includeCosts) ws.getColumn('cost').numFmt = CLP;

  ws.addRow({});
  const totals = [
    `${summary.movements} pérdidas`,
    ...(['STORE', 'SUPPLIER', 'UNASSIGNED'] as const).map((state) => `${LIABILITY_STATE_LABELS[state]}: ${summary.byState[state].movements}`),
  ].join(' · ');
  const note = ws.addRow({ date: `${warehouseName} · del ${filter.from} al ${filter.to} · ${totals}${truncated ? ' · recortado a las más recientes: acota las fechas' : ''}` });
  note.font = { italic: true, color: { argb: 'FF666666' } };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rows: rows.length, truncated };
}
