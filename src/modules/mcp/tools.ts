import 'server-only';

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { resolveMcpSession, type McpSession } from './services/tokens.service';
import { DATA_TOOLS, availableDataTools, canSeeMargins, type DataToolName } from '@/modules/agents/assistant-data-tools';
import {
  findProducts,
  formatToolResultForPrompt,
  getContactBalance,
  getLowStockProducts,
  getOverdueBalances,
  getSalesMarginSummary,
  getVatProjection,
} from '@/modules/agents/services/copilot-tools';
import { getVisibleManualSections, searchManual } from '@/modules/manual/content';

/**
 * Tools que expone el servidor MCP (`/api/mcp`) a un Claude/ChatGPT PERSONAL
 * conectado con un token propio — ver `services/tokens.service.ts`.
 *
 * Alcance deliberado, V1: solo lectura. Nada de aquí crea, edita ni borra
 * datos — "ayudar a navegar y dar consejos", no "hacer cambios en nombre de
 * la persona". El motor de propuesta/confirmación que ya existe para el
 * Asistente interno (`agent-actions/`) queda fuera de este conector por
 * ahora: escribir en la empresa desde una IA fuera del control de la
 * compañía es una decisión de mayor alcance, aparte.
 *
 * Cada tool vuelve a resolver la sesión desde cero en cada llamada
 * (`resolveMcpSession`, nunca un valor cacheado) y vuelve a chequear el
 * permiso específico que necesita — la puerta de `withMcpAuth` en
 * `app/api/mcp/route.ts` ya validó el token, pero la autorización real de
 * QUÉ puede ver esta persona vive acá, igual que en cualquier Server Action.
 */

interface ToolContext {
  http?: { authInfo?: { token: string } };
}

async function requireSession(ctx: ToolContext): Promise<McpSession> {
  const token = ctx.http?.authInfo?.token;
  if (!token) throw new Error('No autenticado');
  const session = await resolveMcpSession(token);
  if (!session) throw new Error('Token inválido, revocado, o el conector fue desactivado por tu empresa');
  return session;
}

function denied(permission: string) {
  return { content: [{ type: 'text' as const, text: `No tienes el permiso "${permission}" para esto en Aether.` }], isError: true };
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    'whoami',
    {
      title: 'Quién soy',
      description: 'Identifica a la persona y la empresa conectadas, y qué otras consultas de datos puede usar según sus permisos.',
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const session = await requireSession(ctx as ToolContext);
      const available = availableDataTools(session.permissions);
      const lines = [
        `Persona: ${session.userName}, empresa: ${session.companyName}.`,
        available.length > 0
          ? `Consultas de datos disponibles: ${available.map((name) => `${name} (${DATA_TOOLS[name].summary})`).join('; ')}.`
          : 'No tiene permisos para ninguna consulta de datos del negocio, solo el manual de ayuda.',
      ];
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.registerTool(
    'search_manual',
    {
      title: 'Buscar en el manual de Aether',
      description: 'Busca cómo hacer algo en el ERP (ej. "cómo emito una factura", "cómo cierro remuneraciones"). Sin texto de búsqueda, devuelve el índice completo de secciones disponibles para esta empresa.',
      inputSchema: z.object({ query: z.string().trim().max(200).optional() }),
    },
    async ({ query }, ctx) => {
      const session = await requireSession(ctx as ToolContext);
      const sections = getVisibleManualSections(session.features, session.permissions);
      // Sin tildes y por palabras: "anular boleta" encuentra "Anular una boleta hecha por error".
      const matches = query?.trim() ? searchManual(sections, query) : sections;

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No encontré nada del manual para "${query}". Prueba con otras palabras o sin texto de búsqueda para ver el índice completo.` }] };
      }

      const text = matches
        .map((section) => {
          const topicLines = section.topics.map((topic) => `  - ${topic.title}:\n    ${topic.steps.join('\n    ')}`).join('\n');
          return `## ${section.title} (${section.route})\n${section.summary}\n${topicLines}`;
        })
        .join('\n\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  const dataToolNames = Object.keys(DATA_TOOLS) as DataToolName[];
  for (const name of dataToolNames) {
    const definition = DATA_TOOLS[name];
    server.registerTool(
      name,
      {
        title: definition.declaration.name,
        description: definition.declaration.description ?? definition.summary,
        inputSchema: jsonSchemaToZodShape(name),
      },
      async (args: Record<string, unknown>, ctx: ToolContext) => {
        const session = await requireSession(ctx);
        const missing = definition.requires.find((permission) => !session.permissions.includes(permission));
        if (missing) return denied(missing);

        const result = await callDataTool(name, session.companyId, args);
        const summary = formatToolResultForPrompt(name, result, { includeMargin: canSeeMargins(session.permissions) });
        return {
          content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );
  }
}

/**
 * `DATA_TOOLS` describe sus parámetros como JSON Schema (para Gemini); acá
 * hace falta el mismo contrato en Zod. Se define a mano en vez de convertir
 * el JSON Schema en runtime — son pocas tools, no vale la pena una dependencia
 * de conversión para esto.
 */
function jsonSchemaToZodShape(name: DataToolName) {
  switch (name) {
    case 'getSalesMarginSummary':
      return z.object({
        from: z.string().describe('Fecha inicial, formato ISO YYYY-MM-DD'),
        to: z.string().describe('Fecha final, formato ISO YYYY-MM-DD'),
      });
    case 'getOverdueBalances':
      return z.object({
        minDaysOverdue: z.number().optional().describe('Días mínimos de mora a considerar (0 = cualquier documento vencido)'),
      });
    case 'getVatProjection':
      return z.object({
        year: z.number().optional().describe('Año, ej. 2026'),
        month: z.number().optional().describe('Mes de 1 a 12'),
      });
    case 'findProducts':
      return z.object({ query: z.string().trim().min(1).max(120).describe('Nombre, SKU o código de barras') });
    case 'getLowStockProducts':
      return z.object({ limit: z.number().optional().describe('Máximo de productos a listar (por defecto 15)') });
    case 'getContactBalance':
      return z.object({ query: z.string().trim().min(1).max(120).describe('Razón social o RUT del contacto') });
  }
}

async function callDataTool(name: DataToolName, companyId: string, args: Record<string, unknown>) {
  switch (name) {
    case 'getSalesMarginSummary':
      return getSalesMarginSummary(companyId, args as { from: string; to: string });
    case 'getOverdueBalances':
      return getOverdueBalances(companyId, args as { minDaysOverdue?: number });
    case 'getVatProjection':
      return getVatProjection(companyId, args as { year?: number; month?: number });
    case 'findProducts':
      return findProducts(companyId, args as { query: string });
    case 'getLowStockProducts':
      return getLowStockProducts(companyId, args as { limit?: number });
    case 'getContactBalance':
      return getContactBalance(companyId, args as { query: string });
  }
}
