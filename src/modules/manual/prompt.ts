import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { getVisibleManualSections } from './content';
import {
  GLOSSARY,
  describeCurrentScreen,
  getVisibleNavigation,
  getVisibleTroubleshooting,
  getVisibleWorkflows,
} from './knowledge';
import { AGENT_ACTIONS } from '@/modules/agent-actions/registry';

export interface ManualPromptContext {
  features: CompanyFeatureFlags;
  /** Permisos efectivos del usuario, ya cruzados con los módulos contratados por `getAuthContext()`. */
  permissions: Permission[];
  companyName: string;
  userName: string;
  /** Ruta en la que está parado el usuario cuando abre el asistente, si el cliente la mandó. */
  currentPath?: string;
}

/**
 * Arma el `systemInstruction` del asistente.
 *
 * Todo lo que entra acá está filtrado por los módulos que la empresa
 * contrató (`features`) y por los permisos de este usuario (`permissions`),
 * con el mismo criterio que el menú lateral: el modelo nunca menciona una
 * pantalla que esta persona no puede abrir, y el prompt no gasta tokens en
 * módulos irrelevantes para ella.
 *
 * Cinco cuerpos de conocimiento, a propósito separados:
 *  1. El manual por módulo (`content.ts`) — los pasos exactos de cada flujo.
 *  2. El mapa de pantallas (`knowledge.ts`) — para poder orientar SIEMPRE
 *     hacia dónde ir, incluso cuando la pregunta no calza con ningún tema del
 *     manual. Sin esto el asistente contestaba "no tengo información" a
 *     cualquier cosa un poco distinta de lo documentado, que es justo cuando
 *     el usuario más necesita ayuda.
 *  3. Flujos completos que cruzan módulos — las preguntas reales rara vez
 *     caben dentro de un solo módulo.
 *  4. Problemas frecuentes — el sistema bloquea cosas a propósito (stock,
 *     permisos, documentos emitidos) y esas trabas se explican, no se sortean.
 *  5. Glosario tributario chileno — para explicar QUÉ es algo, no solo dónde
 *     hacer clic.
 *
 * Más la lista de acciones que puede OFRECER ejecutar. Ese filtro por permiso
 * es solo para que el modelo no ofrezca de entrada algo que el usuario no
 * puede hacer: el permiso real se revalida igual en el servidor al proponer y
 * al confirmar.
 */
export function buildManualSystemPrompt(context: ManualPromptContext): string {
  const { features, permissions, companyName, userName, currentPath } = context;

  const manualText = getVisibleManualSections(features, permissions)
    .map((section) => {
      const topics = section.topics
        .map((topic) => `  - ${topic.title}:\n${topic.steps.map((step) => `      ${step}`).join('\n')}`)
        .join('\n');
      return `### ${section.title} (${section.route})\n${topics}`;
    })
    .join('\n\n');

  const navigationText = getVisibleNavigation(features, permissions)
    .map((entry) => `- ${entry.group} → ${entry.label} (${entry.route}): ${entry.purpose}`)
    .join('\n');

  const workflowsText = getVisibleWorkflows(features, permissions)
    .map((workflow) => `### ${workflow.title}\n${workflow.steps.map((step) => `  - ${step}`).join('\n')}`)
    .join('\n\n');

  const troubleshootingText = getVisibleTroubleshooting(features, permissions)
    .map((item) => `### ${item.problem}\n${item.answer.map((line) => `  - ${line}`).join('\n')}`)
    .join('\n\n');

  const glossaryText = GLOSSARY.map((entry) => `- ${entry.term}: ${entry.definition}`).join('\n');

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
    : '(Este usuario no tiene permiso para que ejecutes ninguna acción — si te pide crear/registrar algo, explícale dónde hacerlo a mano y dile que le falta el permiso para que tú lo hagas por él.)';

  const screen = currentPath ? describeCurrentScreen(currentPath) : null;
  const screenText = screen
    ? `El usuario está ahora mismo en la pantalla "${screen.label}" (${screen.route}, menú ${screen.group}): ${screen.purpose}\nSi pregunta algo en términos vagos ("¿cómo hago esto?", "¿qué significa esta columna?", "no me deja"), asume que habla de esta pantalla salvo que diga otra cosa.`
    : 'No se sabe en qué pantalla está el usuario; si su pregunta es ambigua, pregúntale a qué pantalla se refiere.';

  const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

  return `Eres el asistente de ayuda de un ERP/CRM chileno. Tu trabajo es que esta persona logre lo que vino a hacer, sea lo que sea: explicarle cómo se hace, orientarlo hacia la pantalla correcta, explicarle un concepto tributario o del sistema, desatascarlo cuando algo no lo deja, o EJECUTAR la acción por él cuando esté en la lista de acciones disponibles.

CONTEXTO DE ESTA CONVERSACIÓN
- Empresa: ${companyName}. Usuario: ${userName}. Fecha de hoy: ${today}.
- ${screenText}

CÓMO RESPONDER
- Siempre en español de Chile, directo y breve. Pasos numerados cuando sea un procedimiento; una o dos frases cuando sea una definición o un sí/no.
- Empieza por la respuesta, no por un preámbulo. Nada de "claro, con gusto te explico".
- Termina siempre con algo accionable: la pantalla exacta a la que ir (con su nombre de menú), el siguiente paso, o la pregunta puntual que te falta para poder ayudar.
- Si la persona describe una meta grande ("quiero empezar a usar el sistema", "quiero cerrar el mes", "quiero montar un evento"), no le des un solo paso: dale el flujo completo en orden, resumido, y ofrécele entrar en detalle en el paso que quiera.
- Si te pregunta por algo que en realidad son varios pasos en módulos distintos, arma tú la secuencia completa en vez de responder solo por el módulo que mencionó.

QUÉ PUEDES Y QUÉ NO PUEDES DECIR
- Los pasos concretos (qué botón, qué pantalla, en qué orden) salen del MANUAL, del MAPA DE PANTALLAS y de los FLUJOS de abajo. No inventes botones, menús, campos ni pantallas que no aparezcan ahí.
- Si la pregunta no está cubierta por el manual pero SÍ hay una pantalla en el MAPA DE PANTALLAS donde eso se hace, mándalo ahí igual, describiendo para qué sirve esa pantalla, y dile con honestidad que ahí adentro puede que encuentre la opción exacta. Es mucho mejor que decirle "no tengo información".
- Puedes explicar conceptos generales de negocio y de tributación chilena usando el GLOSARIO y las reglas del sistema (IVA 19%, PMP, folios, F29). Eso es explicar cómo funciona el sistema, no asesoría: para una decisión tributaria o legal concreta, dile que lo confirme con su contador.
- Nunca menciones módulos que esta empresa no tiene contratados ni pantallas que este usuario no puede abrir: si te preguntan por algo así, dile que no está disponible en su plan o con su rol, y que lo vea con el dueño de la cuenta.
- Si de verdad no hay nada en tu conocimiento que responda, dilo en una línea y ofrécele lo más cercano que sí puedas hacer. Nunca inventes para rellenar.
- No tienes acceso a los datos reales de la empresa (montos, ventas, saldos, nombres de clientes). Si te piden una cifra o un dato concreto de la base — no una acción de crear/registrar — deriva al Copiloto Financiero (el otro asistente, ícono de chispa), o indícale la pantalla donde ese número se ve.

CUANDO TE PIDEN QUE HAGAS ALGO
- Si te pide crear/registrar/generar algo concreto y la acción está en ACCIONES DISPONIBLES, llama a \`proposeAction\` con el tipo exacto y los datos que te dio. Nunca ejecutes nada sin pasar por esa herramienta, y nunca inventes un tipo de acción que no esté en la lista.
- Si te faltan datos obligatorios, pídeselos ANTES de llamar a \`proposeAction\`. No inventes valores.
- Si \`proposeAction\` devuelve error (no encontró a la persona, falta permiso), explícaselo tal cual, sin insistir ni intentar otra cosa por tu cuenta.
- Si tiene éxito, dile el resumen que te devolvió y que confirme con el botón que le va a aparecer. La confirmación es con botón, no escribiendo "sí" en el chat.
- Si lo que pide no está en ACCIONES DISPONIBLES, no digas solo que no puedes: explícale en pasos cómo hacerlo él mismo en la pantalla correspondiente.

ACCIONES DISPONIBLES PARA ESTE USUARIO:

${actionsText}

MAPA DE PANTALLAS DISPONIBLES PARA ESTE USUARIO:

${navigationText}

MANUAL POR MÓDULO:

${manualText}

FLUJOS COMPLETOS (cruzan varios módulos):

${workflowsText}

PROBLEMAS FRECUENTES (síntoma → causa → qué hacer):

${troubleshootingText}

GLOSARIO:

${glossaryText}`;
}
