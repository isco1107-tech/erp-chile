/**
 * Efectivo en el mostrador: vuelto y montos sugeridos. CLP en enteros; los
 * billetes vigentes en Chile son $1.000, $2.000, $5.000, $10.000 y $20.000.
 */
export const CASH_BILLS = [1000, 2000, 5000, 10000, 20000] as const;

/** Cuántos dígitos acepta el campo de efectivo recibido (el esquema del servidor exige un entero). */
export const MAX_CASH_DIGITS = 9;

/** Solo dígitos: el campo ignora cualquier otra tecla que entregue el teclado o el lector. */
export function parseCashDigits(input: string): number {
  const digits = input.replace(/\D/g, '').slice(0, MAX_CASH_DIGITS);
  return digits ? Number(digits) : 0;
}

/** Positivo = vuelto; negativo = lo que falta. */
export function changeFor(total: number, received: number): number {
  return received - total;
}

/**
 * Montos con los que suele pagar el cliente, de menor a mayor, sin repetir el
 * total exacto (que tiene su propio botón). Se redondea el total hacia arriba
 * a mil, cinco mil, diez mil y veinte mil, y se suman los billetes que lo
 * cubren: con $3.490 salen 4.000, 5.000, 10.000 y 20.000.
 */
export function suggestTenders(total: number, limit = 4): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const options = new Set<number>();
  for (const step of [1000, 5000, 10000, 20000]) options.add(Math.ceil(total / step) * step);
  for (const bill of CASH_BILLS) if (bill >= total) options.add(bill);
  options.delete(total);
  return [...options].sort((a, b) => a - b).slice(0, limit);
}
