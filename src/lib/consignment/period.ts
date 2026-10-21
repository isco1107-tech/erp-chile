import { santiagoMidnightUtc } from '@/lib/chile/timezone';

/**
 * Límites de un período de liquidación. `from` y `to` son DÍAS (fechas sin
 * hora, como las entrega un `<input type="date">`): se toman sus componentes
 * UTC y se llevan al calendario de Santiago, igual que `periodBounds` del F29,
 * para que una venta de las 23:30 del último día no caiga en el período
 * siguiente. El límite superior es exclusivo (medianoche del día siguiente).
 */
export function settlementPeriodBounds(from: Date, to: Date): { from: Date; toExclusive: Date } {
  const next = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
  return {
    from: santiagoMidnightUtc(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()),
    toExclusive: santiagoMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}
