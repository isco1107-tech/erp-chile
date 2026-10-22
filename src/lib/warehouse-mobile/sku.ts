/**
 * SKU automático para los productos que el bodeguero da de alta desde el
 * celular sin escribir uno. Formato `PRD-000123`: relleno de ceros a 6 dígitos
 * para que el orden alfabético sea también el numérico.
 *
 * El SKU es del catálogo de la empresa: si la persona escribe el suyo se respeta
 * tal cual, y esto solo rellena el hueco. Nunca se toma de la etiqueta del
 * producto (ese código es del fabricante, no de la empresa).
 */

export const AUTO_SKU_PREFIX = 'PRD-';
const AUTO_SKU_DIGITS = 6;
const AUTO_SKU_PATTERN = /^PRD-(\d{1,9})$/;

export function formatAutoSku(n: number): string {
  return `${AUTO_SKU_PREFIX}${String(Math.max(1, Math.floor(n))).padStart(AUTO_SKU_DIGITS, '0')}`;
}

/** Número de un SKU automático, o `null` si el SKU es de otro estilo. */
export function parseAutoSku(sku: string): number | null {
  const found = AUTO_SKU_PATTERN.exec(sku);
  return found ? Number(found[1]) : null;
}

/**
 * Siguiente SKU libre dado los SKU ya usados (basta con los más altos).
 * `skip` sirve para reintentar cuando otro envío ocupó el número un instante antes.
 */
export function nextAutoSku(existingSkus: readonly string[], skip = 0): string {
  let highest = 0;
  for (const sku of existingSkus) {
    const n = parseAutoSku(sku);
    if (n !== null && n > highest) highest = n;
  }
  return formatAutoSku(highest + 1 + skip);
}
