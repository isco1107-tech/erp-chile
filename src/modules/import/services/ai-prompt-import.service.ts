import { z } from 'zod';
import { generateAgentJson } from '@/modules/agents/services/gemini-agent';
import {
  EXTRACTION_SCHEMA_JSON,
  buildAiScanRowFromExtraction,
  extractionSchema,
  loadScanContext,
  normalizeExtraction,
} from './ai-scan.service';
import { MAX_AI_PROMPT_DOCUMENTS, type AiScanRow } from '../schema';

/**
 * Interpreta un prompt de texto libre ("Boleta 1234 a Juan Pérez RUT
 * 12.345.678-9 por $15.000 el 3 de marzo...") y arma filas candidatas en el
 * mismo formato que produce el escaneo de fotos (`ai-scan.service.ts`) — un
 * prompt puede describir varios documentos a la vez, así que se le pide al
 * modelo un arreglo en vez de una sola extracción.
 *
 * Igual que el escaneo de fotos: SOLO extrae y arma filas candidatas, nunca
 * escribe en la base de datos. La inserción real siempre pasa por
 * `commitHistoricalRows` después de revisión humana en pantalla.
 *
 * Reutiliza el cliente Gemini compartido (`generateAgentJson`, ya usado por
 * los agentes automáticos) en vez de crear un tercer cliente/throttle propio.
 */

const responseSchema = z.object({ documents: z.array(extractionSchema) });

const PROMPT_RESPONSE_SCHEMA_JSON = {
  type: 'object',
  properties: {
    documents: {
      type: 'array',
      items: EXTRACTION_SCHEMA_JSON,
      description: 'Un elemento por cada boleta, factura, guía o documento de compra distinto mencionado en el texto.',
    },
  },
  required: ['documents'],
} as const;

function buildSystemPrompt(companyRut: string, companyName: string): string {
  return [
    'Eres un asistente que digitaliza boletas, facturas y ventas chilenas descritas en texto libre para un ERP.',
    `La empresa que está importando sus documentos es "${companyName}", RUT ${companyRut}.`,
    'El usuario puede describir uno o varios documentos en el mismo mensaje (por ejemplo, un resumen de ventas de la semana): devuelve un elemento en `documents` por cada documento distinto que identifiques.',
    'Si el documento lo emitió la empresa a un tercero, es una VENTA (documentKind: "sale") y el contacto a extraer es el CLIENTE. Si un tercero se lo emitió a la empresa, es una COMPRA (documentKind: "purchase") y el contacto es el PROVEEDOR. Ante ambigüedad, asume venta — es el caso más común al describir boletas/facturas propias.',
    'El detalle de productos/servicios (`items`) es OBLIGATORIO por documento: descripción, cantidad y total de línea, tal como el texto los describa. Si el usuario solo dio un monto global sin desglose, pídeselo con una advertencia en `warnings` en vez de inventar una línea — pero intenta primero leer el detalle si el texto lo trae, aunque sea informal ("2 notebooks y un mouse").',
    'Nunca inventes un dato que el texto no exprese con claridad: usa null y agrega una advertencia en `warnings`. Un dato financiero o tributario incorrecto es peor que uno faltante.',
    'Si el texto no describe ningún documento identificable, devuelve `documents: []`.',
  ].join('\n');
}

function normalizeResponse(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const documents = Array.isArray(obj.documents) ? obj.documents.map(normalizeExtraction) : [];
  return { documents };
}

/**
 * Interpreta un prompt de texto y devuelve una fila candidata por cada
 * documento que la IA haya identificado (hasta `MAX_AI_PROMPT_DOCUMENTS`).
 */
export async function parsePromptToRows(companyId: string, promptText: string): Promise<AiScanRow[]> {
  const ctx = await loadScanContext(companyId);
  const systemPrompt = buildSystemPrompt(ctx.companyRut, ctx.companyName);

  const parsed = await generateAgentJson(
    systemPrompt,
    promptText,
    PROMPT_RESPONSE_SCHEMA_JSON,
    (raw) => {
      const result = responseSchema.safeParse(normalizeResponse(raw));
      if (!result.success) {
        throw new Error('La respuesta del modelo no tuvo el formato esperado; reformula el texto e inténtalo de nuevo');
      }
      return result.data;
    }
  );

  if (parsed.documents.length === 0) {
    throw new Error('No se pudo identificar ningún documento en el texto. Incluye cliente, RUT, tipo de documento, folio, fecha y monto.');
  }

  const documents = parsed.documents.slice(0, MAX_AI_PROMPT_DOCUMENTS);
  return documents.map((extraction, index) =>
    buildAiScanRowFromExtraction(extraction, index + 1, ctx, `Texto libre #${index + 1}`)
  );
}
