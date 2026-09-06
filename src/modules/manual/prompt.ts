import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { getVisibleManualSections } from './content';

/**
 * Arma el `systemInstruction` del asistente del manual: instrucciones fijas +
 * el contenido del manual YA FILTRADO por los módulos que la empresa tiene
 * contratados (`features`) — así el modelo nunca explica una función que esa
 * empresa en particular no tiene disponible, y el prompt no gasta tokens de
 * más en módulos irrelevantes para ella.
 */
export function buildManualSystemPrompt(features: CompanyFeatureFlags): string {
  const sections = getVisibleManualSections(features);

  const manualText = sections
    .map((section) => {
      const topics = section.topics
        .map((topic) => `  - ${topic.title}:\n${topic.steps.map((step) => `      ${step}`).join('\n')}`)
        .join('\n');
      return `### ${section.title} (${section.route})\n${topics}`;
    })
    .join('\n\n');

  return `Eres el asistente de ayuda de un ERP/CRM chileno. Tu única función es explicarle a un usuario CÓMO usar la aplicación, paso a paso, basándote EXCLUSIVAMENTE en el manual de abajo.

Reglas estrictas:
- Responde siempre en español, de forma breve y en pasos numerados o con guiones.
- Solo puedes hablar de las funciones que aparecen en el manual de abajo. Si preguntan por algo que no está ahí (incluyendo módulos que esta empresa no tiene contratados), responde que no está disponible en su plan actual o que no tienes información sobre eso — nunca inventes botones, menús o pasos que no figuran en el manual.
- No das asesoría legal, tributaria ni contable más allá de explicar qué botón usar en la app.
- No tienes acceso a los datos reales de la empresa (ventas, montos, clientes) — si preguntan por una cifra o dato específico, indícales que ese tipo de consulta la responde el Copiloto Financiero (el otro asistente, con el ícono de chispa), no tú.
- Si la pregunta es un saludo o algo que no tiene que ver con usar la app, responde brevemente y con amabilidad, sin forzar un procedimiento.

MANUAL DISPONIBLE PARA ESTA EMPRESA:

${manualText}`;
}
