import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Content, FunctionDeclaration } from '@google/genai';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { generateAgentWithTools } from '@/modules/agents/services/gemini-agent';
import { buildManualSystemPrompt } from '@/modules/manual/prompt';
import { checkRateLimit, MANUAL_ASSISTANT_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getAgentAction } from '@/modules/agent-actions/registry';
import { signPendingAction } from '@/modules/agent-actions/token';
import { DATA_TOOLS, availableDataTools, canSeeMargins, type DataToolName } from '@/modules/agents/assistant-data-tools';
import {
  formatToolResultForPrompt,
  getOverdueBalances,
  getSalesMarginSummary,
  getVatProjection,
} from '@/modules/agents/services/copilot-tools';

/**
 * Endpoint del Asistente (único asistente del panel: absorbió al antiguo
 * Copiloto Financiero). NO exige ningún módulo contratado para abrirse — es
 * ayuda de uso de la app, disponible para cualquier usuario autenticado. El
 * proxy no intercepta `/api` (ver `src/proxy.ts`), así que la autorización
 * vive acá, mismo patrón que el resto de rutas bajo `src/app/api/ai/`.
 *
 * Responde con cifras reales vía las consultas de `assistant-data-tools.ts`,
 * ofrecidas solo si el usuario tiene el permiso que las cubre (y con él, el
 * módulo contratado): cada consulta es de solo lectura y cerrada sobre el
 * `companyId` de la sesión, nunca uno que mande el modelo.
 *
 * Además de explicar, puede PROPONER acciones concretas (crear un contacto,
 * una candidata, etc. — ver `src/modules/agent-actions/registry.ts`) vía la
 * tool `proposeAction`, que nunca escribe nada por sí sola: valida, revisa
 * permiso, y devuelve un token firmado que el usuario debe confirmar
 * explícitamente contra `/api/ai/manual-assistant/confirm`.
 *
 * Sin streaming ni persistencia de conversación: el cliente manda el historial completo en cada request.
 */

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  /**
   * Ruta del dashboard donde está parado el usuario. Solo se usa para darle
   * contexto al prompt ("está en Cuentas por Cobrar"), nunca para decidir
   * acceso — por eso basta con validar la forma y no hace falta cruzarla con
   * los permisos: el mapa de pantallas del prompt ya viene filtrado.
   */
  currentPath: z
    .string()
    .max(200)
    .refine((value) => value.startsWith('/'), 'Ruta inválida')
    .optional(),
});

function toGeminiContents(messages: z.infer<typeof requestSchema>['messages']): Content[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

const PROPOSE_ACTION_TOOL: FunctionDeclaration = {
  name: 'proposeAction',
  description:
    'Propone ejecutar una acción concreta listada en ACCIONES DISPONIBLES. Nunca ejecuta nada de inmediato: valida los datos y devuelve un resumen para que el usuario confirme con un botón.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      actionType: { type: 'string', description: 'Uno de los tipos exactos listados en ACCIONES DISPONIBLES' },
      payload: { type: 'object', description: 'Los campos de esa acción, según la lista de "Campos del payload"' },
    },
    required: ['actionType', 'payload'],
  },
};

export async function POST(req: Request) {
  try {
    const session = await getAuthContext();

    // Sin `agents:view`/`hasCrm` de por medio (a propósito, ver comentario de
    // arriba), este límite por usuario es lo único que evita que una sola
    // persona acapare la cuota gratuita de Gemini compartida por toda la
    // plataforma (agentes CEO/CFO/COO de otras empresas).
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

    const dataToolNames = availableDataTools(session.permissions);
    const systemPrompt = buildManualSystemPrompt({
      features: session.features,
      permissions: session.permissions,
      companyName: session.companyName,
      userName: session.name,
      currentPath: parsed.data.currentPath,
      dataTools: dataToolNames.map((name) => ({ name, summary: DATA_TOOLS[name].summary })),
    });

    // El resultado de una `proposeAction` exitosa (token + resumen) no puede
    // viajar de vuelta al cliente dentro del texto que redacta el modelo —
    // se captura acá, fuera de la conversación, y se manda aparte en la
    // respuesta HTTP para que el widget renderice los botones de confirmar.
    let pendingAction: { token: string; summary: string } | null = null;

    const executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
      proposeAction: async (args) => {
        const actionType = typeof args.actionType === 'string' ? args.actionType : '';
        const action = getAgentAction(actionType);
        if (!action) return { error: `No existe la acción "${actionType}".` };
        if (!session.permissions.includes(action.requiredPermission)) {
          return { error: 'El usuario no tiene permiso para realizar esta acción.' };
        }

        const rawPayload = args.payload && typeof args.payload === 'object' ? (args.payload as Record<string, unknown>) : {};
        try {
          const resolved = await action.resolve(session.companyId, rawPayload);
          const token = signPendingAction({
            actionType,
            payload: resolved.payload,
            companyId: session.companyId,
            userId: session.id,
            requiredPermission: action.requiredPermission,
          });
          pendingAction = { token, summary: resolved.summary };
          return { ok: true, summary: resolved.summary };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'No se pudo procesar la acción' };
        }
      },
    };

    // Consultas de datos: solo las habilitadas para este usuario, y el
    // resultado se le entrega al modelo ya formateado (CLP, etiquetas en
    // español) en vez del JSON crudo.
    const companyId = session.companyId;
    const includeMargin = canSeeMargins(session.permissions);
    const dataExecutors: Record<DataToolName, (args: Record<string, unknown>) => Promise<unknown>> = {
      getSalesMarginSummary: (args) => getSalesMarginSummary(companyId, args as { from: string; to: string }),
      getOverdueBalances: (args) => getOverdueBalances(companyId, args as { minDaysOverdue?: number }),
      getVatProjection: (args) => getVatProjection(companyId, args as { year?: number; month?: number }),
    };
    for (const name of dataToolNames) {
      executors[name] = async (args) => ({ resumen: formatToolResultForPrompt(name, await dataExecutors[name](args), { includeMargin }) });
    }

    const reply = await generateAgentWithTools(
      systemPrompt,
      toGeminiContents(parsed.data.messages),
      [PROPOSE_ACTION_TOOL, ...dataToolNames.map((name) => DATA_TOOLS[name].declaration)],
      executors,
      'reasoning'
    );

    return NextResponse.json({ success: true, data: { reply, pendingAction } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'ai' });
    return NextResponse.json({ success: false, error: 'El asistente no pudo responder en este momento' }, { status: 500 });
  }
}
