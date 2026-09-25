import { z } from 'zod';

/**
 * Shape común de la respuesta de los endpoints de chat de IA
 * (`/api/ai/manual-assistant`) — `res.json()` devuelve
 * `any` por defecto (tipo de la lib DOM); esto le da un tipo real antes de
 * leer `data.reply`/`error` en los widgets de chat. `pendingAction` solo lo
 * puebla el asistente del manual cuando propone una acción para confirmar
 * (ver `src/modules/agent-actions/registry.ts`).
 */
export const chatResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      reply: z.string(),
      pendingAction: z.object({ token: z.string(), summary: z.string() }).nullable().optional(),
    }),
  }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type ChatResponse = z.infer<typeof chatResponseSchema>;

/** Parsea `res.json()`; si la respuesta no tiene el shape esperado, la trata como error. */
export function parseChatResponse(json: unknown): ChatResponse {
  const parsed = chatResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  return { success: false, error: 'Respuesta inesperada del servidor' };
}

/** Respuesta de `/api/ai/manual-assistant/confirm`. */
export const confirmResponseSchema = z.union([
  z.object({ success: z.literal(true), data: z.object({ message: z.string() }) }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type ConfirmResponse = z.infer<typeof confirmResponseSchema>;

export function parseConfirmResponse(json: unknown): ConfirmResponse {
  const parsed = confirmResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  return { success: false, error: 'Respuesta inesperada del servidor' };
}
