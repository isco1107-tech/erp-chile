import 'server-only';

import ExcelJS from 'exceljs';
import type { ConsignmentPortalRow, SupplierPortalRow, SupplierPortalView } from './supplier-portal.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';
const STATUS_LABEL = { OUT: 'Sin stock', LOW: 'Stock bajo', OK: 'Normal' } as const;

const MONEY = '$#,##0';

const date = (value: Date | null) => (value ? value.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

function styleHeader(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;
}

/**
 * Inventario del proveedor (y, si es seller, de su consignación y sus liquidaciones) a Excel, para
 * que lo analice en su computador. Es exactamente lo que ve en pantalla (ya sin costos de la empresa
 * ni datos de clientes) y respeta lo que la empresa decidió mostrarle.
 */
export async function buildSupplierInventoryWorkbook(view: SupplierPortalView): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  if (view.rows.length > 0 || !view.consignment) addInventorySheet(wb, 'Inventario', view.rows, view);
  if (view.consignment) {
    addInventorySheet(wb, 'Consignación', view.consignment.rows, view);
    addSettlementsSheet(wb, view);
  }
  return finish(wb, view);
}

async function finish(wb: ExcelJS.Workbook, view: SupplierPortalView): Promise<Buffer> {
  // Pie con la fecha en cada hoja, para que el archivo diga a qué momento corresponde.
  for (const ws of wb.worksheets) {
    ws.addRow({});
    const stamp = ws.addRow({ sku: `Al ${view.generatedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${view.company.name}` });
    stamp.font = { italic: true, color: { argb: 'FF666666' } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addInventorySheet(wb: ExcelJS.Workbook, name: string, rows: Array<SupplierPortalRow | ConsignmentPortalRow>, view: SupplierPortalView): void {
  const warehouses = [...new Set(rows.flatMap((row) => row.byWarehouse.map((entry) => entry.warehouse)))].sort((a, b) => a.localeCompare(b, 'es'));
  const withCommission = rows.some((row) => 'commissionBps' in row);
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });

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
  if (withCommission) columns.push({ header: 'Comisión (%)', key: 'commission', width: 12 });
  if (view.showMovement) {
    columns.push(
      { header: `Vendido (${view.windowDays} días)`, key: 'sold', width: 14 },
      { header: `Bajas (${view.windowDays} días)`, key: 'written', width: 14 },
      { header: 'Días que alcanza', key: 'coverage', width: 14 }
    );
  }
  ws.columns = columns;
  styleHeader(ws);

  for (const row of rows) {
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
      commission: 'commissionBps' in row && row.commissionBps !== null ? row.commissionBps / 100 : null,
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
}

/** Lo vendido sin liquidar y las liquidaciones del seller: sus propios montos, sin documentos ni clientes. */
function addSettlementsSheet(wb: ExcelJS.Workbook, view: SupplierPortalView): void {
  const consignment = view.consignment;
  if (!consignment) return;
  const ws = wb.addWorksheet('Liquidaciones', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'N°', key: 'sku', width: 18 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Unidades', key: 'units', width: 11 },
    { header: 'Neto vendido', key: 'net', width: 15 },
    { header: 'Comisión', key: 'commission', width: 15 },
    { header: 'Ajuste', key: 'adjustment', width: 13 },
    { header: 'Te corresponde', key: 'payout', width: 16 },
    { header: 'Estado', key: 'status', width: 22 },
  ];
  styleHeader(ws);

  const { pending } = consignment;
  ws.addRow({ sku: 'Sin liquidar', date: '', units: pending.units, net: pending.netSales, commission: pending.commissionAmount, adjustment: null, payout: pending.payoutAmount, status: 'Vendido, aún sin liquidar' });
  for (const settlement of consignment.settlements) {
    ws.addRow({
      sku: settlement.number,
      date: date(settlement.createdAt),
      units: settlement.units,
      net: settlement.netSales,
      commission: settlement.commissionAmount,
      adjustment: settlement.adjustmentAmount === 0 ? null : settlement.adjustmentAmount,
      payout: settlement.payoutAmount,
      status: settlement.status === 'PAID' ? `Pagada${settlement.paidAt ? ` el ${date(settlement.paidAt)}` : ''}` : 'Por pagar',
    });
  }
  ws.getColumn(3).numFmt = QTY;
  for (const column of [4, 5, 6, 7]) ws.getColumn(column).numFmt = MONEY;
}
