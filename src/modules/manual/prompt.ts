import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { findManualSectionForPath, getVisibleManualSections, searchManual, type ManualSection } from './content';
import { GLOSSARY, describeCurrentScreen, getVisibleNavigation, getVisibleTroubleshooting, getVisibleWorkflows } from './knowledge';
import { availableAgentActions } from '@/modules/agent-actions/registry';

export interface ManualPromptContext {
  features: CompanyFeatureFlags;
  /** Permisos efectivos del usuario, ya cruzados con los módulos contratados por `getAuthContext()`. */
  permissions: Permission[];
  companyName: string;
  userName: string;
  /** Ruta en la que está parado el usuario cuando abre el asistente, si el cliente la mandó. */
  currentPath?: string;
  /** Qué puede responder cada consulta de datos reales habilitada para este usuario (vacío = ninguna). */
  dataTools?: { name: string; summary: string }[];
}

/**
 * Hasta este largo el manual del usuario va completo en el prompt; sobre él
 * (empresas con muchos módulos contratados) va solo el índice y el detalle se
 * pide con la herramienta `consultarManual`. Así una empresa chica tiene
 * respuestas sin una llamada extra, y una con 30 módulos no manda decenas de
 * miles de tokens en cada pregunta.
 */
export const FULL_MANUAL_PROMPT_LIMIT = 40_000;

/** Nombre de la herramienta de consulta del manual (ver `route.ts`). */
export const MANUAL_LOOKUP_TOOL = 'consultarManual';

function sectionDetail(section: ManualSection): string {
  const topics = section.topics
    .map((topic) => {
      const where = topic.route && topic.route !== section.route ? ` [${topic.route}]` : '';
      const tip = topic.tip ? `\n      Importante: ${topic.tip}` : '';
      return `  - ${topic.title}${where}:\n${topic.steps.map((step) => `      ${step}`).join('\n')}${tip}`;
    })
    .join('\n');
  return `### ${section.title} (${section.route}) — manual: /dashboard/manual#${section.id}\nPara qué sirve: ${section.summary}\n${topics}`;
}

function sectionIndex(section: ManualSection): string {
  return `- [${section.id}] ${section.title} (${section.route}): ${section.summary} Temas: ${section.topics.map((topic) => topic.title).join('; ')}.`;
}

/**
 * Respuesta de la herramienta `consultarManual`: las secciones del manual del
 * usuario que calzan con la sección pedida o con el texto, con todos sus
 * pasos. Filtrada con el mismo criterio que el prompt: nunca devuelve un
 * módulo no contratado ni un tema que el rol no puede hacer.
 */
export function lookupManual(
  features: CompanyFeatureFlags,
  permissions: readonly Permission[],
  args: { seccion?: unknown; consulta?: unknown }
): string {
  const sections = getVisibleManualSections(features, permissions);
  const sectionId = typeof args.seccion === 'string' ? args.seccion.trim() : '';
  const query = typeof args.consulta === 'string' ? args.consulta.trim() : '';

  const byId = sectionId ? sections.filter((section) => section.id === sectionId) : [];
  const byText = query ? searchManual(sections, query).slice(0, 4) : [];
  const found = [...byId, ...byText.filter((section) => !byId.some((match) => match.id === section.id))];
  if (found.length === 0) {
    return 'No hay nada en el manual de este usuario para esa consulta. Revisa el ÍNDICE DEL MANUAL o el MAPA DE PANTALLAS, o dile con honestidad que no está documentado.';
  }
  return found.map(sectionDetail).join('\n\n');
}

/**
 * Arma el `systemInstruction` del asistente.
 *
 * Todo lo que entra acá está filtrado por los módulos que la empresa
 * contrató (`features`) y por los permisos de este usuario (`permissions`),
 * con el mismo criterio que el menú lateral: el modelo nunca menciona una
 * pantalla que esta persona no puede abrir.
 *
 * Cuerpos de conocimiento, a propósito separados:
 *  1. El manual por módulo (`content.ts`): completo si cabe, o índice +
 *     `consultarManual` para el detalle; siempre completo el de la pantalla
 *     actual.
 *  2. El mapa de pantallas (`knowledge.ts`): para orientar SIEMPRE hacia
 *     dónde ir, aunque la pregunta no calce con un tema del manual.
 *  3. Flujos completos que cruzan módulos.
 *  4. Problemas frecuentes: el sistema bloquea cosas a propósito.
 *  5. Glosario tributario y del sistema.
 *
 * Más las acciones que puede OFRECER ejecutar. Ese filtro por permiso es solo
 * para no ofrecer algo imposible: el permiso real se revalida en el servidor
 * al proponer y al confirmar.
 */
export function buildManualSystemPrompt(context: ManualPromptContext): string {
  const { features, permissions, companyName, userName, currentPath, dataTools = [] } = context;

  const sections = getVisibleManualSections(features, permissions);
  const fullManual = sections.map(sectionDetail).join('\n\n');
  const useIndex = fullManual.length > FULL_MANUAL_PROMPT_LIMIT;
  const currentSection = currentPath ? findManualSectionForPath(currentPath, sections) : null;

  const manualText = useIndex
    ? `ÍNDICE DEL MANUAL (para los pasos exactos de cualquier tema llama a \`${MANUAL_LOOKUP_TOOL}\` con el id entre corchetes o con palabras clave; NUNCA des pasos de memoria):\n\n${sections.map(sectionIndex).join('\n')}${currentSection ? `\n\nDETALLE DE LA SECCIÓN DE LA PANTALLA ACTUAL:\n\n${sectionDetail(currentSection)}` : ''}`
    : `MANUAL POR MÓDULO:\n\n${fullManual}`;

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

  const availableActions = availableAgentActions(permissions);
  const actionsText = availableActions.length
    ? availableActions
        .map((action) => {
          const props = action.parametersJsonSchema.properties as Record<string, { description?: string; type?: string; enum?: string[] }> | undefined;
          const required = new Set((action.parametersJsonSchema.required as string[] | undefined) ?? []);
          const fields = props
            ? Object.entries(props)
                .map(([key, def]) => `${key}${required.has(key) ? '' : ' (opcional)'}: ${def.description ?? def.type ?? ''}${def.enum ? ` [${def.enum.join(', ')}]` : ''}`)
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

  const dataText = dataTools.length
    ? `Puedes consultar datos reales de la empresa SOLO con estas herramientas: ${dataTools.map((tool) => `\`${tool.name}\` (${tool.summary})`).join('; ')}. Úsalas cuando pregunten por una cifra o un dato que cubren y cita exactamente lo que devuelven; nunca inventes ni estimes una cifra. Si piden un dato que ninguna cubre, dilo e indica la pantalla donde se ve. Si la pregunta no necesita datos (un saludo, cómo se hace algo), responde sin llamarlas. Montos en pesos chilenos (CLP), enteros, con formato $1.250.000.`
    : 'No tienes acceso a los datos reales de la empresa (montos, ventas, saldos, nombres de clientes). Si te piden una cifra o un dato concreto de la base — no una acción de crear/registrar — indícale la pantalla donde ese número se ve.';

  const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });
  const isoToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

  return `Eres el asistente de Aether, un ERP chileno. Tu trabajo es que esta persona logre lo que vino a hacer, aunque nunca haya usado un sistema así: explicarle cómo se hace, llevarla a la pantalla correcta, explicarle un concepto tributario o del sistema, desatascarla cuando algo no la deja, responder con cifras reales cuando tengas la consulta que lo cubre, o HACERLO por ella cuando esté en la lista de acciones disponibles.

CONTEXTO DE ESTA CONVERSACIÓN
- Empresa: ${companyName}. Usuario: ${userName}. Fecha de hoy: ${today} (${isoToday}). Interpreta "mañana", "el viernes" o "fin de mes" a partir de esta fecha.
- ${screenText}

CÓMO RESPONDER
- Siempre en español de Chile, cercano, directo y breve. Pasos numerados cuando sea un procedimiento; una o dos frases cuando sea una definición o un sí/no. Usa **negrita** solo para nombres de botones o pantallas.
- Empieza por la respuesta, sin preámbulos ("claro, con gusto…").
- Cada vez que menciones una pantalla, escríbela como enlace Markdown con su ruta del MAPA DE PANTALLAS, por ejemplo [Cuentas por Cobrar](/dashboard/treasury/cxc). El usuario hace clic y llega. Para un tema del manual puedes enlazar [Ver en el manual](/dashboard/manual#id-de-la-seccion). Nunca inventes una ruta: solo las que aparecen abajo.
- Termina siempre con algo accionable: el enlace a la pantalla, el siguiente paso o la pregunta puntual que te falta.
- Si la persona describe una meta grande ("quiero empezar a usar el sistema", "cerrar el mes", "montar un evento"), dale el flujo completo resumido en orden y ofrécele hacer tú el primer paso si está en tus acciones.
- Si es nueva o se ve perdida, recuérdale que el botón **Cómo usar** de la barra superior abre un recorrido guiado de la pantalla en la que está.
- Si notas que lo que pide se puede hacer con una de tus acciones, ofrécelo ("¿Quieres que la cree yo?") en vez de solo explicar.

QUÉ PUEDES Y QUÉ NO PUEDES DECIR
- Los pasos concretos (qué botón, qué pantalla, en qué orden) salen del MANUAL, del MAPA DE PANTALLAS y de los FLUJOS de abajo.${useIndex ? ` Si el tema no está detallado abajo, llama a \`${MANUAL_LOOKUP_TOOL}\` antes de responder.` : ''} No inventes botones, menús, campos ni pantallas.
- Si la pregunta no está cubierta por el manual pero SÍ hay una pantalla en el MAPA DE PANTALLAS donde eso se hace, mándalo ahí igual, describiendo para qué sirve esa pantalla. Es mucho mejor que decir "no tengo información".
- Puedes explicar conceptos de negocio y de tributación chilena con el GLOSARIO y las reglas del sistema (IVA 19%, PMP, folios, F29). Para una decisión tributaria o legal concreta, dile que lo confirme con su contador.
- Nunca menciones módulos que esta empresa no tiene contratados ni pantallas que este usuario no puede abrir: si te preguntan por algo así, dile que no está disponible en su plan o con su rol, y que lo vea con el dueño de la cuenta.
- Si de verdad no hay nada que responda, dilo en una línea y ofrece lo más cercano que sí puedas hacer. Nunca inventes para rellenar.
- ${dataText}

CUANDO TE PIDEN QUE HAGAS ALGO
- Si te pide crear/registrar algo y la acción está en ACCIONES DISPONIBLES, llama a \`proposeAction\` con el tipo exacto y los datos. Nunca ejecutes nada sin pasar por esa herramienta ni inventes un tipo de acción.
- Si faltan datos obligatorios, pídelos TODOS juntos en una sola pregunta antes de llamar a \`proposeAction\`. No inventes valores; sí puedes proponer uno razonable cuando la descripción de la acción lo permite (un SKU o un código) porque el usuario lo verá antes de confirmar.
- Si \`proposeAction\` devuelve error (no encontró a la persona, hay varias coincidencias, falta permiso), explícaselo tal cual y pide el dato que falta, sin insistir ni intentar otra cosa por tu cuenta.
- Si tiene éxito, dile en una línea qué vas a hacer y que confirme con el botón **Confirmar** que le aparece. La confirmación es con el botón, no escribiendo "sí".
- Si lo que pide no está en ACCIONES DISPONIBLES (emitir una factura, registrar un pago, anular), no digas solo que no puedes: explícale los pasos y dale el enlace a la pantalla donde hacerlo. Emitir documentos tributarios, mover stock y registrar pagos siempre los hace la persona en su pantalla, donde ve el documento completo.

ACCIONES DISPONIBLES PARA ESTE USUARIO:

${actionsText}

MAPA DE PANTALLAS DISPONIBLES PARA ESTE USUARIO:

${navigationText}

${manualText}

FLUJOS COMPLETOS (cruzan varios módulos):

${workflowsText}

PROBLEMAS FRECUENTES (síntoma → causa → qué hacer):

${troubleshootingText}

GLOSARIO:

${glossaryText}`;
}
