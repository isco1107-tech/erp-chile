import { z } from 'zod';

/**
 * Comisión de la mercadería en consignación. Puro: sin base de datos.
 *
 * La comisión es lo que se queda la empresa de cada venta; el resto es del seller. Se guarda en
 * puntos base enteros (1500 = 15 %) para no arrastrar decimales de punto flotante, y el monto
 * que recibe el seller se congela en la línea de venta, así que cambiar la comisión después no
 * toca lo ya vendido.
 */

/** Tope de la comisión: 100 %. */
export const MAX_COMMISSION_BPS = 10_000;

export function isValidCommissionBps(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COMMISSION_BPS;
}

/** 15,5 % → 1550. Redondea al punto base más cercano. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** 1550 → 15,5. */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Cómo se escribe una comisión guardada en el campo del formulario: 1550 → "15,5". */
export function bpsToInput(bps: number): string {
  return String(bpsToPercent(bps)).replace('.', ',');
}

/** Esquema de una comisión en puntos base, compartido por contactos y productos. */
export const commissionBpsSchema = z
  .number()
  .int('La comisión debe ser un número entero de puntos base')
  .min(0, 'La comisión no puede ser negativa')
  .max(MAX_COMMISSION_BPS, 'La comisión no puede superar el 100 %');

/**
 * Lo que la persona escribe en el formulario ("15", "15,5", "15.5", "15 %") como puntos base,
 * o `null` si no es un porcentaje entre 0 y 100. Un campo vacío también es `null`: la comisión
 * de un seller es obligatoria y no se inventa un valor.
 */
export function parseCommissionPercent(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().replace('%', '').trim().replace(',', '.');
  if (text === '' || !/^\d+(\.\d+)?$/.test(text)) return null;
  const bps = percentToBps(Number(text));
  return isValidCommissionBps(bps) ? bps : null;
}

/** Cómo se muestra una comisión: `15 %`, `15,5 %`. */
export function formatCommission(bps: number): string {
  const percent = bpsToPercent(bps);
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(percent)} %`;
}

/**
 * La comisión que manda: la del producto si la tiene, y si no la del seller. `null` solo si
 * ninguna está definida (un seller siempre trae la suya, así que no debería ocurrir).
 */
export function effectiveCommissionBps(productBps: number | null | undefined, sellerBps: number | null | undefined): number | null {
  if (isValidCommissionBps(productBps)) return productBps;
  if (isValidCommissionBps(sellerBps)) return sellerBps;
  return null;
}

/** Comisión de una línea con neto `netAmount` (CLP entero). `Math.round`, igual que el resto del sistema. */
export function commissionOf(netAmount: number, bps: number): number {
  return Math.round((netAmount * bps) / MAX_COMMISSION_BPS);
}
