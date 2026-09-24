import { z } from 'zod';
import { calculateNeto } from '@/lib/chile/tax';
import { generateAgentJson } from '@/modules/agents/services/gemini-agent';
import type { AiScanItemLine } from '../schema';

/**
 * Piezas compartidas entre las dos rutas que producen detalle de productos
 * por IA: el escaneo de fotos/prompt (`ai-scan.service.ts`) y la columna
 * "Detalle de Productos" del importador de Excel/CSV (`import.service.ts`,
 * vía `parseItemsTextBatch`). Vive en un módulo aparte, sin depender de
 * `import.service.ts`, porque `ai-scan.service.ts` YA importa de ahí
 * (validadores de fila) — si este archivo también dependiera de
 * `import.service.ts`, y `import.service.ts` a su vez necesitara esto para
 * la columna de Excel, quedaría un ciclo de imports.
 */

export interface ScanProduct {
  id: string;
  name: string;
  isExempt: boolean;
  sku?: string;
}

export const extractedItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  /** Total de la línea tal como aparece impreso. `null` si no es legible. */
  lineTotal: z.number().nullable(),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/** Fragmento de JSON Schema (subconjunto que soporta Gemini) para una línea — reutilizado por `EXTRACTION_SCHEMA_JSON` (fotos/prompt) y `ITEMS_TEXT_BATCH_SCHEMA_JSON` (columna de Excel). */
export const EXTRACTED_ITEM_JSON_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Nombre del producto o servicio tal como aparece impreso o descrito.' },
    quantity: { type: 'number', description: 'Cantidad de esa línea. Si no aparece, asume 1.' },
    lineTotal: { type: 'number', description: 'Total de la línea (cantidad × precio unitario), tal como aparece impreso o descrito. Omite si no es legible/no se menciona.' },
  },
  required: ['description', 'quantity'],
} as const;

/** Normaliza un item crudo del modelo (campo `lineTotal` puede venir omitido) al shape nullable que consume el resto del código. */
export function normalizeExtractedItem(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  return { ...obj, lineTotal: obj.lineTotal === undefined ? null : obj.lineTotal };
}

// Bloque Unicode "Combining Diacritical Marks" (U+0300-U+036F), construido con
// String.fromCharCode en vez de caracteres literales en el fuente: una clase
// de caracteres de regex con bytes no-ASCII es demasiado fácil de corromper
// sin que se note.
const COMBINING_DIACRITICS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
);

/** Quita tildes, pasa a minúsculas y colapsa espacios — para comparar texto OCR/texto libre contra el catálogo sin que un acento o mayúscula cuente como diferencia. */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sugerencia de a qué producto del catálogo corresponde una descripción leída
 * por OCR/IA/texto libre. Heurística simple (superposición de palabras +
 * substring), a propósito: es solo una SUGERENCIA que el humano confirma o
 * cambia en la tabla de revisión — nunca se vincula un producto a ciegas a
 * partir de esto, así que no vale la pena traer una librería de
 * fuzzy-matching para esto. Devuelve `null` si ningún candidato supera un
 * umbral de confianza mínimo.
 */
export function suggestProductMatch(description: string, products: ScanProduct[]): ScanProduct | null {
  const normDescription = normalizeForMatch(description);
  if (!normDescription) return null;
  const descriptionWords = new Set(normDescription.split(' ').filter((w) => w.length > 2));

  let best: { product: ScanProduct; score: number } | null = null;
  for (const product of products) {
    const normName = normalizeForMatch(product.name);
    if (!normName) continue;
    const nameWords = normName.split(' ').filter((w) => w.length > 2);
    const overlap = nameWords.filter((w) => descriptionWords.has(w)).length;
    const wordScore = nameWords.length > 0 ? overlap / nameWords.length : 0;
    const substringBonus = normDescription.includes(normName) || normName.includes(normDescription) ? 0.3 : 0;
    const score = wordScore + substringBonus;
    if (score > 0 && (!best || score > best.score)) best = { product, score };
  }
  // Umbral conservador: mejor no sugerir nada que sugerir un producto
  // equivocado — el usuario igual puede elegir manualmente en la tabla.
  return best && best.score >= 0.5 ? best.product : null;
}

let itemLocalIdSeq = 0;

/**
 * Convierte el detalle crudo (de una foto, un prompt, o la columna "Detalle
 * de Productos" del Excel) en líneas listas para la tabla de revisión:
 * intenta vincular cada una a un producto real del catálogo
 * (`suggestProductMatch`) y resuelve el precio unitario NETO.
 *
 * El total impreso/descrito en una línea (`lineTotal`) sigue una convención
 * distinta según el tipo de documento: en una Boleta (venta minorista) viene
 * CON IVA incluido, así que se le aplica `calculateNeto` — igual que el total
 * del documento completo (ver `resolveNetAmount` en `import.service.ts`). En
 * una Factura/Guía, el layout normalizado que usa la inmensa mayoría del
 * software de facturación chileno imprime el precio de línea YA NETO (el IVA
 * se desglosa solo en el resumen al pie, igual que `computeDocument` en este
 * propio proyecto) — aplicarle igual `calculateNeto` restaría un 19% que
 * nunca estuvo ahí. `isBoletaLike` distingue ambos casos.
 */
export function buildItemLines(
  rawItems: ExtractedItem[],
  products: ScanProduct[],
  documentIsExempt: boolean,
  isBoletaLike: boolean
): { items: AiScanItemLine[]; unmatchedCount: number } {
  let unmatchedCount = 0;
  const items = rawItems.map((raw) => {
    const match = suggestProductMatch(raw.description, products);
    if (!match) unmatchedCount++;

    const quantity = raw.quantity > 0 ? raw.quantity : 1;
    const lineTotal = raw.lineTotal ?? 0;
    // El `isExempt` SIEMPRE se lee del catálogo cuando hay match confirmado —
    // nunca de lo que la IA haya adivinado — igual que el resto del sistema
    // (CLAUDE.md). Sin match, se usa el `isExempt` que la IA leyó para el
    // documento completo, como mejor estimación disponible hasta que el
    // usuario vincule la línea manualmente.
    const isExempt = match ? match.isExempt : documentIsExempt;
    const lineNet = isExempt || !isBoletaLike ? lineTotal : calculateNeto(lineTotal);
    const unitPrice = quantity > 0 ? Math.round(lineNet / quantity) : 0;

    return {
      localId: `item-${++itemLocalIdSeq}`,
      description: raw.description,
      quantity,
      unitPrice,
      productId: match?.id ?? null,
      productLabel: match?.name ?? null,
    };
  });
  return { items, unmatchedCount };
}

/** Tope de textos por llamada — un prompt con demasiados documentos a la vez arriesga exceder el contexto/tiempo de respuesta del modelo. */
export const MAX_ITEMS_TEXT_BATCH = 60;

const batchResponseSchema = z.object({ documents: z.array(z.array(extractedItemSchema)) });

const ITEMS_TEXT_BATCH_SCHEMA_JSON = {
  type: 'object',
  properties: {
    documents: {
      type: 'array',
      description: 'Un elemento por cada texto de entrada, EN EL MISMO ORDEN — un arreglo de líneas de producto por texto (vacío si ese texto no describe productos identificables).',
      items: { type: 'array', items: EXTRACTED_ITEM_JSON_SCHEMA },
    },
  },
  required: ['documents'],
} as const;

function buildBatchPrompt(texts: string[]): string {
  const numbered = texts.map((text, i) => `[${i}] ${text}`).join('\n');
  return [
    `Interpreta el detalle de productos/servicios descrito en cada uno de los siguientes ${texts.length} textos.`,
    'Cada texto describe el contenido de UN documento de compra o venta (ej. "2x Notebook Lenovo, 1x Mouse inalámbrico" o "Servicio de arriendo de sonido").',
    'Devuelve `documents`: un arreglo con exactamente un elemento por texto, EN EL MISMO ORDEN que aparecen abajo (posición 0 = texto [0], etc.), cada uno con la lista de líneas de producto de ese texto. Si un texto no describe productos identificables, su elemento es un arreglo vacío.',
    'Para cada línea: descripción, cantidad (asume 1 si no se indica), y el total de esa línea tal como el texto lo exprese — no lo conviertas ni le agregues/quites IVA, eso lo hace el sistema.',
    '',
    numbered,
  ].join('\n');
}

/**
 * Interpreta en UNA sola llamada a Gemini el detalle de productos de varios
 * documentos a la vez (la columna "Detalle de Productos" del importador de
 * Excel/CSV) — a diferencia del escaneo de fotos, que llama al modelo una vez
 * por imagen, acá se agrupan hasta `MAX_ITEMS_TEXT_BATCH` filas en un único
 * prompt para no disparar cientos de llamadas (y su espaciado de ~10/min del
 * tier gratuito) en una sola importación masiva.
 *
 * Devuelve un arreglo alineado por índice con `texts` — nunca escribe en la
 * base de datos; el resultado pasa por `buildItemLines` (matching contra el
 * catálogo) y luego por la misma revisión humana que el resto del sistema.
 */
export async function parseItemsTextBatch(texts: string[]): Promise<ExtractedItem[][]> {
  if (texts.length === 0) return [];

  const systemPrompt =
    'Eres un asistente que interpreta descripciones en texto libre de productos/servicios comprados o vendidos, para un ERP chileno. Nunca inventes una línea que el texto no describe.';

  const parsed = await generateAgentJson(
    systemPrompt,
    buildBatchPrompt(texts),
    ITEMS_TEXT_BATCH_SCHEMA_JSON,
    (raw) => {
      const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const documents = Array.isArray(obj.documents)
        ? obj.documents.map((doc) => (Array.isArray(doc) ? doc.map(normalizeExtractedItem) : []))
        : [];
      const result = batchResponseSchema.safeParse({ documents });
      if (!result.success) throw new Error('La respuesta del modelo no tuvo el formato esperado');
      return result.data;
    },
    'lite'
  );

  // Defensivo: si el modelo devolvió menos/más elementos que textos de
  // entrada (no debería, pero es texto libre de un modelo), se rellena con
  // arreglos vacíos en vez de desalinear filas — una fila sin detalle
  // reconocido cae al comportamiento de siempre (línea sintética, revisable a
  // mano), nunca a una fila con el detalle de OTRO documento.
  const documents = parsed.documents;
  return texts.map((_, i) => documents[i] ?? []);
}
