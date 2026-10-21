import { formatCurrency } from '@/lib/chile/tax';

export { formatCurrency };

/** Puntos base -> texto de porcentaje ("20%", "12,5%"). */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
}

/** "12,5" o "12.5" -> 1250 puntos base; null si no es un número válido. */
export function percentToBps(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || text.trim() === '') return null;
  return Math.round(value * 100);
}

export function formatDay(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

export const COMMISSION_BASE_LABEL = { NET: 'Sobre el neto', GROSS: 'Sobre el total con IVA' } as const;
