import 'server-only';

import ExcelJS from 'exceljs';
import type { SupplierPortalView } from './supplier-portal.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const STATUS_LABEL = { OUT: 'Sin stock', LOW: 'Stock bajo', OK: 'Normal' } as const;

/**
 * Inventario del proveedor a Excel, para que lo analice en su computador. Es exactamente lo que
 * ve en pantalla (ya sin costos ni precios) y respeta lo que la empresa decidió mostrarle.
 */
export async function buildSupplierInventoryWorkbook(view: SupplierPortalView): Promise<Buffer> {
  const warehouses = [...new Set(view.rows.flatMap((row) => row.byWarehouse.map((entry) => entry.warehouse)))].sort((a, b) => a.localeCompare(b, 'es'));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });

  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 38 },
    { header: 'Marca', key: 'brand', width: 18 },
    { header: 'Unidad', key: 'unit', width: 9 },
    { header: 'Stock total', key: 'total', width: 12 },
    ...warehouses.map((warehouse, index) => ({ header: `Stock · ${warehouse}`.slice(0, 60), key: `w${index}`, width: 16 })),
    { header: 'Mínimo', key: 'min', width: 10 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Última llegada', key: 'arrival', width: 16 },
    { header: 'Cantidad última llegada', key: 'arrivalQty', width: 14 },
  ];
  if (view.showMovement) {
    columns.push(
      { header: `Vendido (${view.windowDays} días)`, key: 'sold', width: 14 },
      { header: `Bajas (${view.windowDays} días)`, key: 'written', width: 14 },
      { header: 'Días que alcanza', key: 'coverage', width: 14 }
    );
  }
  ws.columns = columns;

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;

  const date = (value: Date | null) => (value ? value.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

  for (const row of view.rows) {
    const values: Record<string, string | number | null> = {
      sku: row.sku,
      name: row.name,
      brand: row.brand ?? '',
      unit: row.unit,
      total: row.total,
      min: row.minStock > 0 ? row.minStock : null,
      status: STATUS_LABEL[row.status],
      arrival: date(row.lastReceivedAt),
      arrivalQty: row.lastReceivedQty,
      sold: row.sold30,
      written: row.written30,
      coverage: row.coverageDays,
    };
    warehouses.forEach((warehouse, index) => {
      values[`w${index}`] = row.byWarehouse.find((entry) => entry.warehouse === warehouse)?.quantity ?? 0;
    });
    ws.addRow(values);
  }

  const first = 5;
  for (let column = first; column <= first + warehouses.length; column++) ws.getColumn(column).numFmt = QTY;

  // Pie con la fecha, para que el archivo diga a qué momento corresponde.
  ws.addRow({});
  const stamp = ws.addRow({ sku: `Existencias al ${view.generatedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${view.company.name}` });
  stamp.font = { italic: true, color: { argb: 'FF666666' } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
