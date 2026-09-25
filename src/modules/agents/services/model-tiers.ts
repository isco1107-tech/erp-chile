/**
 * Nivel de capacidad que pide cada uso de IA del ERP, para no pagar (en cuota
 * o en latencia) un modelo de razonamiento donde basta uno liviano, ni quedarse
 * corto donde la tarea lo exige:
 *
 * - `lite`: emparejar o mapear en volumen (productos de una factura, columnas
 *   de una importación). Mucho texto de entrada, respuesta mecánica.
 * - `standard`: recomendaciones estructuradas sobre métricas ya calculadas
 *   (CFO, COO, Ventas, organigrama).
 * - `reasoning`: síntesis entre varias fuentes (prioridades del CEO) y el
 *   Asistente, que encadena consultas a los datos con tool-calling.
 *
 * Cada nivel se elige por variable de entorno y, si no está definida, cae al
 * mismo modelo que se usaba antes para todo: configurar un nivel nunca es
 * obligatorio y el comportamiento por defecto no cambia. Ojo con el tier
 * gratuito de Gemini: los modelos de razonamiento tienen cuotas por minuto más
 * bajas, y la cuota se comparte entre todas las empresas de la plataforma.
 */
export type AgentModelTier = 'lite' | 'standard' | 'reasoning';

export const DEFAULT_AGENT_MODEL = 'gemini-3.6-flash';

const TIER_ENV: Record<AgentModelTier, string> = {
  lite: 'GEMINI_MODEL_LITE',
  standard: 'GEMINI_MODEL_STANDARD',
  reasoning: 'GEMINI_MODEL_REASONING',
};

export function resolveAgentModel(
  tier: AgentModelTier,
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env[TIER_ENV[tier]]?.trim();
  return configured ? configured : DEFAULT_AGENT_MODEL;
}

/**
 * Modelo del catálogo de NVIDIA (build.nvidia.com) para el nivel `reasoning`
 * cuando no se define `NVIDIA_MODEL_REASONING`. Los IDs del catálogo cambian:
 * confirmar el vigente con `GET https://integrate.api.nvidia.com/v1/models`.
 */
export const DEFAULT_NVIDIA_REASONING_MODEL = 'deepseek-ai/deepseek-v4-pro';

export interface NvidiaTarget {
  apiKey: string;
  model: string;
}

/**
 * Si un nivel debe ir a NVIDIA en vez de Gemini. Hoy solo `reasoning` (CEO y
 * Asistente): es donde un modelo más grande se nota, y sus llamadas son texto
 * libre o tool-calling, que la API compatible con OpenAI de NVIDIA cubre. Las
 * respuestas JSON con esquema (`lite`/`standard`) siguen en Gemini.
 *
 * Sin `NVIDIA_API_KEY` devuelve `null` y todo sigue en Gemini, como siempre.
 */
export function resolveNvidiaTarget(
  tier: AgentModelTier,
  env: Record<string, string | undefined> = process.env
): NvidiaTarget | null {
  if (tier !== 'reasoning') return null;
  const apiKey = env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.NVIDIA_MODEL_REASONING?.trim();
  return { apiKey, model: model ? model : DEFAULT_NVIDIA_REASONING_MODEL };
}
