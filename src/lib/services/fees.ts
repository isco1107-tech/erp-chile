/**
 * Cálculo puro de retención de 2ª categoría sobre una Boleta de Honorarios
 * Electrónica (BHE). Sin `server-only` a propósito: se reutiliza tal cual
 * desde el formulario cliente (`FeeDocumentForm`) para la vista previa en
 * vivo, y desde `fees.service.ts` en el servidor para el cálculo real que se
 * persiste. Mismo criterio que `src/modules/sales/calc.ts`.
 */

export interface FeeAmounts {
  retentionAmount: number;
  netToPay: number;
}

/** `retentionRateBps` en basis points (1375 = 13.75%). Redondeo aritmético estándar, igual que el resto de la app. */
export function calculateFeeAmounts(grossAmount: number, retentionRateBps: number): FeeAmounts {
  const retentionAmount = Math.round((grossAmount * retentionRateBps) / 10000);
  return { retentionAmount, netToPay: grossAmount - retentionAmount };
}
