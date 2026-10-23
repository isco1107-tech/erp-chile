import type { SellerSettlementStatus } from '@prisma/client';
import type { Tone } from '@/components/ui/tone';

/** Fecha corta en hora de Chile (las fechas se guardan en UTC; el día que se ve es el de Santiago). */
export function formatShortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

export const SETTLEMENT_STATUS_BADGE: Record<SellerSettlementStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: 'Por pagar', tone: 'warning' },
  PAID: { label: 'Pagada', tone: 'success' },
  VOIDED: { label: 'Anulada', tone: 'neutral' },
};
