import { z } from 'zod';
import { parseExpiryDate } from '@/lib/inventory/lots';
import { trustedGtin } from './codes';
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
  'Eres el ayudante de un bodeguero chileno. Recibes UNA foto de un producto (su envase o etiqueta) y devuelves lo que se lee en ella para dar de alta o encontrar el producto en el inventario.',
  'Reglas que no se rompen:',
  '1. Solo escribe lo que se lee o se ve con claridad en la foto. Si un dato no está o no se entiende, OMITE el campo. Nunca lo adivines ni lo completes por lo que "debería" decir.',
  '2. `name` es el nombre genérico del producto como se vende ("Aceite de maravilla", "Fideos espagueti"), SIN la marca ni el contenido. `brand` es la marca. `variant` es el sabor, tipo o versión ("Light", "Frutilla"). `netContent` es el contenido neto tal como está impreso ("900 ml", "1 kg", "6 x 330 ml").',
  '3. `barcode` son SOLO los dígitos del código de barras si se leen completos. Si dudas de un dígito, omite el campo.',
  '4. `lotNumber` y `expiryDate` solo si están impresos con claridad. `expiryDate` va en formato AAAA-MM-DD; si solo figura mes y año, omítela.',
  '5. `unit` es la unidad en que se contaría este producto en una bodega: UN para casi todo lo envasado, KG o LTS solo si se vende a granel, CJA si la foto es de una caja con varias unidades.',
  '6. `description` es una sola frase corta y factual con lo que dice la etiqueta. No escribas marketing ni inventes características.',
  '7. Si la foto no muestra un producto (borrosa, vacía, una persona, un documento), responde `isProduct: false`.',
  '8. Responde siempre en español y solo con el JSON pedido.',
].join('\n');

export const VISION_USER_PROMPT = 'Lee esta foto de producto y devuelve los datos pedidos.';

/** JSON Schema (subconjunto que entiende Gemini: sin `nullable`; lo opcional se deja fuera de `required`). */
export const VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isProduct: { type: 'boolean', description: 'true si la foto muestra un producto o su etiqueta legible; false si no.' },
    name: { type: 'string', description: 'Nombre genérico del producto, sin marca ni contenido. Omite si no se lee.' },
    brand: { type: 'string', description: 'Marca. Omite si no se lee.' },
    variant: { type: 'string', description: 'Sabor, tipo o versión. Omite si no aplica o no se lee.' },
    netContent: { type: 'string', description: 'Contenido neto impreso, ej. "900 ml". Omite si no se lee.' },
    unit: { type: 'string', enum: [...UNIT_VALUES], description: 'Unidad de bodega del producto.' },
    barcode: { type: 'string', description: 'Dígitos del código de barras si se leen completos. Omite si hay duda.' },
    description: { type: 'string', description: 'Una frase corta y factual con lo que dice la etiqueta.' },
    categoryHint: { type: 'string', description: 'Categoría general en una o dos palabras, ej. "Abarrotes", "Lácteos". Omite si no es evidente.' },
    lotNumber: { type: 'string', description: 'Número de lote impreso. Omite si no se lee.' },
    expiryDate: { type: 'string', description: 'Fecha de vencimiento AAAA-MM-DD, solo si está completa y clara.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Qué tan legible y segura es la lectura.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos breves para quien revisa, ej. "etiqueta parcialmente tapada".' },
  },
  required: ['isProduct', 'confidence', 'warnings'],
} as const;

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === 'string' ? value : undefined));

const rawVisionSchema = z.object({
  isProduct: z.boolean(),
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
    .catch([])
    .transform((items) => items.slice(0, 5)),
});

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
  const barcode = trustedGtin(data.barcode);
  // Sin nombre, marca ni código no hay nada que buscar ni con qué crear.
  if (!name && !brand && !barcode) return null;

  const unit = (UNIT_VALUES as readonly string[]).includes(data.unit ?? '') ? (data.unit as string) : 'UN';
  const variant = clean(data.variant, 60);

  return {
    name: name ? toDisplayCase(name) : null,
    brand: brand ? toDisplayCase(brand) : null,
    variant: variant ? toDisplayCase(variant) : null,
    netContent: clean(data.netContent, 40),
    unit,
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
