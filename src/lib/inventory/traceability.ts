/**
 * Trazabilidad de un producto, como funciones puras (sin base de datos).
 *
 * Dos capas que se complementan:
 *  1. **Flujo por etapas** (tablero): a partir de los movimientos del kardex, las
 *     órdenes de compra por llegar y el stock actual, en qué etapa está la
 *     mercadería (en camino, recepcionada, en bodega, trasladada, vendida, perdida).
 *  2. **Series** (por unidad): un número de serie con su estado y su historia.
 *
 * Regla: nada se inventa. Una etapa sin datos queda vacía; los totales salen
 * solo de lo que está registrado.
 */

export const FLOW_STAGES = ['IN_TRANSIT', 'RECEIVED', 'IN_WAREHOUSE', 'TRANSFERRED', 'SOLD', 'LOST'] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];

export const FLOW_STAGE_LABELS: Record<FlowStage, string> = {
  IN_TRANSIT: 'En camino',
  RECEIVED: 'Recepcionado',
  IN_WAREHOUSE: 'En bodega',
  TRANSFERRED: 'Trasladado',
  SOLD: 'Vendido',
  LOST: 'Pérdidas y devoluciones',
};

export const FLOW_STAGE_HINTS: Record<FlowStage, string> = {
  IN_TRANSIT: 'Órdenes de compra enviadas que aún no llegan completas.',
  RECEIVED: 'Llegadas y entradas de mercadería en el período.',
  IN_WAREHOUSE: 'Lo que hay hoy en cada bodega, con sus lotes.',
  TRANSFERRED: 'Traslados entre bodegas en el período.',
  SOLD: 'Salidas por venta en el período.',
  LOST: 'Mermas, vencidos, faltantes y devoluciones al proveedor en el período.',
};

/** Períodos que se pueden mirar en el tablero (días). */
export const FLOW_WINDOW_DAYS = [7, 30, 90] as const;
export type FlowWindowDays = (typeof FLOW_WINDOW_DAYS)[number];
export const DEFAULT_FLOW_WINDOW: FlowWindowDays = 30;

export function parseFlowWindow(value: unknown): FlowWindowDays {
  const n = Number(value);
  return (FLOW_WINDOW_DAYS as readonly number[]).includes(n) ? (n as FlowWindowDays) : DEFAULT_FLOW_WINDOW;
}

export type MovementKind = 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER';

export interface FlowMovement {
  type: MovementKind;
  quantity: number;
  /** Stock de esa bodega antes y después: define si un traslado entró o salió. */
  previousStock: number;
  newStock: number;
}

/** Etapa en la que cae un movimiento del kardex. Un traslado cuenta por su pata de salida. */
export function stageOfMovement(movement: FlowMovement): FlowStage | null {
  switch (movement.type) {
    case 'PURCHASE_IN':
    case 'ADJUSTMENT_IN':
      return 'RECEIVED';
    case 'SALE_OUT':
      return 'SOLD';
    case 'ADJUSTMENT_OUT':
      return 'LOST';
    case 'TRANSFER':
      // Un traslado deja dos filas (salida y entrada): se cuenta una sola vez.
      return movement.newStock < movement.previousStock ? 'TRANSFERRED' : null;
    default:
      return null;
  }
}

export interface StageTotal {
  stage: FlowStage;
  /** Movimientos (o filas) que caen en la etapa. */
  count: number;
  /** Unidades que suman. */
  quantity: number;
}

/** Totales por etapa de los movimientos de un período. `IN_TRANSIT` e `IN_WAREHOUSE` se agregan aparte. */
export function summarizeMovementStages(movements: readonly FlowMovement[]): Record<'RECEIVED' | 'TRANSFERRED' | 'SOLD' | 'LOST', StageTotal> {
  const result = {
    RECEIVED: { stage: 'RECEIVED' as const, count: 0, quantity: 0 },
    TRANSFERRED: { stage: 'TRANSFERRED' as const, count: 0, quantity: 0 },
    SOLD: { stage: 'SOLD' as const, count: 0, quantity: 0 },
    LOST: { stage: 'LOST' as const, count: 0, quantity: 0 },
  };
  for (const movement of movements) {
    const stage = stageOfMovement(movement);
    if (stage === 'RECEIVED' || stage === 'TRANSFERRED' || stage === 'SOLD' || stage === 'LOST') {
      result[stage].count += 1;
      result[stage].quantity += movement.quantity;
    }
  }
  return result;
}

/** Lo que falta por llegar de una línea de orden de compra (nunca negativo). */
export function pendingQuantity(ordered: number, received: number): number {
  const pending = ordered - received;
  return pending > 1e-9 ? pending : 0;
}

/** Inicio de la ventana: «hace N días» desde `now`. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

// ─── Series ──────────────────────────────────────────────────────────────────

export const SERIAL_STATUSES = ['IN_STOCK', 'SOLD', 'LOST', 'RETURNED'] as const;
export type SerialStatus = (typeof SERIAL_STATUSES)[number];

export const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  IN_STOCK: 'En bodega',
  SOLD: 'Vendida',
  LOST: 'Perdida',
  RETURNED: 'Devuelta al proveedor',
};

export const SERIAL_EVENT_KINDS = ['REGISTERED', 'TRANSFERRED', 'SOLD', 'LOST', 'RETURNED', 'REOPENED'] as const;
export type SerialEventKind = (typeof SERIAL_EVENT_KINDS)[number];

export const SERIAL_EVENT_LABELS: Record<SerialEventKind, string> = {
  REGISTERED: 'Registrada en bodega',
  TRANSFERRED: 'Trasladada de bodega',
  SOLD: 'Vendida',
  LOST: 'Dada de baja como pérdida',
  RETURNED: 'Devuelta al proveedor',
  REOPENED: 'Vuelta a bodega',
};

/** Estados a los que se puede pasar una serie desde cada estado. */
const TRANSITIONS: Record<SerialStatus, readonly SerialStatus[]> = {
  IN_STOCK: ['SOLD', 'LOST', 'RETURNED'],
  // Una devolución de cliente, una pérdida que apareció o una devolución rechazada vuelven a bodega.
  SOLD: ['IN_STOCK'],
  LOST: ['IN_STOCK'],
  RETURNED: ['IN_STOCK'],
};

export function allowedSerialTransitions(from: SerialStatus): readonly SerialStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionSerial(from: SerialStatus, to: SerialStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Tipo de evento que deja un cambio de estado. */
export function eventKindForTransition(from: SerialStatus, to: SerialStatus): SerialEventKind {
  if (to === 'IN_STOCK') return from === 'IN_STOCK' ? 'REGISTERED' : 'REOPENED';
  if (to === 'SOLD') return 'SOLD';
  if (to === 'LOST') return 'LOST';
  return 'RETURNED';
}

export const MAX_SERIAL_LENGTH = 64;
export const MAX_SERIALS_PER_BATCH = 500;

const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9._\-/ ]*$/;

/** Serie en su forma canónica: sin espacios sobrantes y en mayúsculas. Devuelve `null` si no es válida. */
export function normalizeSerial(raw: string): string | null {
  const value = raw.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!value || value.length > MAX_SERIAL_LENGTH) return null;
  return SERIAL_PATTERN.test(value) ? value : null;
}

export interface ParsedSerials {
  serials: string[];
  /** Repetidas dentro del mismo texto (ya normalizadas). */
  duplicates: string[];
  /** Entradas que no son una serie válida, tal como se escribieron. */
  invalid: string[];
  /** Hay más de `MAX_SERIALS_PER_BATCH`: no se procesa nada. */
  tooMany: boolean;
}

/** Separa un texto pegado (una por línea, o con comas, punto y coma o tabuladores). */
export function parseSerialList(text: string): ParsedSerials {
  const seen = new Set<string>();
  const serials: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\n\r,;\t]+/)) {
    if (!part.trim()) continue;
    const normalized = normalizeSerial(part);
    if (!normalized) {
      invalid.push(part.trim().slice(0, 80));
      continue;
    }
    if (seen.has(normalized)) {
      if (!duplicates.includes(normalized)) duplicates.push(normalized);
      continue;
    }
    seen.add(normalized);
    serials.push(normalized);
  }
  return { serials, duplicates, invalid, tooMany: serials.length > MAX_SERIALS_PER_BATCH };
}

export type SerialCoverageState = 'NONE' | 'PARTIAL' | 'COMPLETE' | 'OVER';

export interface SerialCoverage {
  state: SerialCoverageState;
  /** Series en bodega registradas. */
  registered: number;
  /** Unidades de stock que aún no tienen serie (0 si ya sobran series). */
  missing: number;
  /** Series en bodega que exceden el stock (stock desactualizado o series mal marcadas). */
  extra: number;
}

/**
 * Compara el stock de una bodega con las series «en bodega» de esa bodega.
 * El stock puede ser fraccionario en productos a granel; aquí se redondea
 * hacia abajo porque una serie es una unidad entera.
 */
export function serialCoverage(stock: number, registered: number): SerialCoverage {
  const units = Math.max(0, Math.floor(stock + 1e-9));
  const missing = Math.max(0, units - registered);
  const extra = Math.max(0, registered - units);
  const state: SerialCoverageState = registered === 0 ? 'NONE' : extra > 0 ? 'OVER' : missing > 0 ? 'PARTIAL' : 'COMPLETE';
  return { state, registered, missing, extra };
}

export const SERIAL_COVERAGE_LABELS: Record<SerialCoverageState, string> = {
  NONE: 'Sin series registradas',
  PARTIAL: 'Series parciales',
  COMPLETE: 'Todas con serie',
  OVER: 'Más series que stock',
};

// ─── Línea de tiempo ─────────────────────────────────────────────────────────

export type TimelineSource = 'movement' | 'serial';

export interface TimelineEntry {
  id: string;
  at: Date;
  source: TimelineSource;
  title: string;
  detail: string | null;
  /** Quién lo hizo, si se sabe. */
  actor: string | null;
  /** Documento o referencia de origen, tal como se guardó. */
  reference: string | null;
  evidenceUrl: string | null;
  /** Etapa del flujo (solo movimientos). */
  stage: FlowStage | null;
}

/** Más reciente primero; a igual hora, por id para que el orden sea estable. */
export function sortTimeline<T extends Pick<TimelineEntry, 'at' | 'id'>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
}

/** Texto de un lote movido: «Lote A12 (vence 2026-12-01) × 3». */
export function describeLotAllocations(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const parts: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const lot = typeof record.lotNumber === 'string' ? record.lotNumber : null;
    const qty = typeof record.quantity === 'number' ? record.quantity : null;
    if (!lot || qty === null) continue;
    const expiry = typeof record.expiryDate === 'string' && record.expiryDate ? ` (vence ${record.expiryDate.slice(0, 10)})` : '';
    parts.push(`Lote ${lot}${expiry} × ${qty}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// ─── Series en el flujo y garantía ───────────────────────────────────────────

/** Suma meses a una fecha sin pasarse de fin de mes (31-ene + 1 mes = 28/29-feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export type WarrantyState = 'NONE' | 'ACTIVE' | 'EXPIRED';

export interface WarrantyStatus {
  state: WarrantyState;
  /** Días que le quedan (solo `ACTIVE`; 0 = vence hoy). */
  daysLeft: number | null;
}

/** Estado de la garantía de una serie. Sin fecha de fin no hay garantía definida: no se inventa una. */
export function warrantyStatus(until: Date | null, now: Date): WarrantyStatus {
  if (!until) return { state: 'NONE', daysLeft: null };
  const diff = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
  return diff >= 0 ? { state: 'ACTIVE', daysLeft: diff } : { state: 'EXPIRED', daysLeft: null };
}

export const WARRANTY_LABELS: Record<WarrantyState, string> = {
  NONE: 'Sin garantía definida',
  ACTIVE: 'En garantía',
  EXPIRED: 'Garantía vencida',
};

/**
 * Una serie por unidad: la cantidad debe ser un entero y las series, tantas como
 * unidades y sin repetirse. Devuelve el mensaje del problema o `null` si está bien.
 */
export function serialCountProblem(quantity: number, serials: readonly string[], productName?: string): string | null {
  const label = productName ? ` de «${productName}»` : '';
  if (!Number.isInteger(quantity) || quantity <= 0) return `Un producto con serie se mueve en unidades enteras${label}`;
  if (serials.length !== quantity) {
    return `Indica ${quantity === 1 ? 'la serie' : `las ${quantity} series`}${label}: llegaron ${serials.length}`;
  }
  if (new Set(serials).size !== serials.length) return `Hay series repetidas${label}`;
  return null;
}
