import { z } from 'zod';
import type { Content, FunctionDeclaration } from '@google/genai';

/**
 * Traducción pura entre el formato de Gemini (el que usan los callers de
 * `gemini-agent.ts`) y el de la API de chat compatible con OpenAI que expone
 * NVIDIA. Sin I/O, para poder probarla sin red.
 */

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface OpenAiTool {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

/** Historial de texto de Gemini (`user`/`model`) → mensajes OpenAI, con el prompt de sistema al inicio. */
export function contentsToOpenAiMessages(systemPrompt: string, contents: Content[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const content of contents) {
    const text = (content.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) continue;
    messages.push(content.role === 'model' ? { role: 'assistant', content: text } : { role: 'user', content: text });
  }
  return messages;
}

/**
 * Solo se admite `parametersJsonSchema` (JSON Schema estándar, el que usan
 * todas las tools del repo). `parameters` usa el enum `Type` de Gemini
 * (`OBJECT`, `STRING`...), que OpenAI no entiende: se rechaza en vez de
 * mandar una tool sin argumentos.
 */
export function declarationsToOpenAiTools(declarations: FunctionDeclaration[]): OpenAiTool[] {
  return declarations.map((declaration) => {
    if (!declaration.name) throw new Error('Herramienta sin nombre');
    const schema = declaration.parametersJsonSchema;
    if (declaration.parameters && !schema) {
      throw new Error(`La herramienta ${declaration.name} no tiene parametersJsonSchema`);
    }
    const parameters =
      schema && typeof schema === 'object' && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : { type: 'object', properties: {} };
    return {
      type: 'function',
      function: {
        name: declaration.name,
        ...(declaration.description ? { description: declaration.description } : {}),
        parameters,
      },
    };
  });
}

const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                type: z.literal('function').optional(),
                function: z.object({ name: z.string(), arguments: z.string().nullish() }),
              })
            )
            .nullish(),
        }),
      })
    )
    .min(1),
});

export interface ParsedAssistantMessage {
  content: string | null;
  toolCalls: OpenAiToolCall[];
}

/** Valida la respuesta de `/v1/chat/completions` y la reduce al primer mensaje. */
export function parseChatCompletion(raw: unknown): ParsedAssistantMessage {
  const parsed = chatCompletionSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Respuesta inesperada del proveedor de IA');
  const message = parsed.data.choices[0]!.message;
  const toolCalls: OpenAiToolCall[] = (message.tool_calls ?? []).map((call) => ({
    id: call.id,
    type: 'function',
    function: { name: call.function.name, arguments: call.function.arguments ?? '' },
  }));
  const content = message.content ? stripThinking(message.content) : '';
  return { content: content ? content : null, toolCalls };
}

/**
 * Algunos modelos de razonamiento del catálogo devuelven su cadena de
 * pensamiento dentro de `<think>…</think>` en el mismo `content`: al usuario
 * solo le llega la respuesta final.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Argumentos de una tool call (JSON en string). `null` si no son un objeto JSON válido. */
export function parseToolArguments(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
