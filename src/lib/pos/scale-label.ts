import { z } from 'zod';
import { ean13CheckDigit, isValidEan13 } from '@/lib/barcode/code128';
import { formatCurrency } from '@/lib/chile/tax';
import { formatQuantity, normalizeQuantity } from './cart';

/**
 * Etiquetas de balanza (EAN-13 de peso o precio variable).
 *
 * La balanza de la fiambrería, la carnicería o la verdulería imprime una
 * etiqueta EAN-13 que empieza con 2 (prefijos 20–29, reservados por GS1 para
 * uso interno de cada tienda) y trae, en vez de un código fijo, el PLU del
 * producto y el peso o el precio de ESE paquete:
 *
 *     2 0 | 0 0 1 2 3 | 0 0 5 1 2 | 7
 *     ─┬─   ────┬────   ────┬────   ┬
 *   prefijo   PLU (5)    valor (5)   dígito verificador
 *
 * El largo del PLU es configurable (4, 5 o 6) y el valor ocupa lo que queda
 * (6, 5 o 4 dígitos). Cada prefijo dice si el valor es el peso en gramos o el
 * precio en pesos con IVA. El formato es de la EMPRESA (lo fija cómo está
 * programada su balanza) y el PLU es de cada producto (`Product.scaleCode`).
 *
 * Reglas:
 * - Una etiqueta solo se acepta con dígito verificador válido: un código mal
 *   leído nunca agrega un peso inventado.
 * - Lo leído decide SOLO el producto y la cantidad. El precio lo pone el
 *   servidor desde el catálogo al cobrar (`createPosSale`), como siempre.
 * - Con etiquetas de precio, la cantidad se deduce del precio del catálogo y
 *   se redondea al gramo; por eso el total puede diferir en unos pesos de lo
 *   impreso. Las de peso calzan exacto con el catálogo.
 */

export const SCALE_LABEL_MODES = ['WEIGHT', 'PRICE'] as const;
export type ScaleLabelMode = (typeof SCALE_LABEL_MODES)[number];

export const SCALE_LABEL_MODE_LABELS: Record<ScaleLabelMode, string> = {
  WEIGHT: 'Peso en gramos',
  PRICE: 'Precio en pesos (con IVA)',
};

/** Prefijos GS1 de uso interno de la tienda (peso o precio variable). */
export const SCALE_PREFIXES = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'] as const;
export type ScalePrefix = (typeof SCALE_PREFIXES)[number];

/** Dígitos del PLU dentro de la etiqueta. El valor ocupa `10 − largo`. */
export const SCALE_CODE_LENGTHS = [4, 5, 6] as const;
export type ScaleCodeLength = (typeof SCALE_CODE_LENGTHS)[number];

export const scaleLabelRuleSchema = z
  .object({
    prefix: z.enum(SCALE_PREFIXES, 'Prefijo inválido'),
    mode: z.enum(SCALE_LABEL_MODES, 'Elige si la etiqueta trae peso o precio'),
  })
  .strict();

export const scaleLabelFormatSchema = z
  .object({
    codeLength: z.union([z.literal(4), z.literal(5), z.literal(6)], 'El PLU tiene 4, 5 o 6 dígitos'),
    rules: z.array(scaleLabelRuleSchema).min(1, 'Agrega al menos un prefijo').max(SCALE_PREFIXES.length),
  })
  .strict()
  .refine((format) => new Set(format.rules.map((rule) => rule.prefix)).size === format.rules.length, {
    message: 'Cada prefijo puede aparecer una sola vez',
    path: ['rules'],
  });

export type ScaleLabelFormat = z.infer<typeof scaleLabelFormatSchema>;

/** El formato más común de las balanzas de supermercado: prefijo 20, PLU de 5 dígitos y peso en gramos. */
export const DEFAULT_SCALE_LABEL_FORMAT: ScaleLabelFormat = { codeLength: 5, rules: [{ prefix: '20', mode: 'WEIGHT' }] };

/** Lo guardado en `CompanySettings.scaleLabelFormat`, o `null` si está apagado o no es válido. */
export function parseScaleLabelFormat(value: unknown): ScaleLabelFormat | null {
  if (value === null || value === undefined) return null;
  const parsed = scaleLabelFormatSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Dígitos de valor que caben en la etiqueta con ese largo de PLU. */
export function scaleValueLength(codeLength: ScaleCodeLength): number {
  return 10 - codeLength;
}

// ─── PLU del producto ────────────────────────────────────────────────────────

/** El PLU que se escribe en la ficha: solo dígitos, hasta 6. */
export const SCALE_CODE_MAX_LENGTH = 6;

/**
 * Forma canónica de un PLU: sin ceros a la izquierda ("00123" = "123"),
 * porque la balanza lo imprime rellenado al largo de la etiqueta y la ficha
 * lo puede tener escrito de cualquiera de las dos formas.
 * `null` si no es un PLU (vacío, con letras, todo ceros o demasiado largo).
 */
export function scaleCodeKey(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text) || text.length > SCALE_CODE_MAX_LENGTH) return null;
  const key = text.replace(/^0+/, '');
  return key.length > 0 ? key : null;
}

/** El PLU cabe en la etiqueta configurada (uno de 6 dígitos no cabe en una de 5). */
export function scaleCodeFits(key: string, codeLength: ScaleCodeLength): boolean {
  return key.length <= codeLength;
}

// ─── Lectura de la etiqueta ──────────────────────────────────────────────────

export type ScaleLabelProblem = 'check-digit' | 'no-code' | 'zero-value';

export type ScaleLabel =
  | { ok: true; prefix: ScalePrefix; mode: ScaleLabelMode; code: string; value: number }
  | { ok: false; prefix: ScalePrefix; problem: ScaleLabelProblem };

/**
 * Lee una etiqueta de balanza. `null` = no es una etiqueta de balanza para
 * este formato (no tiene 13 dígitos o su prefijo no está configurado): el
 * lector sigue con la búsqueda normal.
 */
export function parseScaleLabel(raw: string, format: ScaleLabelFormat): ScaleLabel | null {
  const text = raw.trim();
  if (!/^\d{13}$/.test(text)) return null;
  const rule = format.rules.find((item) => text.startsWith(item.prefix));
  if (!rule) return null;
  if (!isValidEan13(text)) return { ok: false, prefix: rule.prefix, problem: 'check-digit' };

  const codeEnd = 2 + format.codeLength;
  const code = scaleCodeKey(text.slice(2, codeEnd));
  if (!code) return { ok: false, prefix: rule.prefix, problem: 'no-code' };
  const value = Number(text.slice(codeEnd, 12));
  if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, prefix: rule.prefix, problem: 'zero-value' };
  return { ok: true, prefix: rule.prefix, mode: rule.mode, code, value };
}

/**
 * Cantidad que representa la etiqueta para un producto: kilos (peso ÷ 1000)
 * o, en etiquetas de precio, precio impreso ÷ precio con IVA del catálogo,
 * al gramo. `null` si no se puede (producto sin precio, cantidad fuera de rango).
 */
export function scaleLabelQuantity(label: Extract<ScaleLabel, { ok: true }>, grossPrice: number): number | null {
  if (label.mode === 'WEIGHT') return normalizeQuantity(label.value / 1000);
  if (!Number.isFinite(grossPrice) || grossPrice <= 0) return null;
  return normalizeQuantity(label.value / grossPrice);
}

/** Lo que trae la etiqueta, para mostrarlo al cajero ("0,512 kg", "$1.495"). */
export function describeScaleLabel(label: Extract<ScaleLabel, { ok: true }>): string {
  return label.mode === 'WEIGHT' ? `${formatQuantity(label.value / 1000)} kg` : formatCurrency(label.value);
}

/** Mensaje accionable para una etiqueta que no se pudo usar. */
export function scaleProblemMessage(label: Extract<ScaleLabel, { ok: false }>): string {
  switch (label.problem) {
    case 'check-digit':
      return 'La etiqueta de balanza no pasó el dígito verificador. Vuelve a escanearla o escribe el código completo.';
    case 'no-code':
      return 'La etiqueta de balanza no trae el número del producto (PLU). Revisa el formato de etiqueta en Configuración → Perfil de Empresa.';
    case 'zero-value':
      return 'La etiqueta de balanza marca 0. Vuelve a pesar el producto.';
  }
}

/** Ejemplo de etiqueta válida para un PLU y un valor, con su dígito verificador (para la ayuda en pantalla y las pruebas). */
export function buildScaleLabel(prefix: ScalePrefix, code: string, value: number, codeLength: ScaleCodeLength): string {
  const valueLength = scaleValueLength(codeLength);
  const body = `${prefix}${code.padStart(codeLength, '0')}${String(Math.round(value)).padStart(valueLength, '0')}`;
  if (!/^\d{12}$/.test(body)) throw new Error('PLU o valor no caben en la etiqueta');
  return `${body}${ean13CheckDigit(body)}`;
}
