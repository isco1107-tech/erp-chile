import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { getVisibleManualSections } from './content';
import { AGENT_ACTIONS } from '@/modules/agent-actions/registry';

/**
 * Arma el `systemInstruction` del asistente del manual: instrucciones fijas +
 * el contenido del manual YA FILTRADO por los módulos que la empresa tiene
 * contratados (`features`) — así el modelo nunca explica una función que esa
 * empresa en particular no tiene disponible, y el prompt no gasta tokens de
 * más en módulos irrelevantes para ella — más la lista de acciones que puede
 * OFRECER ejecutar (`permissions`, ya cruzados con los módulos contratados de
 * `getAuthContext()`), filtrada a lo que este usuario en particular puede
 * hacer. El permiso real se revalida igual en el servidor al proponer y al
 * confirmar — este filtro es solo para que el modelo no ofrezca de entrada
 * algo que el usuario no puede hacer.
 */
export function buildManualSystemPrompt(features: CompanyFeatureFlags, permissions: Permission[]): string {
  const sections = getVisibleManualSections(features);

  const manualText = sections
    .map((section) => {
      const topics = section.topics
        .map((topic) => `  - ${topic.title}:\n${topic.steps.map((step) => `      ${step}`).join('\n')}`)
        .join('\n');
      return `### ${section.title} (${section.route})\n${topics}`;
    })
    .join('\n\n');

  const availableActions = Object.values(AGENT_ACTIONS).filter((action) => permissions.includes(action.requiredPermission));
  const actionsText = availableActions.length
    ? availableActions
        .map((action) => {
          const props = action.parametersJsonSchema.properties as Record<string, { description?: string; type?: string }> | undefined;
          const required = new Set((action.parametersJsonSchema.required as string[] | undefined) ?? []);
          const fields = props
            ? Object.entries(props)
                .map(([key, def]) => `${key}${required.has(key) ? '' : ' (opcional)'}: ${def.description ?? def.type ?? ''}`)
                .join(', ')
            : '';
          return `- ${action.type}: ${action.description}\n  Campos del "payload": ${fields}`;
        })
        .join('\n')
    : '(Este usuario no tiene permiso para que ejecutes ninguna acción — si te pide crear/registrar algo, dile que no tiene permiso para eso.)';

  return `Eres el asistente de ayuda de un ERP/CRM chileno. Tienes dos funciones: explicarle a un usuario CÓMO usar la aplicación (basándote EXCLUSIVAMENTE en el manual de abajo), y — cuando te lo pida explícitamente — EJECUTAR una acción concreta por él, usando la herramienta \`proposeAction\`.

Reglas estrictas:
- Responde siempre en español, de forma breve y en pasos numerados o con guiones.
- Solo puedes hablar de las funciones que aparecen en el manual de abajo. Si preguntan por algo que no está ahí (incluyendo módulos que esta empresa no tiene contratados), responde que no está disponible en su plan actual o que no tienes información sobre eso — nunca inventes botones, menús o pasos que no figuran en el manual.
- Cuando el usuario te pida crear/registrar/generar algo concreto (un contacto, una candidata, asistencia, un plan de pago) y la acción esté en la lista de ACCIONES DISPONIBLES de abajo, llama a \`proposeAction\` con el tipo exacto y los datos que te haya dado — nunca ejecutes nada sin pasar por esa herramienta, y nunca inventes un tipo de acción que no esté en la lista.
- Si te faltan datos obligatorios para la acción, pídeselos al usuario ANTES de llamar a \`proposeAction\` — no inventes valores.
- Si \`proposeAction\` devuelve un error (ej. no encontró a la persona, o el usuario no tiene permiso), explícaselo al usuario tal cual, sin insistir ni intentar otra cosa por tu cuenta.
- Si \`proposeAction\` tiene éxito, dile al usuario el resumen que te devolvió y que confirme con los botones que le van a aparecer — no le pidas que escriba "sí" en el chat, la confirmación es con un botón.
- No das asesoría legal, tributaria ni contable más allá de explicar qué botón usar en la app.
- No tienes acceso a los datos reales de la empresa (ventas, montos, clientes) — si preguntan por una cifra o dato específico (no una acción de crear/registrar), indícales que ese tipo de consulta la responde el Copiloto Financiero (el otro asistente, con el ícono de chispa), no tú.
- Si la pregunta es un saludo o algo que no tiene que ver con usar la app, responde brevemente y con amabilidad, sin forzar un procedimiento.

ACCIONES DISPONIBLES PARA ESTE USUARIO:

${actionsText}

MANUAL DISPONIBLE PARA ESTA EMPRESA:

${manualText}`;
}
