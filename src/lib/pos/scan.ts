import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { normalizeQuantity } from './cart';

/** Lo mínimo del catálogo que necesita el lector para resolver un código. */
export interface ScanProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  packagings: { barcode: string; factor: number; name: string }[];
}

export interface QuantityPrefix {
  /** Unidades pedidas con `N*código`; 1 si no hay prefijo. */
  units: number;
  code: string;
  /** El cajero escribió un prefijo (aunque haya sido inválido). */
  explicit: boolean;
  /** El prefijo existe pero no es una cantidad válida (`0*`, `abc*`). */
  invalid: boolean;
}

/**
 * `3*7801234567890` → 3 unidades. El lector entrega el código seguido de Enter,
 * así que el cajero teclea `3*` y escanea: el prefijo queda delante del código.
 * Acepta coma o punto decimal (`0,5*`) para productos al peso.
 */
export function parseQuantityPrefix(raw: string): QuantityPrefix {
  const text = raw.trim();
  const star = text.indexOf('*');
  if (star <= 0) {
    // Sin prefijo (o `*` al inicio, que no es una cantidad): todo es código.
    return { units: 1, code: star === 0 ? text.slice(1).trim() : text, explicit: star === 0, invalid: star === 0 };
  }
  const head = text.slice(0, star).trim().replace(',', '.');
  const units = /^\d+(\.\d{1,3})?$/.test(head) ? normalizeQuantity(Number(head)) : null;
  const code = text.slice(star + 1).trim();
  if (units === null) return { units: 1, code, explicit: true, invalid: true };
  return { units, code, explicit: true, invalid: false };
}

export type ScanVia = 'packaging' | 'barcode' | 'sku' | 'search';

export type ScanResolution<P extends ScanProduct> =
  | { kind: 'product'; product: P; units: number; via: ScanVia; packName?: string }
  | { kind: 'none'; code: string; invalidPrefix: boolean };

const sameCode = (a: string | null | undefined, b: string): boolean => !!a && a.trim().toLowerCase() === b;

/** Ceros a la izquierda de un EAN/UPC (UPC-A leído como EAN-13): solo para códigos numéricos largos. */
const stripLeadingZeros = (value: string): string => (/^\d{8,}$/.test(value) ? value.replace(/^0+/, '') : value);

/**
 * Qué producto corresponde a lo que tecleó o escaneó el cajero.
 *
 * Orden: empaque exacto (suma `factor` unidades) → código de barras exacto →
 * SKU exacto → coincidencia parcial por nombre/SKU. Una coincidencia exacta
 * manda sobre la parcial, para que escanear nunca agregue el producto
 * equivocado. `search` recibe los candidatos ya filtrados por el buscador.
 */
export function resolveScan<P extends ScanProduct>(products: P[], raw: string, search: P[] = []): ScanResolution<P> {
  const prefix = parseQuantityPrefix(raw);
  const code = prefix.code.toLowerCase();
  if (!code) return { kind: 'none', code: prefix.code, invalidPrefix: prefix.invalid };
  if (prefix.invalid) return { kind: 'none', code: prefix.code, invalidPrefix: true };

  for (const product of products) {
    const pack = product.packagings.find((item) => sameCode(item.barcode, code));
    if (pack) {
      const units = normalizeQuantity(pack.factor * prefix.units);
      if (units !== null) return { kind: 'product', product, units, via: 'packaging', packName: pack.name };
    }
  }
  const byBarcode = products.find((product) => sameCode(product.barcode, code));
  if (byBarcode) return { kind: 'product', product: byBarcode, units: prefix.units, via: 'barcode' };
  const bySku = products.find((product) => sameCode(product.sku, code));
  if (bySku) return { kind: 'product', product: bySku, units: prefix.units, via: 'sku' };

  const trimmed = stripLeadingZeros(code);
  if (trimmed !== code || /^\d{8,}$/.test(code)) {
    const loose = products.find((product) => product.barcode && stripLeadingZeros(product.barcode.trim().toLowerCase()) === trimmed);
    if (loose) return { kind: 'product', product: loose, units: prefix.units, via: 'barcode' };
  }

  const partial = search[0];
  if (partial) return { kind: 'product', product: partial, units: prefix.units, via: 'search' };
  return { kind: 'none', code: prefix.code, invalidPrefix: false };
}

/** Candidatos del buscador (nombre/SKU parcial o código exacto), máximo `limit`. */
export function searchProducts<P extends ScanProduct>(products: P[], query: string, limit = 8): P[] {
  const q = parseQuantityPrefix(query).code.toLowerCase();
  if (!q) return [];
  return products
    .filter(
      (product) =>
        product.sku.toLowerCase().includes(q) ||
        product.name.toLowerCase().includes(q) ||
        sameCode(product.barcode, q) ||
        product.packagings.some((pack) => sameCode(pack.barcode, q)),
    )
    .slice(0, limit);
}

export type RutEntry<P extends ScanProduct> =
  | { kind: 'empty' }
  | { kind: 'rut'; rut: string }
  | { kind: 'product'; resolution: Extract<ScanResolution<P>, { kind: 'product' }> }
  | { kind: 'invalid'; message: string };

/**
 * Lo que se teclea en el paso del RUT. Es el primer campo que ve el cajero tras
 * escanear el primer producto, así que el lector puede seguir entregando
 * productos mientras tanto: un código que existe en el catálogo se trata como
 * producto y no como un RUT mal escrito.
 *
 * Un RUT escrito con guion y dígito verificador válido (`12.345.678-5`) es
 * siempre un RUT. Cualquier otro texto que coincide EXACTO con un código del
 * catálogo es un producto; lo demás se prueba como RUT (con o sin guion).
 */
export function classifyRutEntry<P extends ScanProduct>(products: P[], raw: string): RutEntry<P> {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };

  const dashedRut = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(text) && validateRut(text);
  if (!dashedRut) {
    const resolution = resolveScan(products, text);
    if (resolution.kind === 'product') return { kind: 'product', resolution };
  }
  if (!/^[0-9.\-kK\s]+$/.test(text)) return { kind: 'invalid', message: `No encuentro "${text}" en el catálogo ni es un RUT` };
  if (!validateRut(text)) return { kind: 'invalid', message: 'El RUT no es válido. Revisa el dígito verificador.' };
  return { kind: 'rut', rut: formatRut(cleanRut(text)) };
}
