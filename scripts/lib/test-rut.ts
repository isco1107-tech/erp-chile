import { validateRut, formatRut, cleanRut } from '../../src/lib/chile/rut';

/** Genera un RUT válido (Módulo 11) a partir de un número base cualquiera. */
export function generateValidRut(base: number): string {
  let sum = 0;
  let multiplier = 2;
  for (const digit of String(base).split('').reverse()) {
    sum += Number(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const dv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  const rut = `${base}-${dv}`;
  if (!validateRut(rut)) throw new Error(`Generador de RUT produjo un RUT inválido: ${rut}`);
  return rut;
}

/** RUT válido, único por corrida, listo para usar en cualquier script de verificación. */
export function generateValidRutForTest(): string {
  const base = 70000000 + (Date.now() % 9000000) + Math.floor(Math.random() * 900);
  return formatRut(cleanRut(generateValidRut(base)));
}
