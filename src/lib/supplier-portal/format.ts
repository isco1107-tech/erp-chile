/**
 * Formato del código de acceso de un proveedor: cómo se muestra, cómo se normaliza lo que una persona
 * escribe y qué símbolos admite. Sin `crypto`, para poder usarlo también en el navegador (la página
 * de ingreso valida lo escrito antes de enviarlo). La generación y la huella viven en `code.ts`.
 */

export const SUPPLIER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Símbolos del código sin separadores. */
export const SUPPLIER_CODE_LENGTH = 16;

/** Cómo se muestra y se entrega: grupos de cuatro separados por guion. */
export function formatSupplierCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * Lo que la persona escribió, llevado a la forma canónica: mayúsculas, sin espacios ni
 * guiones, y con las confusiones típicas corregidas (I y L son 1, O es 0). `null` si no
 * puede ser un código (largo distinto o símbolos que el alfabeto no tiene).
 */
export function normalizeSupplierCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (cleaned.length !== SUPPLIER_CODE_LENGTH) return null;
  for (const symbol of cleaned) if (!SUPPLIER_CODE_ALPHABET.includes(symbol)) return null;
  return cleaned;
}

