import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Content } from '@google/genai';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { generateAgentWithTools } from '@/modules/agents/services/gemini-agent';
import { buildManualSystemPrompt } from '@/modules/manual/prompt';
import { checkRateLimit, MANUAL_ASSISTANT_RATE_LIMIT } from '@/lib/security/rate-limiter';

/**
 * Endpoint del asistente del Manual de Usuario. A diferencia del Copiloto
 * Financiero (`/api/ai/copilot`), NO exige ningún módulo contratado ni
 * permiso puntual — es ayuda de uso de la app en sí, disponible para
 * cualquier usuario autenticado de cualquier rol. El proxy no intercepta
 * `/api` (ver `src/proxy.ts`), así que la autorización vive acá, mismo
 * patrón que el resto de rutas bajo `src/app/api/ai/`.
 *
 * Sin streaming ni persistencia de conversación, mismo criterio que el
 * Copiloto: el cliente manda el historial completo en cada request.
 */

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

function toGeminiContents(messages: z.infer<typeof requestSchema>['messages']): Content[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

export async function POST(req: Request) {
  try {
    const session = await getAuthContext();

    // Sin `agents:view`/`hasCrm` de por medio (a propósito, ver comentario de
    // arriba), este límite por usuario es lo único que evita que una sola
    // persona acapare la cuota gratuita de Gemini compartida por toda la
    // plataforma (Copiloto Financiero + agentes CEO/CFO/COO de otras empresas).
    const rateLimit = checkRateLimit(session.id, MANUAL_ASSISTANT_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Has hecho demasiadas preguntas seguidas. Espera un minuto y vuelve a intentar.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const systemPrompt = buildManualSystemPrompt(session.features);
    // Sin tools: el asistente del manual solo necesita el texto del manual ya
    // incluido en el system prompt, pero se reusa `generateAgentWithTools`
    // (en vez de `generateAgentText`) para poder mandarle el historial
    // completo de la conversación, no solo el último mensaje.
    const reply = await generateAgentWithTools(systemPrompt, toGeminiContents(parsed.data.messages), [], {});

    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Manual assistant failed:', error);
    return NextResponse.json({ success: false, error: 'El asistente no pudo responder en este momento' }, { status: 500 });
  }
}
