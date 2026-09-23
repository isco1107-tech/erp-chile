import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Content, FunctionDeclaration } from '@google/genai';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { generateAgentWithTools } from '@/modules/agents/services/gemini-agent';
import {
  getOverdueBalances,
  getSalesMarginSummary,
  getVatProjection,
  formatToolResultForPrompt,
} from '@/modules/agents/services/copilot-tools';

/**
 * Endpoint del AI Copilot financiero. El proxy no intercepta /api (ver
 * `src/proxy.ts`), así que la autorización vive acá — mismo patrón que
 * `src/app/api/reports/excel/route.ts`. Sin streaming (no hay precedente SSE
 * en el repo) y sin persistencia de conversación: el cliente manda el
 * historial completo en cada request y lo guarda solo en memoria del navegador.
 */

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

const SYSTEM_PROMPT = `Eres el Copiloto Financiero de un ERP chileno. Respondes preguntas sobre ventas, márgenes, cuentas por cobrar/pagar e IVA usando EXCLUSIVAMENTE las herramientas disponibles — nunca inventes una cifra que no provenga de una llamada a herramienta. Si la pregunta no requiere datos (un saludo, una aclaración), responde directo sin llamar ninguna herramienta. Los montos son en pesos chilenos (CLP), enteros. Responde en español, breve y directo, citando las cifras exactas que devolvieron las herramientas.`;

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'getSalesMarginSummary',
    description: 'Resumen de ventas netas, exentas y margen bruto (PMP) en un rango de fechas arbitrario.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Fecha inicial, formato ISO YYYY-MM-DD' },
        to: { type: 'string', description: 'Fecha final, formato ISO YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'getOverdueBalances',
    description: 'Saldos por cobrar y por pagar vencidos hace más de N días, con el detalle de los principales clientes y proveedores morosos.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        minDaysOverdue: { type: 'number', description: 'Días mínimos de mora a considerar (0 = cualquier documento vencido)' },
      },
    },
  },
  {
    name: 'getVatProjection',
    description: 'Proyección de IVA débito vs. crédito fiscal acumulado en un mes calendario.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Año, ej. 2026' },
        month: { type: 'number', description: 'Mes de 1 a 12' },
      },
    },
  },
];

function toGeminiContents(messages: z.infer<typeof requestSchema>['messages']): Content[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

export async function POST(req: Request) {
  try {
    // Módulo de Agentes (`hasCrm`) + permiso `agents:view`: el Copilot se
    // gatea con lo que ya existe para IA en vez de sumar un flag nuevo.
    const session = await requireAuthWithPermission('agents:view');

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    }

    const companyId = session.companyId;
    const executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
      getSalesMarginSummary: (args) => getSalesMarginSummary(companyId, args as { from: string; to: string }),
      getOverdueBalances: (args) => getOverdueBalances(companyId, args as { minDaysOverdue?: number }),
      getVatProjection: (args) => getVatProjection(companyId, args as { year?: number; month?: number }),
    };
    // Envuelve cada ejecutor para devolverle al modelo texto ya formateado
    // (moneda CLP, etiquetas en español) en vez del JSON crudo — mismo
    // principio que `formatFinancialSnapshotForPrompt` en business-metrics.
    const formattedExecutors = Object.fromEntries(
      Object.entries(executors).map(([name, fn]) => [
        name,
        async (args: Record<string, unknown>) => ({ resumen: formatToolResultForPrompt(name, await fn(args)) }),
      ])
    );

    const reply = await generateAgentWithTools(SYSTEM_PROMPT, toGeminiContents(parsed.data.messages), TOOLS, formattedExecutors);

    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json(
        { success: false, error: 'El Copiloto de IA no está incluido en tu plan actual' },
        { status: 403 }
      );
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'ai' });
    return NextResponse.json({ success: false, error: 'El copiloto no pudo responder en este momento' }, { status: 500 });
  }
}
