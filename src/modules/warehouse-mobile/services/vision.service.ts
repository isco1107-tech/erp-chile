import 'server-only';

import { GoogleGenAI } from '@google/genai';
import { resolveAgentModel } from '@/modules/agents/services/model-tiers';
import { VISION_JSON_SCHEMA, VISION_SYSTEM_PROMPT, VISION_USER_PROMPT } from '@/lib/warehouse-mobile/vision';

/**
 * Una única llamada a Gemini por foto. No reintenta ni espera a propósito: la
 * cuota es compartida con el resto de la plataforma, así que un 429 se reporta
 * enseguida (`VisionRateLimitedError`) para que el servidor frene a todos en vez
 * de insistir. Quien decide si hay cupo antes de llamar es `identify.service.ts`.
 */

/** Gemini respondió 429: se activó el enfriamiento general. */
export class VisionRateLimitedError extends Error {
  constructor() {
    super('La IA alcanzó su límite de uso por ahora');
  }
}

/** No hay llave configurada o la llamada se agotó: la app sigue con búsqueda manual. */
export class VisionUnavailableError extends Error {}

const CALL_TIMEOUT_MS = 25_000;

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new VisionUnavailableError('Falta configurar GEMINI_API_KEY en el servidor');
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

export function visionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Modelo de visión: el nivel `lite` de los agentes, salvo que se fije otro. */
export function visionModel(): string {
  return process.env.WAREHOUSE_VISION_MODEL?.trim() || resolveAgentModel('lite');
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { status?: number; code?: number } | null;
  return candidate?.status ?? candidate?.code;
}

/** Devuelve el JSON crudo del modelo (sin validar: `normalizeVisionRead` lo limpia). */
export async function readProductPhoto(jpeg: Buffer): Promise<{ raw: unknown; model: string }> {
  const client = getClient();
  const model = visionModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }, { text: VISION_USER_PROMPT }],
        },
      ],
      config: {
        systemInstruction: VISION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: VISION_JSON_SCHEMA,
        temperature: 0,
        abortSignal: controller.signal,
      },
    });
    const text = response.text;
    if (!text) throw new VisionUnavailableError('El modelo no devolvió una lectura');
    try {
      return { raw: JSON.parse(text), model };
    } catch {
      throw new VisionUnavailableError('La respuesta del modelo no tuvo el formato esperado');
    }
  } catch (error) {
    if (error instanceof VisionUnavailableError) throw error;
    if (statusOf(error) === 429) throw new VisionRateLimitedError();
    if (controller.signal.aborted) throw new VisionUnavailableError('La IA tardó demasiado en responder');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
