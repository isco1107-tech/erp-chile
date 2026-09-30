/**
 * Mensajes tipo para WhatsApp o correo. Texto plano con `{{variables}}`: el
 * equipo puede editarlo (Configuración de Fidelización) sin tocar código.
 */

export const DEFAULT_SURVEY_INTRO = 'Gracias por elegirnos. Tu opinión nos ayuda a mejorar: son solo 3 preguntas.';

export const DEFAULT_FOLLOW_UP_MESSAGE =
  'Hola {{cliente}}, te escribimos de {{empresa}}. Hace un tiempo que no nos haces un pedido y queríamos saber cómo te fue con nuestros productos y si necesitas reponer. ¡Cuéntanos!';

export const DEFAULT_DELIVERY_MESSAGE =
  'Hola {{cliente}}, recibimos tu pedido en {{empresa}}. El plazo de entrega es de {{plazo}}. Te avisaremos apenas salga en camino. Después de recibirlo te haremos una encuesta muy breve.';

export type MessageVars = Partial<Record<'cliente' | 'empresa' | 'plazo' | 'enlace', string>>;

/** Reemplaza `{{variable}}`; las desconocidas o vacías desaparecen (nunca queda un `{{x}}` a la vista). */
export function renderMessage(template: string, vars: MessageVars): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (vars as Record<string, string | undefined>)[key] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function formatLeadTime(days: number | null | undefined): string {
  if (!days || days < 1) return 'unos días hábiles';
  return days === 1 ? '1 día hábil' : `${days} días hábiles`;
}
