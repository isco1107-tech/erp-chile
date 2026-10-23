import type { StoreFulfillmentStatus, StoreOrderStatus, StorePaymentStatus } from '@prisma/client';
import type { Tone } from '@/components/ui/tone';

/** Etiquetas y tonos de los estados de un pedido, compartidos por la bandeja y el detalle. */

export const PAYMENT_BADGE: Record<StorePaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pago pendiente', tone: 'warning' },
  PAID: { label: 'Pagado', tone: 'success' },
  FAILED: { label: 'Pago fallido', tone: 'danger' },
  REFUNDED: { label: 'Reembolsado', tone: 'neutral' },
};

export const FULFILLMENT_BADGE: Record<StoreFulfillmentStatus, { label: string; tone: Tone }> = {
  UNFULFILLED: { label: 'Sin preparar', tone: 'neutral' },
  PREPARING: { label: 'Preparando', tone: 'info' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', tone: 'info' },
  SHIPPED: { label: 'Despachado', tone: 'accent' },
  DELIVERED: { label: 'Entregado', tone: 'success' },
};

export const ORDER_STATUS_BADGE: Record<StoreOrderStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Abierto', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  EXPIRED: { label: 'Vencido', tone: 'neutral' },
};

export const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';

export function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}
