/**
 * Código de barras Code 128 (subconjunto B: ASCII imprimible), en TS puro,
 * para las etiquetas de productos. Code 128 lo leen todos los lectores de
 * caja y admite SKU alfanuméricos; los EAN-13 también se imprimen como
 * Code 128 con el mismo número.
 *
 * Cada símbolo son 6 barras/espacios alternados (anchos 1-4 módulos, 11
 * módulos en total); el de parada tiene 7 (13 módulos).
 */

// Patrones 0..106 (ISO/IEC 15417), como anchos de barra/espacio alternados.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Si el texto se puede codificar en Code 128 B (ASCII 32-126). */
export function isEncodable(text: string): boolean {
  return text.length > 0 && text.length <= 80 && /^[\x20-\x7e]+$/.test(text);
}

/** Valores de símbolo: inicio B, datos, dígito verificador (módulo 103) y parada. */
export function code128Values(text: string): number[] {
  if (!isEncodable(text)) throw new Error('El código solo admite caracteres ASCII imprimibles (máximo 80)');
  const data = [...text].map((char) => char.charCodeAt(0) - 32);
  const checksum = data.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Anchos alternados barra/espacio de todo el código (sin zonas de silencio). */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((value) => [...PATTERNS[value]!].map(Number));
}

/**
 * Rectángulos de barras en módulos: `[x, ancho]`. Con zona de silencio de 10
 * módulos a cada lado, como exige el estándar.
 */
export function code128Bars(text: string, quietZone = 10): { bars: [number, number][]; totalModules: number } {
  const widths = code128Widths(text);
  const bars: [number, number][] = [];
  let x = quietZone;
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push([x, width]);
    x += width;
  });
  return { bars, totalModules: x + quietZone };
}

/** Dígito verificador EAN-13 (para validar o completar un código de 12 dígitos). */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('Se esperan 12 dígitos');
  const sum = [...first12].reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
