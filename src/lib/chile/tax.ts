const IVA_RATE = 0.19;

export function calculateNeto(total: number): number {
  return Math.round(total / (1 + IVA_RATE));
}

export function calculateIva(neto: number): number {
  return Math.round(neto * IVA_RATE);
}

export function calculateTotal(neto: number): number {
  return neto + calculateIva(neto);
}

/**
 * Precio de venta al público de un producto del catálogo.
 *
 * Un producto exento no lleva IVA, así que su bruto es su propio neto. Cada
 * punto que persistía `Product.grossPrice` aplicaba `calculateTotal` a ciegas,
 * de modo que un exento quedaba guardado con un 19% que nunca se le cobra: el
 * mostrador del POS exhibía un precio y la boleta cobraba otro.
 */
export function calculateGrossPrice(neto: number, isExempt: boolean): number {
  return isExempt ? neto : calculateTotal(neto);
}

/**
 * Neto que hay que guardar para que el público pague el precio con IVA que se
 * escribió. El IVA se calcula SOBRE el neto y se redondea, así que no todo
 * precio final es alcanzable (con $1.990 sí: neto $1.672 → $1.990; hay montos
 * que caen entre dos netos). Se busca un neto que dé exactamente ese precio y,
 * si no existe, el más cercano, avisando con `exact: false`.
 */
export function netPriceForGross(gross: number, isExempt: boolean): { net: number; exact: boolean } {
  if (!Number.isFinite(gross) || gross <= 0) return { net: 0, exact: gross === 0 };
  const rounded = Math.round(gross);
  if (isExempt) return { net: rounded, exact: rounded === gross };
  const base = calculateNeto(rounded);
  for (const candidate of [base, base - 1, base + 1]) {
    if (candidate >= 0 && calculateTotal(candidate) === gross) return { net: candidate, exact: true };
  }
  return { net: base, exact: false };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default { calculateNeto, calculateIva, calculateTotal, formatCurrency };
