import type { WorkflowEventPayload } from './types';

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export interface RenderTemplateResult {
  text: string;
  /** Nombres de `{{campo}}` que no existían en el payload — para que la ejecución quede trazable en el historial cuando el autor de la regla se equivocó de nombre de campo. */
  unknownFields: string[];
}

/**
 * Sustituye `{{campo}}` por el valor de ese campo en el payload del evento.
 * Un campo desconocido se reemplaza por texto vacío (nunca deja el
 * `{{...}}` literal en un correo real) y se reporta en `unknownFields` para
 * que quede visible en el historial de ejecución, no silenciosamente.
 */
export function renderTemplate(template: string, payload: WorkflowEventPayload): RenderTemplateResult {
  const unknownFields: string[] = [];

  const text = template.replace(PLACEHOLDER_PATTERN, (_match, field: string) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      if (!unknownFields.includes(field)) unknownFields.push(field);
      return '';
    }
    const value = payload[field];
    return value === null ? '' : String(value);
  });

  return { text, unknownFields };
}
