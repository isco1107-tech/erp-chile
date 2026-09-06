import 'server-only';

import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from '@google/genai';

/**
 * Cliente Gemini compartido por todos los agentes automáticos.
 *
 * Extrae el mismo patrón ya probado en
 * src/modules/import/services/ai-scan.service.ts (modelo, throttling,
 * reintento ante 429) en vez de reinventarlo: mismo modelo (`gemini-3.6-flash`,
 * tier gratuito), misma variable de entorno (`GEMINI_API_KEY`) y el mismo
 * espaciado de ~10 solicitudes/minuto entre llamadas dentro de un mismo
 * proceso — relevante acá porque el cron de agentes (`/api/agents/run`)
 * puede llamar a este cliente varias veces seguidas dentro del mismo ciclo
 * (una empresa por vez, en secuencia, nunca en paralelo).
 *
 * Igual que en ai-scan.service.ts: tier gratuito de Google, así que el
 * contenido enviado puede usarse para mejorar sus productos. Los agentes solo
 * envían datos ya agregados/anonimizables de la propia empresa (ventas,
 * datos de un lead) — nunca credenciales ni datos de terceros ajenos al lead.
 *
 * Requiere `GEMINI_API_KEY` en el entorno (mismo valor que usa el escaneo de
 * facturas). Sin ella, cualquier llamada de un agente falla y `runAgent()` la
 * registra como `AgentRun.status = FAILED` sin tumbar el resto del cron.
 */

const MODEL = 'gemini-3.6-flash';

/** Espaciado mínimo entre llamadas para no superar ~10 solicitudes/minuto del tier gratuito. */
const MIN_INTERVAL_MS = 6_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code;
  return status === 429;
}

/** Errores de red/servidor transitorios — vale la pena reintentarlos igual que un 429, no son culpa del caller. */
function isTransientError(error: unknown): boolean {
  const status = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

let lastCallAt = 0;
async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/**
 * Reintentos con backoff ante 429/5xx, antes de darle un error al usuario.
 * Compartido por todas las formas de llamar a Gemini de este archivo.
 *
 * El backoff es corto y fijo (no exponencial sobre `MIN_INTERVAL_MS`) a
 * propósito: esto corre dentro de una función serverless de Vercel que
 * responde a un usuario esperando en el chat — un backoff de decenas de
 * segundos haría que la plataforma corte la función por timeout antes de
 * terminar de reintentar, cambiando "falla al toque" por "falla lento", sin
 * arreglar nada. 2 reintentos cortos alcanzan para absorber una ráfaga
 * normal de uso sin acercarse al límite de duración de la función.
 */
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_500, 3_000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    await throttle();
    try {
      return await fn();
    } catch (error) {
      if (attempt >= MAX_RETRIES || (!isRateLimitError(error) && !isTransientError(error))) throw error;
      await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!);
      attempt++;
      lastCallAt = Date.now();
    }
  }
}

interface GenerateContentRequest {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  config: {
    systemInstruction: string;
    responseMimeType?: string;
    responseJsonSchema?: Record<string, unknown>;
  };
}

async function callWithRetry(request: GenerateContentRequest): Promise<string | undefined> {
  const client = getClient();
  const response = await withRetry(() => client.models.generateContent(request));
  return response.text;
}

/**
 * Texto libre corto (resúmenes, copys, borradores de correo). Usado por los
 * roles CEO, CMO y OUTREACH.
 */
export async function generateAgentText(systemPrompt: string, userPrompt: string): Promise<string> {
  const text = await callWithRetry({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: { systemInstruction: systemPrompt },
  });
  if (!text) throw new Error('El modelo no devolvió una respuesta');
  return text.trim();
}

/**
 * Respuesta JSON estructurada validada contra un schema. Mismo subconjunto de
 * JSON Schema que soporta Gemini que en ai-scan.service.ts (sin `nullable` ni
 * arrays de tipos): los campos opcionales se dejan fuera de `required`.
 * `parse` valida/normaliza el JSON crudo (ej. con Zod) y lanza si no calza —
 * `runAgent()` capturará ese error y marcará la corrida como `FAILED`.
 */
export async function generateAgentJson<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  parse: (raw: unknown) => T
): Promise<T> {
  const text = await callWithRetry({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
    },
  });
  if (!text) throw new Error('El modelo no devolvió una respuesta estructurada');

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(text);
  } catch {
    throw new Error('La respuesta del modelo no tuvo el formato JSON esperado');
  }
  return parse(rawJson);
}

/** Tope de vueltas del loop de tool-calling: corta un modelo que no converge en vez de encadenar llamadas indefinidamente. */
const MAX_TOOL_ITERATIONS = 4;

/**
 * Conversación con tool-calling (function calling de Gemini): el modelo puede
 * pedir una o más `FunctionCall` en vez de responder texto directo; acá se
 * ejecutan contra `executors` y se le devuelve el resultado como
 * `functionResponse`, en el mismo turno si pidió varias a la vez, hasta que
 * responda texto o se agoten las vueltas. Usado por el AI Copilot
 * (`src/app/api/ai/copilot/route.ts`) — nunca por los agentes CEO/CFO/COO
 * automáticos, que no necesitan tools todavía.
 */
export async function generateAgentWithTools(
  systemPrompt: string,
  initialContents: Content[],
  tools: FunctionDeclaration[],
  executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
): Promise<string> {
  const client = getClient();
  const contents: Content[] = [...initialContents];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Antes esta llamada iba directo a `client.models.generateContent`, sin
    // pasar por `withRetry` — un solo 429 (muy fácil de gatillar: la cuota
    // gratuita de ~10 req/min se comparte entre el Copiloto, el Asistente del
    // Manual y el cron de agentes CEO/CFO/COO de TODAS las empresas) tumbaba
    // la respuesta de inmediato en vez de reintentar. Con `withRetry` (hasta
    // 4 reintentos con backoff exponencial) absorbe ráfagas normales de uso.
    const response = await withRetry(() =>
      client.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          // Solo se manda `tools` cuando hay funciones reales que ofrecer — el
          // asistente del Manual de Usuario reusa esta función únicamente por
          // el soporte de historial multi-turno (`initialContents`), sin
          // ninguna tool, y no vale la pena arriesgarse a que la API rechace
          // `functionDeclarations: []` como config inválida.
          ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      })
    );

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      const text = response.text;
      if (!text) throw new Error('El modelo no devolvió una respuesta');
      return text.trim();
    }

    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const responseParts: Part[] = [];
    for (const call of calls) {
      const executor = call.name ? executors[call.name] : undefined;
      let output: unknown;
      if (!executor) {
        output = { error: `Herramienta desconocida: ${call.name ?? '(sin nombre)'}` };
      } else {
        try {
          output = await executor(call.args ?? {});
        } catch (error) {
          output = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      responseParts.push({ functionResponse: { name: call.name, id: call.id, response: { output } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  throw new Error('El copiloto no pudo terminar de responder tras varias consultas a los datos — intenta reformular la pregunta');
}
