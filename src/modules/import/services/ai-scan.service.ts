import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { calculateNeto } from '@/lib/chile/tax';
import { normalizeHeader } from './parse.service';
import {
  type ContactLookupContext,
  loadContactLookupContext,
  validateHistoricalPurchasesRow,
  validateHistoricalSalesRow,
} from './import.service';
import {
  buildItemLines,
  EXTRACTED_ITEM_JSON_SCHEMA,
  extractedItemSchema,
  normalizeExtractedItem,
  type ScanProduct,
} from './product-match.service';
import { DTE_TYPE_TEXT_MAP, PURCHASE_DOC_TYPE_TEXT_MAP, type AiScanRow } from '../schema';

/**
 * Escaneo de facturas/boletas en papel vía IA (Gemini 3.6 Flash, tier
 * gratuito — decisión explícita del usuario: prioriza costo $0 por sobre la
 * mejor precisión posible o la disponibilidad garantizada. Diferencias reales
 * frente a un modelo pago que hay que tener presentes:
 *  - El tier gratuito de Gemini permite a Google usar el contenido enviado
 *    para mejorar sus productos (a diferencia del tier pagado). El usuario fue
 *    informado de esto explícitamente y aun así optó por costo $0.
 *  - Límite ~10 solicitudes/minuto en el tier gratuito: `scanInvoiceImages`
 *    espacia las llamadas para no superarlo (ver `MIN_INTERVAL_MS` más abajo),
 *    lo que hace el escaneo de un lote grande notoriamente más lento que con
 *    un proveedor pago, y bajo uso intenso puede devolver 429 (se reintenta
 *    una vez con backoff; si persiste, esa imagen queda marcada para reintentar).
 *
 * SOLO extrae y arma filas candidatas en el mismo formato que produce el
 * parser de Excel/CSV para `historicalSales`/`historicalPurchases` — nunca
 * escribe en la base de datos. La inserción real pasa siempre por
 * `commitHistoricalRows` (vía `POST /api/import/commit-rows`), después de que
 * un humano revisó/corrigió cada fila en pantalla. La extracción de un modelo
 * puede equivocarse en montos, fechas o RUT, y esto es data financiera/tributaria
 * — nunca se guarda directo.
 *
 * Requiere la variable de entorno `GEMINI_API_KEY` en producción (Vercel).
 * Obtenerla gratis en https://aistudio.google.com/apikey.
 */

// gemini-2.5-flash fue retirado para API keys nuevas (404 "no longer
// available to new users" — el mensaje de error de Google indicó este
// reemplazo directo). Si Google vuelve a retirar este modelo, el error 404 en
// producción trae el nombre del reemplazo sugerido en su propio mensaje.
const MODEL = 'gemini-3.6-flash';

/** Espaciado mínimo entre llamadas para no superar ~10 solicitudes/minuto del tier gratuito. */
const MIN_INTERVAL_MS = 6_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AllowedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export const extractionSchema = z.object({
  documentKind: z.enum(['sale', 'purchase']),
  contactRut: z.string().nullable(),
  contactName: z.string().nullable(),
  documentTypeGuess: z.string().nullable(),
  folio: z.string().nullable(),
  issueDate: z.string().nullable(),
  netAmount: z.number().nullable(),
  ivaAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  isExempt: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  warnings: z.array(z.string()),
  /** Detalle línea por línea, si el documento lo trae impreso y es legible. Vacío si no. */
  items: z.array(extractedItemSchema),
});

export type Extraction = z.infer<typeof extractionSchema>;

/**
 * JSON Schema para `config.responseJsonSchema` de Gemini. A diferencia de
 * Anthropic (donde se podía usar `type: ['string','null']`), el subconjunto de
 * JSON Schema que Gemini soporta no incluye arrays de tipos ni `nullable`
 * (ver comentario de `GenerateContentConfig.responseJsonSchema` en
 * node_modules/@google/genai/dist/genai.d.ts): por eso los campos que pueden
 * no ser legibles se dejan simplemente FUERA de `required` en vez de tipados
 * como `[tipo, 'null']` — el modelo puede omitirlos, y el código de abajo trata
 * la ausencia como `null` explícitamente.
 */
export const EXTRACTION_SCHEMA_JSON = {
  type: 'object',
  properties: {
    documentKind: {
      type: 'string',
      enum: ['sale', 'purchase'],
      description:
        '"sale" si el RUT emisor del documento coincide con el RUT de la empresa indicada en el contexto (venta que ella emitió); "purchase" si el emisor es un tercero distinto (compra que ella recibió).',
    },
    contactRut: {
      type: 'string',
      description: 'RUT de la contraparte (cliente si es venta, proveedor si es compra), formato XX.XXX.XXX-X. Omite este campo si no es legible.',
    },
    contactName: { type: 'string', description: 'Razón social de la contraparte. Omite este campo si no es legible.' },
    documentTypeGuess: {
      type: 'string',
      description: 'Texto libre con el tipo de documento tal como aparece impreso, ej. "Factura Electrónica", "Boleta", "Guía de Despacho".',
    },
    folio: { type: 'string', description: 'Número de folio del documento. Omite este campo si no es legible.' },
    issueDate: {
      type: 'string',
      description: 'Fecha de emisión en formato ISO YYYY-MM-DD. Omite este campo si no es legible o no se puede determinar con confianza — nunca inventes una fecha.',
    },
    netAmount: { type: 'number', description: 'Monto neto (sin IVA) en pesos chilenos, entero sin decimales. Omite este campo si no es legible.' },
    ivaAmount: { type: 'number', description: 'Monto de IVA en pesos chilenos, entero. Omite este campo si no es legible o el documento es exento.' },
    totalAmount: { type: 'number', description: 'Monto total del documento en pesos chilenos, entero. Omite este campo si no es legible.' },
    isExempt: { type: 'boolean', description: 'true si el documento es exento o no afecto a IVA.' },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Confianza global de esta extracción, considerando legibilidad de la imagen y ambigüedad de los datos.',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Advertencias puntuales para el revisor humano, ej. "fecha borrosa, verificar manualmente".',
    },
    items: {
      type: 'array',
      description:
        'OBLIGATORIO: detalle línea por línea (productos/servicios) tal como aparece impreso en el documento — descripción, cantidad y el TOTAL de esa línea (el número al final de la fila, exactamente como está impreso — no lo conviertas ni le quites o agregues IVA, eso lo hace el sistema según el tipo de documento). Casi todo documento tributario chileno trae al menos una línea; búscala con atención. Deja este arreglo vacío únicamente si de verdad no hay ningún detalle legible.',
      items: EXTRACTED_ITEM_JSON_SCHEMA,
    },
  },
  required: ['documentKind', 'isExempt', 'confidence', 'warnings', 'items'],
} as const;

function buildSystemPrompt(companyRut: string, companyName: string): string {
  return [
    'Eres un asistente que digitaliza facturas y boletas chilenas en papel para un ERP.',
    `La empresa que está importando sus documentos es "${companyName}", RUT ${companyRut}.`,
    'Si el RUT emisor del documento de la foto coincide con ese RUT, es una VENTA que la empresa emitió (documentKind: "sale") y el contacto a extraer es el RECEPTOR/CLIENTE.',
    'Si el RUT emisor es distinto, es una COMPRA que la empresa recibió de un tercero (documentKind: "purchase") y el contacto a extraer es el EMISOR/PROVEEDOR.',
    'El detalle línea por línea de productos/servicios (`items`: descripción, cantidad, total de línea) es OBLIGATORIO — casi todo documento tributario chileno lo trae impreso, aunque sea una sola línea. Búscalo con atención antes de rendirte. Solo deja `items` vacío si de verdad no hay ningún detalle legible en la imagen; nunca inventes una línea que no puedas leer.',
    'Nunca inventes un dato que no puedas leer con claridad: usa null y agrega una advertencia en `warnings`. Un dato financiero o tributario incorrecto es peor que uno faltante.',
    'Llama siempre a la herramienta `record_invoice_data` con tu mejor lectura de la imagen.',
  ].join('\n');
}

/** Fallback cuando la respuesta del modelo no se pudo interpretar en absoluto. */
function unreadableExtraction(reason: string): Extraction {
  return {
    documentKind: 'purchase',
    contactRut: null,
    contactName: null,
    documentTypeGuess: null,
    folio: null,
    issueDate: null,
    netAmount: null,
    ivaAmount: null,
    totalAmount: null,
    isExempt: false,
    confidence: 'low',
    warnings: [reason],
    items: [],
  };
}

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en el servidor');
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Espaciado de llamadas dentro de la misma invocación del Route Handler
 * (procesa un lote de fotos en secuencia). Es una defensa parcial, no total:
 * si la empresa comparte una única `GEMINI_API_KEY` de plataforma entre varios
 * tenants, dos importaciones concurrentes de empresas distintas igual pueden
 * sumar más de ~10 solicitudes/minuto entre sí — el tier gratuito no da
 * garantías de aislamiento entre solicitantes como sí lo haría una cuenta paga
 * con cupo dedicado.
 */
let lastCallAt = 0;
async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code;
  return status === 429;
}

/** Convierte el JSON crudo del modelo (campos omitidos cuando no son legibles) al shape nullable que ya validan el resto del código y `commitHistoricalRows`. */
export function normalizeExtraction(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const nullableKeys = ['contactRut', 'contactName', 'documentTypeGuess', 'folio', 'issueDate', 'netAmount', 'ivaAmount', 'totalAmount'];
  const normalized: Record<string, unknown> = { ...obj };
  for (const key of nullableKeys) {
    if (normalized[key] === undefined) normalized[key] = null;
  }
  if (normalized.warnings === undefined) normalized.warnings = [];
  normalized.items = Array.isArray(normalized.items) ? normalized.items.map(normalizeExtractedItem) : [];
  return normalized;
}

async function extractFromImage(
  base64: string,
  mimeType: AllowedImageMimeType,
  systemPrompt: string
): Promise<Extraction> {
  const client = getClient();

  const request = {
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: 'Extrae los datos tributarios de esta factura o boleta.' },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseJsonSchema: EXTRACTION_SCHEMA_JSON,
    },
  };

  await throttle();
  let responseText: string | undefined;
  try {
    const response = await client.models.generateContent(request);
    responseText = response.text;
  } catch (error) {
    if (isRateLimitError(error)) {
      // Un solo reintento con backoff: el tier gratuito devuelve 429 cuando se
      // ráfaga por sobre ~10 solicitudes/minuto, y suele bastar con esperar un
      // poco más del intervalo normal para que la siguiente pase.
      await sleep(MIN_INTERVAL_MS * 2);
      lastCallAt = Date.now();
      const retryResponse = await client.models.generateContent(request);
      responseText = retryResponse.text;
    } else {
      throw error;
    }
  }

  if (!responseText) return unreadableExtraction('El modelo no devolvió una extracción estructurada para esta imagen');

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(responseText);
  } catch {
    return unreadableExtraction('La respuesta del modelo no tuvo el formato esperado; revisa esta fila manualmente');
  }

  const parsed = extractionSchema.safeParse(normalizeExtraction(rawJson));
  if (!parsed.success) {
    return unreadableExtraction('La respuesta del modelo no tuvo el formato esperado; revisa esta fila manualmente');
  }
  return parsed.data;
}

export interface ScanContext {
  companyRut: string;
  companyName: string;
  /** Compartido entre todas las fotos del mismo lote: detecta folios duplicados dentro del mismo envío, igual que el archivo Excel/CSV detecta duplicados dentro de sí mismo. */
  lookup: ContactLookupContext;
  /** Catálogo de la empresa, para sugerir a qué producto real corresponde cada línea extraída. */
  products: ScanProduct[];
}

export async function loadScanContext(companyId: string): Promise<ScanContext> {
  const [company, lookup, products] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { rut: true, businessName: true } }),
    loadContactLookupContext(companyId),
    prisma.product.findMany({ where: { companyId }, select: { id: true, name: true, isExempt: true } }),
  ]);
  if (!company) throw new Error('Empresa no encontrada');
  return { companyRut: company.rut, companyName: company.businessName, lookup, products };
}

function toAmountString(value: number | null): string {
  return value === null ? '' : String(Math.round(value));
}

/** Reutiliza exactamente los mismos validadores que el flujo de Excel/CSV. */
function validateRow(
  entity: 'historicalSales' | 'historicalPurchases',
  values: Record<string, string>,
  rowNumber: number,
  ctx: ScanContext,
  hasItems: boolean
) {
  const validator = entity === 'historicalSales' ? validateHistoricalSalesRow : validateHistoricalPurchasesRow;
  return validator(values, rowNumber, ctx.lookup, hasItems);
}

/**
 * Convierte una extracción del modelo (venga de una foto o de un prompt de
 * texto) en la misma `AiScanRow` que consume la tabla de revisión y el commit
 * compartidos. `sourceLabel` identifica el origen en pantalla (nombre de
 * archivo para fotos, "Texto libre #N" para el importador por prompt).
 */
export function buildAiScanRowFromExtraction(
  extraction: Extraction,
  rowNumber: number,
  ctx: ScanContext,
  sourceLabel: string
): AiScanRow {
  const entity: 'historicalSales' | 'historicalPurchases' =
    extraction.documentKind === 'sale' ? 'historicalSales' : 'historicalPurchases';

  // El RUT que devuelve el modelo puede venir con formato distinto al
  // canónico (puntos/guion); se limpia igual que cualquier RUT tecleado a
  // mano antes de guardarlo en `values`, para que el validador compartido lo
  // trate exactamente igual que si viniera de una planilla.
  const contactRutRaw = extraction.contactRut ?? '';
  const contactRut = contactRutRaw && validateRut(contactRutRaw) ? cleanRut(contactRutRaw) : contactRutRaw;

  const documentTypeText = extraction.documentTypeGuess ?? '';
  const mappedType =
    entity === 'historicalSales'
      ? DTE_TYPE_TEXT_MAP[normalizeHeader(documentTypeText)]
      : PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader(documentTypeText)];

  const values: Record<string, string> = {
    contactRut,
    // Si la IA devolvió un texto que el mapa reconoce, se deja normalizado
    // (así el usuario ve directamente "Factura", "Boleta"...); si no lo
    // reconoce, se deja el texto crudo para que la validación lo marque como
    // error y el usuario lo corrija a mano en la tabla.
    ...(entity === 'historicalSales' ? { dteType: mappedType ?? documentTypeText } : { documentType: mappedType ?? documentTypeText }),
    folio: extraction.folio ?? '',
    issueDate: extraction.issueDate ?? '',
    netAmount: toAmountString(extraction.netAmount),
    totalAmount: toAmountString(extraction.totalAmount),
    isExempt: extraction.isExempt ? 'si' : 'no',
    paid: 'no',
    notes: extraction.contactName ? `Contraparte detectada: ${extraction.contactName}` : '',
  };

  // El precio impreso por línea sigue una convención distinta según el tipo de
  // documento: una Boleta es venta minorista y su precio de línea viene CON
  // IVA incluido; una Factura/Guía sigue el layout normalizado del SII (igual
  // que `computeDocument` en este propio proyecto), con precio de línea NETO y
  // el IVA desglosado solo en el resumen al pie. Aplicar la conversión de
  // Boleta a una Factura resta un 19% de más que nunca estuvo ahí.
  const isBoletaLike = mappedType === 'BOLETA_39' || mappedType === 'BOLETA';
  const { items, unmatchedCount } = buildItemLines(extraction.items, ctx.products, extraction.isExempt, isBoletaLike);

  const errors = validateRow(entity, values, rowNumber, ctx, items.length > 0);
  // Confianza baja: se marca como bloqueante explícito además de mostrarse
  // en `warnings`, para que el usuario revise cada campo antes de poder
  // confirmar — no basta con una advertencia informativa en un dato
  // financiero/tributario.
  if (extraction.confidence === 'low') {
    errors.push({ column: 'General', message: 'Confianza baja en la lectura: revisa todos los campos antes de confirmar' });
  }

  // El detalle de productos es obligatorio para todo documento digitalizado
  // (foto o prompt): una boleta/factura real siempre trae al menos una línea
  // impresa (nombre, cantidad, precio), y el total del documento debe salir
  // de sumarlas — no basta con el monto global. Si el modelo no encontró
  // ninguna línea, se bloquea para que el usuario la agregue a mano
  // ("+ Línea" en la tabla de revisión) en vez de dejar pasar un documento
  // sin desglose.
  if (items.length === 0) {
    errors.push({
      column: 'General',
      message: 'Debes ingresar el detalle de productos (nombre, cantidad y precio) antes de confirmar — agrega al menos una línea manualmente si la imagen o el texto no la mostraron con claridad.',
    });
  }

  // Red de seguridad contra una mala lectura del detalle: si la IA también
  // leyó un total de documento (independiente, del resumen impreso), la suma
  // de las líneas debe cuadrar con ese total dentro de un margen razonable de
  // redondeo. Si no cuadra, es más probable un error de lectura (línea
  // faltante, conversión neto/bruto equivocada) que un documento real
  // descuadrado — se bloquea para revisión humana en vez de dejarlo pasar.
  if (items.length > 0 && extraction.totalAmount !== null) {
    const sumOfLines = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const netHeaderTotal = extraction.isExempt ? extraction.totalAmount : calculateNeto(extraction.totalAmount);
    const tolerance = Math.max(50, Math.round(netHeaderTotal * 0.02));
    if (Math.abs(sumOfLines - netHeaderTotal) > tolerance) {
      errors.push({
        column: 'General',
        message: `El detalle de productos (suma $${sumOfLines.toLocaleString('es-CL')}) no cuadra con el total leído del documento ($${extraction.totalAmount.toLocaleString('es-CL')}). Revisa las líneas o los montos antes de confirmar.`,
      });
    }
  }

  const warnings = [...extraction.warnings];
  if (unmatchedCount > 0) {
    warnings.push(
      `${unmatchedCount} línea(s) sin producto del catálogo vinculado: se guardarán como detalle informativo, sin afectar inventario. Puedes vincularlas manualmente en la tabla.`
    );
  }

  return {
    entity,
    row: { rowNumber, values, errors, items },
    confidence: extraction.confidence,
    warnings,
    sourceFileName: sourceLabel,
  };
}

/**
 * Escanea un lote de imágenes y arma una fila candidata por imagen, en el
 * mismo `values` shape que `historicalSales`/`historicalPurchases`. Nunca
 * escribe en la base de datos.
 */
export async function scanInvoiceImages(
  companyId: string,
  images: Array<{ fileName: string; buffer: Buffer; mimeType: AllowedImageMimeType }>
): Promise<AiScanRow[]> {
  const ctx = await loadScanContext(companyId);
  const systemPrompt = buildSystemPrompt(ctx.companyRut, ctx.companyName);

  const results: AiScanRow[] = [];
  let rowNumber = 1;
  for (const image of images) {
    const base64 = image.buffer.toString('base64');
    let extraction: Extraction;
    try {
      extraction = await extractFromImage(base64, image.mimeType, systemPrompt);
    } catch (error) {
      extraction = unreadableExtraction(
        error instanceof Error ? `Error al contactar al modelo: ${error.message}` : 'Error al contactar al modelo'
      );
    }

    results.push(buildAiScanRowFromExtraction(extraction, rowNumber++, ctx, image.fileName));
  }

  return results;
}
