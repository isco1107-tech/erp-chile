import 'server-only';

import ExcelJS from 'exceljs';
import { FULFILLMENT_STATUS_LABELS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/ecommerce/order-state';
import { PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import { ordersForExport, ORDERS_EXPORT_LIMIT } from './store-orders.service';
import type { OrderListQuery } from '../schema';

const BRAND = 'FF12161F';
const CLP = '"$"#,##0';

/** Texto escrito por el comprador: nunca se interpreta como fórmula de Excel. */
const safe = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

/**
 * Pedidos de la tienda a Excel: una fila por pedido, con el cliente, la entrega, el pago y la venta del ERP.
 * Mismo patrón visual que el resto de las exportaciones. Son datos personales: cada descarga queda auditada
 * por la ruta. Tope de `ORDERS_EXPORT_LIMIT` filas (si hay más, una nota en la hoja lo dice).
 */
export async function buildOrdersWorkbook(companyId: string, query: Pick<OrderListQuery, 'siteId' | 'view' | 'q'>): Promise<{ buffer: Buffer; rowCount: number }> {
  const { rows, truncated } = await ordersForExport(companyId, query);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pedidos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'N° pedido', key: 'number', width: 11 },
    { header: 'Fecha', key: 'createdAt', width: 18 },
    { header: 'Tienda', key: 'site', width: 22 },
    { header: 'Cliente', key: 'name', width: 26 },
    { header: 'Correo', key: 'email', width: 28 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'RUT', key: 'rut', width: 14 },
    { header: 'Documento', key: 'document', width: 11 },
    { header: 'Entrega', key: 'delivery', width: 12 },
    { header: 'Dirección', key: 'address', width: 36 },
    { header: 'Tarifa de despacho', key: 'rate', width: 22 },
    { header: 'Medio de pago', key: 'provider', width: 24 },
    { header: 'Pago', key: 'payment', width: 16 },
    { header: 'Entrega (estado)', key: 'fulfillment', width: 18 },
    { header: 'Pedido', key: 'status', width: 12 },
    { header: 'Productos', key: 'items', width: 48 },
    { header: 'Productos ($)', key: 'subtotal', width: 14 },
    { header: 'Despacho ($)', key: 'shipping', width: 14 },
    { header: 'Total ($)', key: 'total', width: 14 },
    { header: 'Pagado el', key: 'paidAt', width: 18 },
    { header: 'Folio de la venta', key: 'folio', width: 16 },
    { header: 'Transportista', key: 'carrier', width: 18 },
    { header: 'N° de seguimiento', key: 'tracking', width: 20 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 26;

  const date = (d: Date | null) => (d ? d.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  for (const order of rows) {
    ws.addRow({
      number: order.number,
      createdAt: date(order.createdAt),
      site: safe(order.siteName),
      name: safe(order.customerName),
      email: safe(order.customerEmail),
      phone: safe(order.customerPhone),
      rut: order.customerRut ?? '',
      document: order.documentType === 'FACTURA' ? 'Factura' : 'Boleta',
      delivery: order.deliveryMethod === 'PICKUP' ? 'Retiro' : 'Despacho',
      address: safe(order.address),
      rate: safe(order.shippingRateName ?? ''),
      provider: order.paymentProvider ? PAYMENT_PROVIDER_INFO[order.paymentProvider].label : '',
      payment: PAYMENT_STATUS_LABELS[order.paymentStatus],
      fulfillment: FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus],
      status: ORDER_STATUS_LABELS[order.status],
      items: safe(order.items),
      subtotal: order.subtotal,
      shipping: order.shippingTotal,
      total: order.total,
      paidAt: date(order.paidAt),
      folio: order.saleFolio ?? '',
      carrier: safe(order.carrier ?? ''),
      tracking: safe(order.trackingNumber ?? ''),
    });
  }
  for (const key of ['subtotal', 'shipping', 'total']) ws.getColumn(key).numFmt = CLP;
  ws.eachRow((row, index) => {
    if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  if (truncated) {
    const note = wb.addWorksheet('Aviso');
    note.addRow([`La exportación se limitó a los ${ORDERS_EXPORT_LIMIT.toLocaleString('es-CL')} pedidos más recientes. Filtra por tienda, estado o búsqueda para ver el resto.`]);
    note.getColumn(1).width = 100;
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rowCount: rows.length };
}
