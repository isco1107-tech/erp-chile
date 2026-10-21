/**
 * Evento de ventana para abrir el panel lateral de ayuda desde la barra
 * superior. El panel vive montado una sola vez en el layout y escuchan
 * estos eventos (mismo patrón que `TUTORIAL_REOPEN_EVENT`), así el botón puede
 * estar en el header sin que el header tenga que ser dueño del estado del panel.
 */
export const MANUAL_ASSISTANT_OPEN_EVENT = 'aether:open-manual-assistant';

export interface AssistantOpenDetail {
  /** Pregunta que el panel envía apenas se abre (desde el manual o un tutorial). */
  question?: string;
}

/** Abre el asistente desde cualquier pantalla y, si se indica, le hace una pregunta. */
export function openAssistant(question?: string): void {
  window.dispatchEvent(new CustomEvent<AssistantOpenDetail>(MANUAL_ASSISTANT_OPEN_EVENT, { detail: { question } }));
}
