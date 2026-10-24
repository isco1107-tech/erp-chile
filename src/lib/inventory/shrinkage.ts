import { WASTE_REASONS, type WasteReason } from '@/lib/warehouse-mobile/modes';

/**
 * Mermas con responsable (Inventario): quién responde por cada pérdida, la
 * tienda o el proveedor/productor, para que la liquidación no termine en
 * discusión. Funciones puras.
 *
 * Reglas:
 * - El responsable sugerido sale de lo que la EMPRESA definió por motivo
 *   (sus acuerdos con cada productor); sin definición no hay sugerencia y la
 *   pérdida queda "sin asignar". No se inventa un reparto.
 * - Si responde el proveedor, tiene que quedar claro CUÁL: el de la llegada
 *   del movimiento o, si el producto tiene uno solo, ese. Con varios y sin
 *   llegada, decide una persona.
 * - Los motivos son los de `WASTE_REASONS` (lista cerrada que nunca se
 *   renombra) más `NONE` para las salidas sin motivo (faltantes de un conteo).
 */

export const LIABLE_PARTIES = ['STORE', 'SUPPLIER'] as const;
export type LiableParty = (typeof LIABLE_PARTIES)[number];

export const LIABLE_PARTY_LABELS: Record<LiableParty, string> = {
  STORE: 'La tienda',
  SUPPLIER: 'El proveedor',
};

/** Motivos que pueden tener un responsable por defecto: los de la app de bodega y "sin motivo". */
export const SHRINKAGE_REASON_KEYS = [...WASTE_REASONS, 'NONE'] as const;
export type ShrinkageReasonKey = WasteReason | 'NONE';

export const EXPIRY_ALERT_DAY_OPTIONS = [3, 7, 15, 30] as const;
export const DEFAULT_SHRINKAGE_SETTINGS = { expiryAlerts: true, expiryAlertDays: 7 };

export function isLiableParty(value: unknown): value is LiableParty {
  return typeof value === 'string' && (LIABLE_PARTIES as readonly string[]).includes(value);
}

export const reasonKey = (reasonCode: string | null | undefined): ShrinkageReasonKey =>
  reasonCode && (WASTE_REASONS as readonly string[]).includes(reasonCode) ? (reasonCode as WasteReason) : 'NONE';

export interface LiabilitySuggestion {
  party: LiableParty;
  supplierId: string | null;
}

/**
 * Responsable sugerido para una salida. `null` si la empresa no definió nada
 * para ese motivo, o si corresponde al proveedor pero no se sabe cuál.
 */
export function suggestLiability(input: {
  reasonCode: string | null;
  defaults: Partial<Record<ShrinkageReasonKey, LiableParty>>;
  /** Proveedor de la llegada registrada en el propio movimiento, si lo hay. */
  movementSupplierId: string | null;
  /** Proveedores del producto (`ProductSupplier`). */
  productSupplierIds: readonly string[];
}): LiabilitySuggestion | null {
  const party = input.defaults[reasonKey(input.reasonCode)];
  if (!party) return null;
  if (party === 'STORE') return { party, supplierId: null };
  const supplierId = input.movementSupplierId ?? (input.productSupplierIds.length === 1 ? input.productSupplierIds[0]! : null);
  return supplierId ? { party, supplierId } : null;
}

export type LiabilityState = 'STORE' | 'SUPPLIER' | 'UNASSIGNED';

export interface ShrinkageSummaryInput {
  quantity: number;
  /** `null` si quien mira no puede ver costos. */
  totalCost: number | null;
  state: LiabilityState;
  supplier: { id: string; name: string } | null;
}

export interface ShrinkageSummary {
  movements: number;
  units: number;
  cost: number | null;
  byState: Record<LiabilityState, { movements: number; units: number; cost: number | null }>;
  /** Pérdidas confirmadas a cargo de cada proveedor, de mayor a menor costo (o unidades). */
  bySupplier: Array<{ id: string; name: string; movements: number; units: number; cost: number | null }>;
}

export function summarizeShrinkage(rows: readonly ShrinkageSummaryInput[], includeCosts: boolean): ShrinkageSummary {
  const bucket = () => ({ movements: 0, units: 0, cost: includeCosts ? 0 : null });
  const byState: ShrinkageSummary['byState'] = { STORE: bucket(), SUPPLIER: bucket(), UNASSIGNED: bucket() };
  const suppliers = new Map<string, ShrinkageSummary['bySupplier'][number]>();
  let units = 0;
  let cost = 0;
  for (const row of rows) {
    units += row.quantity;
    cost += row.totalCost ?? 0;
    const state = byState[row.state];
    state.movements += 1;
    state.units += row.quantity;
    if (state.cost !== null) state.cost += row.totalCost ?? 0;
    if (row.state === 'SUPPLIER' && row.supplier) {
      const entry = suppliers.get(row.supplier.id) ?? { id: row.supplier.id, name: row.supplier.name, ...bucket() };
      entry.movements += 1;
      entry.units += row.quantity;
      if (entry.cost !== null) entry.cost += row.totalCost ?? 0;
      suppliers.set(row.supplier.id, entry);
    }
  }
  return {
    movements: rows.length,
    units,
    cost: includeCosts ? cost : null,
    byState,
    bySupplier: [...suppliers.values()].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.units - a.units || a.name.localeCompare(b.name, 'es')),
  };
}

/** Avisa de un lote el día que faltan `alertDays` para que venza y el día en que vence. */
export function isExpiryAlertDay(daysToExpiry: number, alertDays: number): boolean {
  return daysToExpiry === alertDays || daysToExpiry === 0;
}

export const LIABILITY_STATES = ['UNASSIGNED', 'STORE', 'SUPPLIER'] as const satisfies readonly LiabilityState[];

export const LIABILITY_STATE_LABELS: Record<LiabilityState, string> = {
  UNASSIGNED: 'Sin asignar',
  STORE: 'La tienda',
  SUPPLIER: 'El proveedor',
};

export const isLiabilityState = (value: unknown): value is LiabilityState =>
  typeof value === 'string' && (LIABILITY_STATES as readonly string[]).includes(value);

/** Días que se miran si el filtro no trae fechas: los últimos 30 hasta hoy. */
export const DEFAULT_PERIOD_DAYS = 30;

/** Un día `YYYY-MM-DD` que existe en el calendario (sin 31 de febrero). */
export function isCalendarDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const shiftDay = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Período del filtro: las fechas válidas que lleguen (en orden) o los últimos 30 días hasta hoy. */
export function resolvePeriod(from: string | undefined, to: string | undefined, today: string): { from: string; to: string } {
  const end = isCalendarDay(to) ? to : today;
  const start = isCalendarDay(from) ? from : shiftDay(end, -(DEFAULT_PERIOD_DAYS - 1));
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}
