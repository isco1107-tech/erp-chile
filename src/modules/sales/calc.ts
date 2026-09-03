import { calculateIva } from '@/lib/chile/tax';

export interface LineItemInput {
  unitPrice: number;
  quantity: number;
  discountPercent?: number;
  isExempt?: boolean;
}

export interface LineItemTotals {
  subtotal: number;
  iva: number;
  total: number;
}

export interface DocumentTotals {
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
}

export interface ComputedDocument<T> {
  items: Array<T & LineItemTotals>;
  totals: DocumentTotals;
}

/**
 * Regla única de límite de crédito, compartida entre el chequeo del servidor
 * (`sales.service.ts`, que bloquea la emisión) y el aviso del formulario de
 * venta (`SalesDocumentForm.tsx`, que solo informa antes de intentar) — para
 * que nunca queden desincronizados sobre qué cuenta como "excede el límite".
 * `creditLimit: null` significa "sin límite configurado", nunca excede.
 */
export function exceedsCreditLimit(params: {
  creditLimit: number | null;
  outstandingBalance: number;
  documentTotal: number;
}): boolean {
  if (params.creditLimit == null) return false;
  return params.outstandingBalance + params.documentTotal > params.creditLimit;
}

/** Neto de una línea en CLP entero, ya con descuento aplicado. */
export function computeLineSubtotal(item: LineItemInput): number {
  const lineGross = item.unitPrice * item.quantity;
  const discount = lineGross * ((item.discountPercent ?? 0) / 100);
  return Math.round(lineGross - discount);
}

/**
 * Reparte un IVA total entero entre las líneas afectas, proporcionalmente a su
 * neto, usando el método del resto mayor. Garantiza `sum(resultado) === ivaTotal`
 * exactamente, sin perder ni inventar pesos por redondeo.
 */
function distributeIva(subtotals: number[], ivaTotal: number): number[] {
  const net = subtotals.reduce((sum, s) => sum + s, 0);
  if (net <= 0 || ivaTotal === 0) return subtotals.map(() => 0);

  const exact = subtotals.map((s) => (s * ivaTotal) / net);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = ivaTotal - floors.reduce((sum, v) => sum + v, 0);

  // Los pesos sobrantes van a las líneas con mayor parte fraccionaria.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] = result[i]! + 1;
    remainder--;
  }
  return result;
}

/**
 * Calcula líneas y totales de un documento tributario.
 *
 * El IVA se redondea UNA sola vez sobre el neto agregado, no línea a línea: el
 * SII espera un único campo IVA sobre MntNeto, y redondear por línea y sumar
 * produce descuadres (3 líneas de $1.001 daban 570 en vez de 571). El IVA por
 * línea que se persiste es el reparto de ese total, y suma exactamente igual.
 */
export function computeDocument<T extends LineItemInput>(lines: T[]): ComputedDocument<T> {
  const subtotals = lines.map(computeLineSubtotal);

  const netAmount = subtotals.reduce((sum, s, i) => (lines[i]!.isExempt ? sum : sum + s), 0);
  const exemptAmount = subtotals.reduce((sum, s, i) => (lines[i]!.isExempt ? sum + s : sum), 0);
  const ivaAmount = calculateIva(netAmount);

  // Solo las líneas afectas participan del reparto; las exentas quedan en 0.
  const affectedSubtotals = subtotals.map((s, i) => (lines[i]!.isExempt ? 0 : s));
  const perLineIva = distributeIva(affectedSubtotals, ivaAmount);

  const items = lines.map((line, i) => ({
    ...line,
    subtotal: subtotals[i]!,
    iva: perLineIva[i]!,
    total: subtotals[i]! + perLineIva[i]!,
  }));

  return {
    items,
    totals: { netAmount, exemptAmount, ivaAmount, totalAmount: netAmount + exemptAmount + ivaAmount },
  };
}
