import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { normalizeQuantity } from './cart';
import {
  describeScaleLabel,
  parseScaleLabel,
  scaleCodeKey,
  scaleLabelQuantity,
  scaleProblemMessage,
  type ScaleLabelFormat,
} from './scale-label';

/** Lo mínimo del catálogo que necesita el lector para resolver un código. */
export interface ScanProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  packagings: { barcode: string; factor: number; name: string }[];
  /** PLU de balanza (`Product.scaleCode`): las etiquetas de balanza con ese número agregan este producto. */
  scaleCode?: string | null;
  /** Precio con IVA, solo para deducir la cantidad de una etiqueta de balanza con precio. */
  grossPrice?: number;
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

export type ScanVia = 'packaging' | 'barcode' | 'sku' | 'scale' | 'search';

export type ScanResolution<P extends ScanProduct> =
  | {
      kind: 'product';
      product: P;
      units: number;
      via: ScanVia;
      packName?: string;
      /** Lo que traía la etiqueta de balanza ("0,512 kg", "$1.495"), si vino de una. */
      scaleText?: string;
    }
  | {
      kind: 'none';
      code: string;
      invalidPrefix: boolean;
      /** Era una etiqueta de balanza que no se pudo usar: el motivo, listo para mostrar. */
      scaleProblem?: string;
    };

const sameCode = (a: string | null | undefined, b: string): boolean => !!a && a.trim().toLowerCase() === b;

/** Ceros a la izquierda de un EAN/UPC (UPC-A leído como EAN-13): solo para códigos numéricos largos. */
const stripLeadingZeros = (value: string): string => (/^\d{8,}$/.test(value) ? value.replace(/^0+/, '') : value);

/**
 * Qué producto corresponde a una etiqueta de balanza, o `null` si el texto no
 * es una etiqueta de balanza del formato configurado.
 */
function resolveScaleLabel<P extends ScanProduct>(
  products: P[],
  code: string,
  multiplier: number,
  scale: ScaleLabelFormat,
): ScanResolution<P> | null {
  const label = parseScaleLabel(code, scale);
  if (!label) return null;
  if (!label.ok) return { kind: 'none', code, invalidPrefix: false, scaleProblem: scaleProblemMessage(label) };
  const matches = products.filter((product) => scaleCodeKey(product.scaleCode) === label.code);
  // El PLU es único por empresa en la base; dos coincidencias solo pasarían con
  // un catálogo desactualizado, y entonces no se adivina.
  if (matches.length !== 1) {
    return {
      kind: 'none',
      code,
      invalidPrefix: false,
      scaleProblem:
        matches.length === 0
          ? `Etiqueta de balanza con PLU ${label.code}: ningún producto tiene ese código de balanza. Asígnalo en su ficha del catálogo.`
          : `Etiqueta de balanza con PLU ${label.code}: hay más de un producto con ese código. Actualiza el catálogo.`,
    };
  }
  const product = matches[0]!;
  const perLabel = scaleLabelQuantity(label, product.grossPrice ?? 0);
  const units = perLabel === null ? null : normalizeQuantity(perLabel * multiplier);
  if (units === null) {
    return {
      kind: 'none',
      code,
      invalidPrefix: false,
      scaleProblem:
        label.mode === 'PRICE' && !(product.grossPrice && product.grossPrice > 0)
          ? `${product.name} no tiene precio en el catálogo: no se puede calcular cuánto pesa la etiqueta.`
          : `La etiqueta de balanza de ${product.name} trae una cantidad fuera de rango.`,
    };
  }
  return { kind: 'product', product, units, via: 'scale', scaleText: describeScaleLabel(label) };
}

/**
 * Qué producto corresponde a lo que tecleó o escaneó el cajero.
 *
 * Orden: empaque exacto (suma `factor` unidades) → código de barras exacto →
 * SKU exacto → etiqueta de balanza (si la empresa la configuró: PLU + peso o
 * precio) → código sin ceros a la izquierda → coincidencia parcial por
 * nombre/SKU. Una coincidencia exacta manda sobre todo lo demás, para que
 * escanear nunca agregue el producto equivocado (un producto con un EAN
 * interno que empieza con 2 se sigue encontrando por su código). `search`
 * recibe los candidatos ya filtrados por el buscador.
 */
export function resolveScan<P extends ScanProduct>(
  products: P[],
  raw: string,
  search: P[] = [],
  scale: ScaleLabelFormat | null = null,
): ScanResolution<P> {
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

  if (scale) {
    const fromScale = resolveScaleLabel(products, code, prefix.units, scale);
    if (fromScale) return fromScale;
  }

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
export function classifyRutEntry<P extends ScanProduct>(products: P[], raw: string, scale: ScaleLabelFormat | null = null): RutEntry<P> {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };

  const dashedRut = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(text) && validateRut(text);
  if (!dashedRut) {
    const resolution = resolveScan(products, text, [], scale);
    if (resolution.kind === 'product') return { kind: 'product', resolution };
    // Una etiqueta de balanza que no se pudo usar se explica: no es un RUT mal escrito.
    if (resolution.scaleProblem) return { kind: 'invalid', message: resolution.scaleProblem };
  }
  if (!/^[0-9.\-kK\s]+$/.test(text)) return { kind: 'invalid', message: `No encuentro "${text}" en el catálogo ni es un RUT` };
  if (!validateRut(text)) return { kind: 'invalid', message: 'El RUT no es válido. Revisa el dígito verificador.' };
  return { kind: 'rut', rut: formatRut(cleanRut(text)) };
}
