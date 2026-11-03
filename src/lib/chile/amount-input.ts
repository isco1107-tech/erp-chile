/**
 * Montos en CLP escritos a mano. En Chile «50.000» son cincuenta mil pesos,
 * pero un `<input type="number">` lee el punto como decimal y entrega 50: un
 * fondo de caja, un arqueo o un cobro quedaban registrados por mil veces menos.
 * Estas funciones aceptan lo que la persona escriba (puntos, espacios, `$`) y
 * se quedan solo con los dígitos.
 */

/** Tope de dígitos: un entero seguro y de sobra para cualquier monto real. */
export const MAX_AMOUNT_DIGITS = 12;

const GROUPER = new Intl.NumberFormat('es-CL');

/**
 * Solo los dígitos, sin ceros a la izquierda sobrantes ('' si no hay ninguno).
 * Una coma decimal corta lo que viene después («1.500,50» → «1500»): el peso no
 * tiene centavos y sumar esos dígitos daría $150.050.
 */
export function amountDigits(raw: string): string {
  const integerPart = raw.split(',')[0] ?? '';
  return integerPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_AMOUNT_DIGITS);
}

/** «50000» → «50.000» para mostrarlo mientras se escribe. */
export function formatAmountDigits(digits: string): string {
  const clean = amountDigits(digits);
  return clean === '' ? '' : GROUPER.format(Number(clean));
}

/** El monto escrito como número, o `null` si el campo está vacío. */
export function parseAmountDigits(digits: string): number | null {
  const clean = amountDigits(digits);
  return clean === '' ? null : Number(clean);
}
