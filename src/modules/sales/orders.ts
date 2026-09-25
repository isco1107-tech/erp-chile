import type { DteType, SalesOrderStatus } from '@prisma/client';

/**
 * Reglas de la nota de venta, como funciones puras (ver `SalesOrder` en el
 * esquema): cuánto queda por facturar y por despachar, qué avanza cada
 * documento emitido desde ella y en qué estado queda.
 */

export interface OrderLineProgress {
  id: string;
  description: string;
  quantity: number;
  quantityInvoiced: number;
  quantityDispatched: number;
}

/** Tolerancia para cantidades con decimales (kilos, metros). */
const EPSILON = 1e-9;

export function remainingToInvoice(line: OrderLineProgress): number {
  return Math.max(0, line.quantity - line.quantityInvoiced);
}

export function remainingToDispatch(line: OrderLineProgress): number {
  return Math.max(0, line.quantity - line.quantityDispatched);
}

/** Documentos que se pueden emitir desde una nota de venta. */
export const ORDER_DOCUMENT_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'GUIA_DESPACHO_52'];

export interface DocumentProgressEffect {
  invoices: boolean;
  dispatches: boolean;
}

/**
 * Qué avanza un documento emitido desde la nota:
 * - Guía de despacho: saca mercadería, no factura.
 * - Factura o boleta: factura; además despacha, salvo que formalice una guía
 *   ya emitida (la mercadería salió con la guía).
 */
export function documentProgressEffect(dteType: DteType, formalizesIssuedGuide: boolean): DocumentProgressEffect {
  if (dteType === 'GUIA_DESPACHO_52') return { invoices: false, dispatches: true };
  if (ORDER_DOCUMENT_TYPES.includes(dteType)) return { invoices: true, dispatches: !formalizesIssuedGuide };
  return { invoices: false, dispatches: false };
}

export interface DocumentLineForOrder {
  salesOrderItemId: string;
  quantity: number;
}

export type OrderProgressUpdate = { id: string; quantityInvoiced: number; quantityDispatched: number };

/**
 * Suma (o, con `sign = -1`, revierte al anular) lo que un documento avanza
 * sobre las líneas de la nota. Lanza un error legible si una línea pide más
 * de lo que queda pendiente, o si no pertenece a la nota.
 */
export function applyDocumentToOrder(
  lines: readonly OrderLineProgress[],
  documentLines: readonly DocumentLineForOrder[],
  effect: DocumentProgressEffect,
  sign: 1 | -1 = 1
): OrderProgressUpdate[] {
  const byId = new Map(lines.map((line) => [line.id, { ...line }]));
  for (const docLine of documentLines) {
    const line = byId.get(docLine.salesOrderItemId);
    if (!line) throw new Error('Una línea del documento no pertenece a la nota de venta');
    if (docLine.quantity <= 0) continue;
    if (effect.invoices) {
      if (sign === 1 && docLine.quantity > remainingToInvoice(line) + EPSILON) {
        throw new Error(`"${line.description}": quedan ${formatQty(remainingToInvoice(line))} por facturar en la nota de venta y el documento pide ${formatQty(docLine.quantity)}`);
      }
      line.quantityInvoiced = Math.max(0, line.quantityInvoiced + sign * docLine.quantity);
    }
    if (effect.dispatches) {
      if (sign === 1 && docLine.quantity > remainingToDispatch(line) + EPSILON) {
        throw new Error(`"${line.description}": quedan ${formatQty(remainingToDispatch(line))} por despachar en la nota de venta y el documento pide ${formatQty(docLine.quantity)}`);
      }
      line.quantityDispatched = Math.max(0, line.quantityDispatched + sign * docLine.quantity);
    }
  }
  return [...byId.values()].map(({ id, quantityInvoiced, quantityDispatched }) => ({ id, quantityInvoiced, quantityDispatched }));
}

/** Estado derivado: completa cuando todo está facturado; en proceso con cualquier avance. */
export function deriveOrderStatus(lines: readonly Pick<OrderLineProgress, 'quantity' | 'quantityInvoiced' | 'quantityDispatched'>[], current: SalesOrderStatus): SalesOrderStatus {
  if (current === 'CANCELLED') return 'CANCELLED';
  if (lines.length > 0 && lines.every((line) => line.quantityInvoiced + EPSILON >= line.quantity)) return 'COMPLETED';
  if (lines.some((line) => line.quantityInvoiced > EPSILON || line.quantityDispatched > EPSILON)) return 'IN_PROGRESS';
  return 'PENDING';
}

/** Avance global de la nota (0-100), por monto facturado sobre el total de líneas. */
export function orderProgressPercent(lines: readonly (OrderLineProgress & { unitPrice: number })[]): number {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (total <= 0) return 0;
  const done = lines.reduce((sum, line) => sum + Math.min(line.quantity, line.quantityInvoiced) * line.unitPrice, 0);
  return Math.round((done / total) * 100);
}

/**
 * Stock comprometido por notas abiertas: lo que falta despachar. Se usa para
 * mostrar "disponible = stock - comprometido" al vender.
 */
export function reservedQuantity(lines: readonly Pick<OrderLineProgress, 'quantity' | 'quantityDispatched'>[]): number {
  return lines.reduce((sum, line) => sum + Math.max(0, line.quantity - line.quantityDispatched), 0);
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Concluida',
  CANCELLED: 'Anulada',
};
