/**
 * Datos de presentación de los DTE recibidos, sin dependencias de servidor:
 * los usa tanto la bandeja (cliente) como el servicio.
 */

/** Nombres de los tipos de documento que un proveedor puede enviar. */
export const RECEIVED_DTE_LABELS: Record<number, string> = {
  33: 'Factura electrónica',
  34: 'Factura exenta electrónica',
  39: 'Boleta electrónica',
  41: 'Boleta exenta electrónica',
  43: 'Liquidación factura electrónica',
  46: 'Factura de compra electrónica',
  52: 'Guía de despacho electrónica',
  56: 'Nota de débito electrónica',
  61: 'Nota de crédito electrónica',
  110: 'Factura de exportación electrónica',
  111: 'Nota de débito de exportación',
  112: 'Nota de crédito de exportación',
};

export function receivedDteLabel(code: number): string {
  return RECEIVED_DTE_LABELS[code] ?? `Documento tipo ${code}`;
}

/**
 * Plazo para reclamar el contenido de una factura (Ley 19.983): 8 días
 * corridos desde su recepción. Pasado ese plazo se entiende aceptada.
 */
export const CLAIM_WINDOW_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

export function claimDeadline(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + CLAIM_WINDOW_DAYS * DAY_MS);
}

/**
 * Días que quedan para reclamar, contando el día en curso: recién cargado da
 * 8, a menos de 24 horas del vencimiento da 1 ("último día"). Negativo cuando
 * el plazo ya venció (-1 recién vencido).
 */
export function claimDaysLeft(receivedAt: Date, now: Date): number {
  const remaining = claimDeadline(receivedAt).getTime() - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : Math.floor(remaining / DAY_MS);
}
