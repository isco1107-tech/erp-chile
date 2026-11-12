import 'server-only';

import ExcelJS from 'exceljs';
import { safeCell } from '@/modules/exports/services/excel';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type { LotMovementRow, LotTrace } from './genealogy.service';

const BRAND = 'FF12161F';
const QTY = '#,##0.###';

function styleHeader(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 26;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function movementSheet(wb: ExcelJS.Workbook, name: string, rows: LotMovementRow[]): void {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: 'Fecha', key: 'at', width: 16 },
    { header: 'Tipo', key: 'label', width: 22 },
    { header: 'Cantidad del lote', key: 'quantity', width: 16, style: { numFmt: QTY } },
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'Documento', key: 'document', width: 32 },
    { header: 'Proveedor o cliente', key: 'party', width: 32 },
    { header: 'Motivo', key: 'reason', width: 24 },
    { header: 'Detalle', key: 'note', width: 30 },
    { header: 'Operario', key: 'actor', width: 20 },
    { header: 'Referencia', key: 'reference', width: 34 },
    { header: 'Anulado', key: 'cancelled', width: 10 },
  ];
  styleHeader(ws);
  for (const row of rows) {
    ws.addRow({
      at: dayTimeLabel(row.at),
      label: row.label,
      quantity: row.quantity,
      warehouse: safeCell(row.warehouse),
      document: safeCell(row.document),
      party: safeCell(row.counterparty),
      reason: safeCell(row.reason),
      note: safeCell(row.note),
      actor: safeCell(row.actor),
      reference: safeCell(row.reference),
      cancelled: row.cancelled ? 'Sí' : '',
    });
  }
}

/** Libro del retiro de un lote: resumen, origen, ventas, clientes alcanzados y existencias. Valores como datos, nunca fórmulas. */
export async function buildLotTraceWorkbook(trace: LotTrace): Promise<{ buffer: Buffer; customers: number }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aether';

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Dato', key: 'k', width: 38 },
    { header: 'Valor', key: 'v', width: 56 },
  ];
  styleHeader(summary);
  const rec = trace.reconciliation;
  const lines: Array<[string, string | number]> = [
    ['Producto', safeCell(trace.product.name)],
    ['SKU', safeCell(trace.product.sku)],
    ['Lote', safeCell(trace.lotNumber)],
    ['Vencimiento', trace.expiryDate ? trace.expiryDate.toISOString().slice(0, 10) : 'Sin vencimiento'],
    ['Proveedores', safeCell(trace.suppliers.join(' · ') || 'Sin documento enlazado')],
    ['Unidades recibidas', rec.received],
    ['Unidades despachadas (ventas, producción, pérdidas)', rec.dispatched],
    ['Unidades que quedan en bodega', rec.inStock],
    ['Diferencia sin explicar', rec.unexplained],
    ['Cuadre', rec.balanced ? 'Cuadra' : 'No cuadra: hay movimientos anteriores al seguimiento o sin lote'],
    ['Clientes alcanzados (directos)', trace.customersHidden ? 'Sin permiso para ver clientes' : trace.customers.length],
    ['Generado', dayTimeLabel(new Date())],
  ];
  for (const [k, v] of lines) summary.addRow({ k, v });

  movementSheet(wb, 'Origen', trace.entries);
  movementSheet(wb, 'Ventas', [...trace.sales, ...trace.returns]);
  movementSheet(wb, 'Pérdidas y otras salidas', trace.writeOffs);
  movementSheet(wb, 'Traslados', trace.transfers);

  const stock = wb.addWorksheet('Existencias hoy');
  stock.columns = [
    { header: 'Bodega', key: 'warehouse', width: 28 },
    { header: 'Unidades', key: 'quantity', width: 14, style: { numFmt: QTY } },
  ];
  styleHeader(stock);
  for (const row of trace.stock) stock.addRow({ warehouse: safeCell(row.warehouse), quantity: row.quantity });

  const customerSheet = wb.addWorksheet('Clientes alcanzados');
  customerSheet.columns = [
    { header: 'Cliente', key: 'name', width: 36 },
    { header: 'RUT', key: 'rut', width: 16 },
    { header: 'Unidades netas', key: 'quantity', width: 16, style: { numFmt: QTY } },
    { header: 'Primera compra', key: 'first', width: 16 },
    { header: 'Última compra', key: 'last', width: 16 },
    { header: 'Documentos', key: 'documents', width: 48 },
    { header: 'Vía', key: 'via', width: 30 },
  ];
  styleHeader(customerSheet);
  let customers = 0;
  if (!trace.customersHidden) {
    for (const hit of trace.customers) {
      customers += 1;
      customerSheet.addRow({ name: safeCell(hit.name), rut: safeCell(hit.rut), quantity: hit.quantity, first: dayTimeLabel(hit.firstAt), last: dayTimeLabel(hit.lastAt), documents: safeCell(hit.documents.join(', ')), via: 'Directo' });
    }
    for (const link of trace.usedInProduction) {
      for (const hit of link.customers) {
        customers += 1;
        customerSheet.addRow({
          name: safeCell(hit.name),
          rut: safeCell(hit.rut),
          quantity: hit.quantity,
          first: dayTimeLabel(hit.firstAt),
          last: dayTimeLabel(hit.lastAt),
          documents: safeCell(hit.documents.join(', ')),
          via: safeCell(`Producción N° ${link.folio}: ${link.outputProduct}${link.outputLot ? ` (lote ${link.outputLot})` : ''}`),
        });
      }
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, customers };
}
