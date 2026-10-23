/**
 * Un monto en pesos escrito por una persona, como entero con signo, o `null` si no es un monto válido.
 *
 * En CLP el punto separa miles ("3.000" son tres mil, no tres), así que el punto solo vale como
 * separador de miles bien puesto y la coma o los decimales se rechazan: un monto mal leído en
 * silencio (3.000 → 3) movería plata de verdad. Acepta "1500", "-1.500", "+3.000" y "$ 2.000".
 */
export function parseClpAmount(input: string): number | null {
  const text = input.trim().replace(/\s/g, '').replace(/^([+-]?)\$/, '$1');
  const match = /^([+-])?(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(text);
  if (!match) return null;
  const value = Number(`${match[1] === '-' ? '-' : ''}${match[2]!.replace(/\./g, '')}`);
  return Number.isSafeInteger(value) ? value : null;
}
