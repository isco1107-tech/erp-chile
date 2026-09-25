export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function formatRut(rut: string): string {
  const c = cleanRut(rut);
  if (c.length < 2) return c;
  const dv = c.slice(-1);
  const num = c.slice(0, -1);
  const parts: string[] = [];
  for (let i = num.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(num.slice(start, i));
  }
  return parts.join('.') + '-' + dv;
}

export function validateRut(rut: string): boolean {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const dv = c.slice(-1);
  const nums = c.slice(0, -1).split('').reverse();
  let multiplier = 2;
  let sum = 0;
  for (const n of nums) {
    const digit = parseInt(n, 10);
    if (Number.isNaN(digit)) return false;
    sum += digit * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  let expected = '';
  if (remainder === 11) expected = '0';
  else if (remainder === 10) expected = 'K';
  else expected = String(remainder);
  return expected === dv;
}

/**
 * RUT comparable entre fuentes distintas (XML del SII, CSV del RCV, ficha del
 * contacto): sin puntos ni guion, sin ceros a la izquierda, DV en mayúscula.
 */
export function rutKey(rut: string): string {
  return cleanRut(rut).replace(/^0+/, '');
}

export default { cleanRut, formatRut, validateRut };
