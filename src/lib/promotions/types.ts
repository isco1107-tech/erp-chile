/**
 * Liquidaciones y promociones: tipos del núcleo puro (sin Prisma, sin I/O).
 *
 * Una `Promotion` rebaja un % el precio de los productos que cumplen sus
 * reglas, dentro de una vigencia. Nunca se apilan: en una línea de venta rige
 * UNA sola promoción (la de mayor descuento, ver `apply.ts`).
 */

/** Tope de descuento permitido: 90 % (9000 puntos base). */
export const MAX_PERCENT_BPS = 9000;

/** Fecha calendario `YYYY-MM-DD` (sin hora ni zona: evita el corrimiento de un día). */
export type CalendarDay = string;

/** Reglas hoja. Las de vencimiento miran lotes; las demás, el producto. */
export type LeafRule =
  /** El lote vence ANTES de esa fecha (estricto) y aún no venció. */
  | { type: 'EXPIRY_BEFORE'; date: CalendarDay }
  /** El lote vence dentro de los próximos `days` días (0 = vence hoy) y aún no venció. */
  | { type: 'EXPIRY_WITHIN_DAYS'; days: number }
  | { type: 'CATEGORY'; ids: string[] }
  | { type: 'PRODUCER'; ids: string[] }
  | { type: 'PRODUCTS'; ids: string[] };

/**
 * Combinadores simples. `ALL` = AND, `ANY` = OR. Un combinador SIN reglas no
 * coincide con nada (un AND vacío sería "todo el catálogo" y liquidaría
 * productos por un descuido).
 */
export type PromotionRule = LeafRule | { type: 'ALL'; rules: PromotionRule[] } | { type: 'ANY'; rules: PromotionRule[] };

export interface Promotion {
  id: string;
  name: string;
  /** Descuento en puntos base: 1000 = 10 %. Entero entre 0 y 9000. */
  percentBps: number;
  /** Inicio de vigencia (instante, inclusive). */
  startsAt: Date;
  /**
   * Fin de vigencia (instante, EXCLUSIVO) o `null` si no vence. Para "hasta el
   * 25 inclusive" usar `dayWindow` (dates.ts): fija el fin en la medianoche de
   * Santiago del 26.
   */
  endsAt: Date | null;
  rules: PromotionRule;
  isActive: boolean;
  /** Siempre `false`: las promociones no se apilan. */
  stackable: false;
}

/** Lote mínimo del catálogo (equivale a `InventoryLot`). */
export interface CatalogLot {
  lotNumber: string;
  /** Vencimiento; por convención de `parseExpiryDate`, mediodía UTC del día calendario. */
  expiresAt: Date | null;
  quantity: number;
}

/** Producto mínimo del catálogo para seleccionar promociones. */
export interface CatalogProduct {
  id: string;
  name: string;
  categoryId: string | null;
  producerId: string | null;
  /** Costo unitario vigente (PMP) en CLP; `null` si se desconoce. */
  cost?: number | null;
  lots: CatalogLot[];
}
