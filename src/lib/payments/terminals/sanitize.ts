import { redact } from '@/lib/observability/redact';

/**
 * Datos de tarjeta que jamás deben quedar guardados, aunque el proveedor los
 * mande: el ERP solo conserva los últimos 4 dígitos (`last4`).
 */
const CARD_DATA_KEY = /^(pan|card_?number|cardno|cvv2?|cvc2?|track[123]?|expir\w*|exp_?(date|month|year))$/i;

function stripCardData(value: unknown, depth: number): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => stripCardData(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = CARD_DATA_KEY.test(key) ? '[redactado]' : stripCardData(item, depth + 1);
  }
  return output;
}

/** Copia del cuerpo original apta para guardar: sin secretos, sin datos de tarjeta, acotada en tamaño. */
export function sanitizeRaw(source: unknown): Record<string, unknown> {
  const cleaned = redact(stripCardData(source, 0));
  if (cleaned !== null && typeof cleaned === 'object' && !Array.isArray(cleaned)) {
    return cleaned as Record<string, unknown>;
  }
  return { value: cleaned };
}

/** Solo los últimos 4 dígitos de lo que venga; undefined si no hay 4 dígitos. */
export function toLast4(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

/** CLP entero positivo; lanza con mensaje claro si no lo es. */
export function assertValidAmountClp(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`Monto inválido: ${amount}. Debe ser un entero positivo en CLP`);
  }
}
