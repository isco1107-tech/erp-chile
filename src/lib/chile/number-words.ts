/**
 * Números enteros en palabras (español de Chile), para los montos de
 * contratos, finiquitos y certificados: "$1.250.000 (un millón doscientos
 * cincuenta mil pesos)".
 */

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function belowThousand(n: number): string {
  if (n === 100) return 'cien';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(HUNDREDS[hundreds]!);
  if (rest > 0) {
    if (rest < 30) parts.push(UNITS[rest]!);
    else {
      const tens = Math.floor(rest / 10);
      const units = rest % 10;
      parts.push(units === 0 ? TENS[tens]! : `${TENS[tens]} y ${UNITS[units]}`);
    }
  }
  return parts.join(' ');
}

/** "uno" pasa a "un" delante de un sustantivo (un millón, veintiún mil, un peso). */
function apocopate(words: string): string {
  return words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

function belowMillion(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands === 1) parts.push('mil');
  else if (thousands > 1) parts.push(`${apocopate(belowThousand(thousands))} mil`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** Entero no negativo en palabras (hasta billones). */
export function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'cero';
  const billions = Math.floor(n / 1_000_000_000_000);
  const millions = Math.floor((n % 1_000_000_000_000) / 1_000_000);
  const rest = n % 1_000_000;
  const parts: string[] = [];
  if (billions > 0) parts.push(billions === 1 ? 'un billón' : `${apocopate(belowMillion(billions))} billones`);
  if (millions > 0) parts.push(millions === 1 ? 'un millón' : `${apocopate(belowMillion(millions))} millones`);
  if (rest > 0) parts.push(belowMillion(rest));
  const words = parts.join(' ');
  return value < 0 ? `menos ${words}` : words;
}

/** Monto en pesos en palabras: "un millón doscientos mil pesos", "un peso". */
export function pesosInWords(amount: number): string {
  const n = Math.round(amount);
  if (Math.abs(n) === 1) return n < 0 ? 'menos un peso' : 'un peso';
  const words = numberToWords(n);
  // "un millón de pesos", pero "un millón doscientos mil pesos".
  const needsDe = /(millón|millones|billón|billones)$/.test(words);
  return `${apocopate(words)}${needsDe ? ' de' : ''} pesos`;
}
