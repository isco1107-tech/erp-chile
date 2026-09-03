import 'server-only';

import { z } from 'zod';
import { generateAgentJson } from '@/modules/agents/services/gemini-agent';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { listJobPositions, listStaffFlat, validateManagerAssignment } from './org-chart.service';

/**
 * Sugerencia de organigrama on-demand (botón, síncrono desde una Server
 * Action) — a diferencia de los agentes de `src/modules/agents/engine.ts`,
 * esto NO usa `AgentTask`/`AgentRun`/`runAgent()`: no persiste nada hasta que
 * el administrador confirme aplicar (`applyOrgChartAssignmentsAction`).
 */
export interface OrgChartSuggestion {
  userId: string;
  suggestedManagerId: string | null;
  /** Ya resuelto por nombre contra el catálogo real de la empresa. */
  suggestedJobPositionId: string | null;
  /** Para mostrar en la UI, aunque `suggestedJobPositionId` sea null. */
  suggestedJobPositionName: string | null;
  reasoning: string;
}

const rawSuggestionSchema = z.object({
  userId: z.string().min(1),
  suggestedManagerId: z.string().nullable(),
  suggestedJobPositionName: z.string().nullable(),
  reasoning: z.string().min(1),
});

const rawSuggestionsSchema = z.object({ suggestions: z.array(rawSuggestionSchema) });

type RawSuggestion = z.infer<typeof rawSuggestionSchema>;
type RawSuggestions = z.infer<typeof rawSuggestionsSchema>;

const SUGGESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Id exacto del colaborador, tomado de la lista entregada.' },
          suggestedManagerId: {
            type: 'string',
            description: 'Id exacto del jefe sugerido, tomado de la lista entregada, o null si no hay información suficiente.',
          },
          suggestedJobPositionName: {
            type: 'string',
            description: 'Nombre exacto de un cargo del catálogo entregado, o null si no hay información suficiente.',
          },
          reasoning: { type: 'string', description: 'Justificación breve (1-2 frases) en español, basada solo en los datos entregados.' },
        },
        // El subconjunto de JSON Schema que soporta Gemini no incluye `nullable`
        // ni arrays de tipos (`['string','null']`): los campos que pueden ser
        // null se dejan FUERA de `required` para que el modelo pueda omitirlos,
        // y `normalizeSuggestions` trata la ausencia como `null` explícitamente
        // antes del parseo con Zod (mismo patrón que ai-scan.service.ts).
        required: ['userId', 'reasoning'],
      },
    },
  },
  required: ['suggestions'],
} as const;

const SYSTEM_PROMPT = [
  'Eres un consultor de estructura organizacional para una pyme chilena.',
  'Usa SOLO los ids de colaborador y nombres de cargo que aparecen en la lista entregada, nunca inventes uno nuevo.',
  'Si no tienes información suficiente para sugerir un jefe o cargo para alguien, OMITE ese campo en vez de adivinar (no escribas la palabra "null", simplemente no incluyas la propiedad).',
  'Nunca sugieras que alguien sea su propio jefe.',
  'Responde con una sugerencia por cada colaborador de la lista.',
].join('\n');

/** Convierte el JSON crudo del modelo (campos omitidos cuando el modelo no tuvo información suficiente) al shape nullable que valida `rawSuggestionsSchema`. */
function normalizeSuggestions(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.suggestions)) return raw;

  const suggestions = obj.suggestions.map((item) => {
    if (typeof item !== 'object' || item === null) return item;
    const entry = { ...(item as Record<string, unknown>) };
    if (entry.suggestedManagerId === undefined) entry.suggestedManagerId = null;
    if (entry.suggestedJobPositionName === undefined) entry.suggestedJobPositionName = null;
    return entry;
  });

  return { ...obj, suggestions };
}

interface RealUser {
  id: string;
  name: string;
  managerId: string | null;
}

interface RealPosition {
  id: string;
  name: string;
}

/**
 * Nunca confiar en que el modelo solo devolvió ids/nombres reales: sanea cada
 * fila contra los datos reales de la empresa antes de mostrarla en la UI.
 */
export function sanitizeSuggestions(
  raw: RawSuggestions,
  realUsers: RealUser[],
  realPositions: RealPosition[]
): OrgChartSuggestion[] {
  const userIds = new Set(realUsers.map((u) => u.id));
  const positionByName = new Map(realPositions.map((p) => [p.name.trim().toLowerCase(), p]));

  const result: OrgChartSuggestion[] = [];

  for (const suggestion of raw.suggestions as RawSuggestion[]) {
    // 1. Descarta cualquier fila cuyo userId no exista en realUsers.
    if (!userIds.has(suggestion.userId)) continue;

    // 2. managerId inexistente o igual al propio userId -> resuelve a null.
    let suggestedManagerId = suggestion.suggestedManagerId;
    if (suggestedManagerId !== null) {
      if (suggestedManagerId === suggestion.userId || !userIds.has(suggestedManagerId)) {
        suggestedManagerId = null;
      }
    }

    // 3. Resuelve suggestedJobPositionName a suggestedJobPositionId por match exacto (case-insensitive).
    let suggestedJobPositionId: string | null = null;
    let suggestedJobPositionName: string | null = null;
    if (suggestion.suggestedJobPositionName) {
      const match = positionByName.get(suggestion.suggestedJobPositionName.trim().toLowerCase());
      if (match) {
        suggestedJobPositionId = match.id;
        suggestedJobPositionName = match.name;
      }
    }

    // 4. Si crearía un ciclo, resuelve manager/cargo de esa fila a null en vez
    // de descartar toda la fila (mejor una sugerencia parcial que ninguna).
    try {
      validateManagerAssignment(realUsers, suggestion.userId, suggestedManagerId);
    } catch {
      suggestedManagerId = null;
      suggestedJobPositionId = null;
      suggestedJobPositionName = null;
    }

    result.push({
      userId: suggestion.userId,
      suggestedManagerId,
      suggestedJobPositionId,
      suggestedJobPositionName,
      reasoning: suggestion.reasoning,
    });
  }

  return result;
}

function buildPrompt(
  staff: Array<{ id: string; name: string; role: string; customRoleName: string | null; jobPositionName: string | null }>,
  positions: RealPosition[]
): string {
  const lines: string[] = [];
  lines.push('Colaboradores activos de la empresa:');
  for (const person of staff) {
    const parts = [
      `id=${person.id}`,
      `nombre="${person.name}"`,
      `rol base=${person.role}`,
      person.customRoleName ? `rol personalizado="${person.customRoleName}"` : null,
      person.jobPositionName ? `cargo actual="${person.jobPositionName}"` : 'cargo actual=ninguno',
    ].filter(Boolean);
    lines.push(`- ${parts.join(', ')}`);
  }

  lines.push('');
  lines.push('Catálogo de cargos disponibles:');
  if (positions.length === 0) {
    lines.push('- (la empresa todavía no tiene cargos en su catálogo)');
  } else {
    for (const position of positions) {
      lines.push(`- id=${position.id}, nombre="${position.name}"`);
    }
  }

  return lines.join('\n');
}

export async function suggestOrgChart(companyId: string): Promise<OrgChartSuggestion[]> {
  const [staffAll, positions] = await Promise.all([listStaffFlat(companyId), listJobPositions(companyId)]);
  const staff = staffAll.filter((u) => u.isActive);

  const realUsers: RealUser[] = staff.map((u) => ({ id: u.id, name: u.name, managerId: u.managerId }));
  const realPositions: RealPosition[] = positions.map((p) => ({ id: p.id, name: p.name }));

  const prompt = buildPrompt(
    staff.map((u) => ({
      id: u.id,
      name: u.name,
      role: ROLE_LABELS[u.role],
      customRoleName: u.customRole?.name ?? null,
      jobPositionName: u.jobPosition?.name ?? null,
    })),
    realPositions
  );

  const raw = await generateAgentJson(SYSTEM_PROMPT, prompt, SUGGESTIONS_JSON_SCHEMA, (r) =>
    rawSuggestionsSchema.parse(normalizeSuggestions(r))
  );

  return sanitizeSuggestions(raw, realUsers, realPositions);
}
