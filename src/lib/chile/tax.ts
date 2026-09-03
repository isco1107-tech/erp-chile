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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default { calculateNeto, calculateIva, calculateTotal, formatCurrency };
