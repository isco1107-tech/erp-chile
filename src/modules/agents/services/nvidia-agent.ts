import 'server-only';

import type { Content, FunctionDeclaration } from '@google/genai';

import type { NvidiaTarget } from './model-tiers';
import {
  contentsToOpenAiMessages,
  declarationsToOpenAiTools,
  parseChatCompletion,
  parseToolArguments,
  type OpenAiMessage,
  type OpenAiTool,
  type ParsedAssistantMessage,
} from './openai-compat';

/**
 * Cliente de la API de NVIDIA (build.nvidia.com, compatible con OpenAI) para
 * el nivel `reasoning`. Lo llama solo `gemini-agent.ts`, que ante cualquier
 * error de este archivo vuelve a Gemini: NVIDIA nunca es el único camino.
 *
 * Con `fetch` directo, sin SDK nuevo: es un solo endpoint.
 *
 * Presupuesto de tiempo: los modelos grandes del tier gratuito pueden hacer
 * cola. Toda la conversación (incluidas las vueltas de tool-calling) tiene
 * `TOTAL_BUDGET_MS`; al agotarse se aborta y el caller cae a Gemini con
 * tiempo de sobra antes de que la función serverless corte por timeout.
 */

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const TOTAL_BUDGET_MS = 40_000;

/** ~40 solicitudes/minuto del catálogo gratuito, compartidas por todas las empresas. */
const MIN_INTERVAL_MS = 1_600;

const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_500, 3_000];

class NvidiaHttpError extends Error {
  constructor(readonly status: number) {
    super(`NVIDIA respondió HTTP ${status}`);
    this.name = 'NvidiaHttpError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;
async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof NvidiaHttpError)) return false;
  return error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504;
}

interface ChatRequest {
  messages: OpenAiMessage[];
  tools?: OpenAiTool[];
}

async function chatCompletion(target: NvidiaTarget, request: ChatRequest, signal: AbortSignal): Promise<ParsedAssistantMessage> {
  const body = JSON.stringify({
    model: target.model,
    messages: request.messages,
    ...(request.tools && request.tools.length > 0 ? { tools: request.tools, tool_choice: 'auto' } : {}),
    temperature: 0.3,
    max_tokens: 4096,
    stream: false,
  });

  let attempt = 0;
  for (;;) {
    await throttle();
    try {
      const response = await fetch(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal,
      });
      if (!response.ok) throw new NvidiaHttpError(response.status);
      return parseChatCompletion(await response.json());
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryable(error) || signal.aborted) throw error;
      await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!);
      attempt++;
    }
  }
}

export async function generateNvidiaText(target: NvidiaTarget, systemPrompt: string, userPrompt: string): Promise<string> {
  const signal = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const message = await chatCompletion(
    target,
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    signal
  );
  if (!message.content) throw new Error('El modelo no devolvió una respuesta');
  return message.content;
}

/**
 * Mismo contrato que `generateAgentWithTools` de Gemini: ejecuta las tool
 * calls contra `executors`, devuelve el resultado al modelo y repite hasta
 * que responda texto o se agoten `maxIterations` vueltas.
 */
export async function generateNvidiaWithTools(
  target: NvidiaTarget,
  systemPrompt: string,
  initialContents: Content[],
  declarations: FunctionDeclaration[],
  executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  maxIterations: number
): Promise<string> {
  const signal = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const messages = contentsToOpenAiMessages(systemPrompt, initialContents);
  const tools = declarationsToOpenAiTools(declarations);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const message = await chatCompletion(target, { messages, tools }, signal);

    if (message.toolCalls.length === 0) {
      if (!message.content) throw new Error('El modelo no devolvió una respuesta');
      return message.content;
    }

    messages.push({ role: 'assistant', content: message.content, tool_calls: message.toolCalls });

    for (const call of message.toolCalls) {
      const executor = executors[call.function.name];
      const args = parseToolArguments(call.function.arguments);
      let output: unknown;
      if (!executor) {
        output = { error: `Herramienta desconocida: ${call.function.name}` };
      } else if (!args) {
        output = { error: 'Los argumentos de la herramienta no son un JSON válido' };
      } else {
        try {
          output = await executor(args);
        } catch (error) {
          output = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ output }) });
    }
  }

  throw new Error('El modelo no terminó de responder tras varias consultas a los datos');
}
