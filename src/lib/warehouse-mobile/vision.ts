import { z } from 'zod';
import { parseExpiryDate } from '@/lib/inventory/lots';
import { plausibleSku, trustedGtin } from './codes';
import type { VisionRead } from '@/modules/warehouse-mobile/types';

/**
 * Lectura de la foto de un producto por IA: qué se le pide al modelo y cómo se
 * limpia lo que devuelve. Puro (sin llamar a nada): la llamada vive en
 * `vision.service.ts`.
 *
 * Principio: lo que sale de acá es una SUGERENCIA para prellenar un formulario
 * que el bodeguero revisa. Un dato que la etiqueta no muestra con claridad se
 * deja vacío; un código de barras solo pasa si su dígito verificador cuadra.
 */

const UNIT_VALUES = ['UN', 'KG', 'MT', 'LTS', 'CJA', 'PAR'] as const;

export const VISION_SYSTEM_PROMPT = [
  'Eres el ayudante de un bodeguero chileno. Recibes UNA foto de un producto (su envase, caja o etiqueta) y devuelves lo que se lee en ella para encontrarlo o darlo de alta en el inventario.',
  'Lo más importante es el CÓDIGO del producto: búscalo primero.',
  'Reglas que no se rompen:',
  '1. Solo escribe lo que se lee o se ve con claridad en la foto. Si un dato no está o no se entiende, OMITE el campo. Nunca lo adivines ni lo completes por lo que "debería" decir.',
  '2. `sku` es el código de producto o artículo que la etiqueta rotula como SKU, Cód., Código, Art., Artículo, Ref., Referencia, Item, Modelo o P/N. Cópialo EXACTO como está impreso, con sus letras, números y guiones. NO es el código de barras (los dígitos bajo las barras), ni el número de lote, ni una fecha, ni un precio. Si no hay uno rotulado, omítelo.',
  '3. `barcode` son SOLO los dígitos del código de barras (los que van bajo las barras) si se leen completos. Si dudas de un dígito, omite el campo.',
  '4. `name` es el nombre genérico del producto como se vende ("Aceite de maravilla", "Fideos espagueti"), SIN la marca ni el contenido. `brand` es la marca. `variant` es el sabor, tipo o versión ("Light", "Frutilla"). `netContent` es el contenido neto tal como está impreso ("900 ml", "1 kg", "6 x 330 ml").',
  '5. `lotNumber` y `expiryDate` solo si están impresos con claridad. `expiryDate` va en formato AAAA-MM-DD; si solo figura mes y año, omítela.',
  '6. `unit` es la unidad en que se contaría este producto en una bodega: UN para casi todo lo envasado, KG o LTS solo si se vende a granel, CJA si la foto es de una caja con varias unidades.',
  '7. Si la foto no muestra un producto (borrosa, vacía, una persona, un documento), responde `isProduct: false`.',
  '8. Sé breve: `warnings` solo si algo impide leer bien (máximo 2, de pocas palabras). Responde en español y solo con el JSON pedido.',
].join('\n');

export const VISION_USER_PROMPT = 'Lee esta foto de producto y devuelve los datos pedidos.';

/** JSON Schema (subconjunto que entiende Gemini: sin `nullable`; lo opcional se deja fuera de `required`). */
export const VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isProduct: { type: 'boolean', description: 'true si la foto muestra un producto o su etiqueta legible; false si no.' },
    sku: { type: 'string', description: 'Código SKU/Cód./Art./Ref. impreso, copiado exacto. NO el código de barras ni el lote. Omite si no hay.' },
    barcode: { type: 'string', description: 'Dígitos del código de barras si se leen completos. Omite si hay duda.' },
    name: { type: 'string', description: 'Nombre genérico del producto, sin marca ni contenido. Omite si no se lee.' },
    brand: { type: 'string', description: 'Marca. Omite si no se lee.' },
    variant: { type: 'string', description: 'Sabor, tipo o versión. Omite si no aplica o no se lee.' },
    netContent: { type: 'string', description: 'Contenido neto impreso, ej. "900 ml". Omite si no se lee.' },
    unit: { type: 'string', enum: [...UNIT_VALUES], description: 'Unidad de bodega del producto.' },
    categoryHint: { type: 'string', description: 'Categoría general en una o dos palabras, ej. "Abarrotes". Omite si no es evidente.' },
    lotNumber: { type: 'string', description: 'Número de lote impreso. Omite si no se lee.' },
    expiryDate: { type: 'string', description: 'Fecha de vencimiento AAAA-MM-DD, solo si está completa y clara.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Qué tan legible y segura es la lectura.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Máximo 2 avisos de pocas palabras. Omite si no hay.' },
  },
  required: ['isProduct', 'confidence'],
} as const;

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === 'string' ? value : undefined));

const rawVisionSchema = z.object({
  isProduct: z.boolean(),
  sku: optionalText,
  name: optionalText,
  brand: optionalText,
  variant: optionalText,
  netContent: optionalText,
  unit: optionalText,
  barcode: optionalText,
  description: optionalText,
  categoryHint: optionalText,
  lotNumber: optionalText,
  expiryDate: optionalText,
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  warnings: z
    .array(z.string())
    .optional()
    .catch([])
    .transform((items) => (items ?? []).slice(0, 5)),
});

export type ThinkingSetting = { kind: 'level'; level: 'minimal' | 'low' | 'medium' | 'high' } | { kind: 'budget'; tokens: number } | null;

const THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high']);

/**
 * Cuánto "razona" el modelo antes de responder. Leer una etiqueta es transcribir, no
 * razonar: los modelos Gemini 3 piensan por defecto y eso suma varios segundos por foto
 * sin mejorar la lectura. Por defecto se pide el mínimo (Gemini 3: `minimal`; Gemini 2.5
 * flash: presupuesto 0). `WAREHOUSE_VISION_THINKING` lo cambia: `minimal|low|medium|high` o
 * `default` para dejar el comportamiento del modelo. Un modelo que no se reconoce no recibe
 * ningún ajuste: una opción que no entiende devolvería error en vez de una lectura.
 */
export function thinkingFor(model: string, override?: string): ThinkingSetting {
  const wanted = override?.trim().toLowerCase();
  if (wanted === 'default') return null;
  const name = model.toLowerCase();
  if (/gemini-3/.test(name)) {
    return { kind: 'level', level: wanted && THINKING_LEVELS.has(wanted) ? (wanted as 'minimal' | 'low' | 'medium' | 'high') : 'minimal' };
  }
  if (/gemini-2\.5-flash/.test(name)) return { kind: 'budget', tokens: 0 };
  return null;
}

/** Palabras que se dejan en minúscula al pasar un texto en MAYÚSCULAS a "Título". */
const SMALL_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'sin', 'en', 'para', 'al', 'por', 'a', 'o']);

function clean(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text.length > 0 ? text : null;
}

/**
 * Las etiquetas vienen en MAYÚSCULAS ("ACEITE DE MARAVILLA"): se pasan a
 * "Aceite de Maravilla" para que el catálogo no quede gritando. Un texto que ya
 * mezcla mayúsculas y minúsculas se respeta tal cual.
 */
export function toDisplayCase(text: string): string {
  if (text !== text.toUpperCase() || text === text.toLowerCase()) return text;
  return text
    .toLowerCase()
    .split(' ')
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function plausibleExpiry(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = parseExpiryDate(value.trim());
  if (!parsed) return null;
  const year = parsed.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? value.trim() : null;
}

/**
 * Limpia la respuesta cruda del modelo. Devuelve `null` si no es un producto
 * (o si no se leyó nada útil): quien llama lo trata como "foto ilegible".
 */
export function normalizeVisionRead(raw: unknown): VisionRead | null {
  const parsed = rawVisionSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.isProduct) return null;
  const data = parsed.data;

  const name = clean(data.name, 120);
  const brand = clean(data.brand, 80);
  let barcode = trustedGtin(data.barcode);
  let sku = plausibleSku(data.sku);
  // Un "SKU" que es en realidad un código de barras válido se trata como código de barras.
  const skuAsGtin = trustedGtin(sku);
  if (skuAsGtin) {
    barcode = barcode ?? skuAsGtin;
    sku = null;
  }
  // Sin nombre, marca ni código no hay nada que buscar ni con qué crear.
  if (!name && !brand && !barcode && !sku) return null;

  const unit = (UNIT_VALUES as readonly string[]).includes(data.unit ?? '') ? (data.unit as string) : 'UN';
  const variant = clean(data.variant, 60);

  return {
    name: name ? toDisplayCase(name) : null,
    brand: brand ? toDisplayCase(brand) : null,
    variant: variant ? toDisplayCase(variant) : null,
    netContent: clean(data.netContent, 40),
    unit,
    sku,
    barcode,
    description: clean(data.description, 300),
    categoryHint: clean(data.categoryHint, 60),
    lotNumber: clean(data.lotNumber, 40),
    expiryDate: plausibleExpiry(data.expiryDate),
    confidence: data.confidence,
    warnings: data.warnings.map((warning) => warning.trim().slice(0, 120)).filter(Boolean),
  };
}

/** Palabras sueltas en minúscula para comparar si un texto ya contiene a otro. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Nombre sugerido para un producto nuevo: "Aceite de Maravilla Light Chef 900 ml".
 * Cada parte se agrega solo si el nombre no la trae ya (la IA suele repetir la
 * marca o el contenido dentro del nombre).
 */
export function composeProductName(read: Pick<VisionRead, 'name' | 'brand' | 'variant' | 'netContent'>): string {
  let result = read.name ?? '';
  const have = new Set(wordsOf(result));
  for (const part of [read.variant, read.brand, read.netContent]) {
    if (!part) continue;
    const words = wordsOf(part);
    if (words.length > 0 && words.every((word) => have.has(word))) continue;
    result = `${result} ${part}`.trim();
    for (const word of words) have.add(word);
  }
  return result.slice(0, 120);
}
