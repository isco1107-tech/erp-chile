/**
 * Lotes con vencimiento, como funciones puras. Las salidas de un producto
 * con `tracksLots` consumen primero el lote que vence antes (FEFO: first
 * expired, first out); los lotes sin fecha van al final y, entre iguales,
 * el más antiguo primero.
 */

/** Lote al que va lo que entra sin lote informado (compras previas, devoluciones). */
export const NO_LOT = 'SIN-LOTE';

export interface LotBalance {
  lotNumber: string;
  expiryDate: Date | null;
  quantity: number;
  createdAt: Date;
}

/** Alias (no interfaz) para poder guardarse tal cual en una columna Json. */
export type LotAllocation = {
  lotNumber: string;
  expiryDate: string | null;
  quantity: number;
};

const EPSILON = 1e-9;

export function fefoOrder<T extends Pick<LotBalance, 'expiryDate' | 'createdAt'>>(lots: readonly T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Reparte una salida entre lotes por FEFO. Si los lotes no alcanzan (stock
 * previo a los lotes, o stock negativo permitido), lo que falta queda sin
 * asignar: el stock del producto sigue siendo la fuente de verdad.
 */
export function allocateFefo(lots: readonly LotBalance[], quantity: number): { allocations: LotAllocation[]; unallocated: number } {
  let remaining = quantity;
  const allocations: LotAllocation[] = [];
  for (const lot of fefoOrder(lots.filter((l) => l.quantity > EPSILON))) {
    if (remaining <= EPSILON) break;
    const take = Math.min(lot.quantity, remaining);
    allocations.push({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate?.toISOString() ?? null, quantity: take });
    remaining -= take;
  }
  return { allocations, unallocated: remaining > EPSILON ? remaining : 0 };
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none';

/** Días que faltan para vencer (negativo = vencido), en días calendario. */
export function daysToExpiry(expiryDate: Date, now: Date): number {
  return Math.floor((expiryDate.getTime() - now.getTime()) / 86_400_000);
}

export function expiryStatus(expiryDate: Date | null, now: Date, soonDays = 30): ExpiryStatus {
  if (!expiryDate) return 'none';
  const days = daysToExpiry(expiryDate, now);
  if (days < 0) return 'expired';
  if (days <= soonDays) return 'soon';
  return 'ok';
}

/**
 * Vencimiento desde un `<input type="date">` (YYYY-MM-DD). Se guarda a
 * mediodía UTC: así cae en el mismo día calendario en UTC y en Santiago, y
 * no se corre un día al mostrarlo.
 */
export function parseExpiryDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.getUTCDate() === Number(match[3]) ? date : null;
}

/** Normaliza un número de lote: sin espacios sobrantes, en mayúsculas. */
export function normalizeLotNumber(value: string | null | undefined): string {
  const lot = (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return lot || NO_LOT;
}
