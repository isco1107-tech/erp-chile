/**
 * Eventos de ventana para abrir los paneles laterales de ayuda desde la barra
 * superior. Los paneles viven montados una sola vez en el layout y escuchan
 * estos eventos (mismo patrón que `TUTORIAL_REOPEN_EVENT`), así el botón puede
 * estar en el header sin que el header tenga que ser dueño del estado del panel.
 */
export const MANUAL_ASSISTANT_OPEN_EVENT = 'aether:open-manual-assistant';
export const COPILOT_OPEN_EVENT = 'aether:open-copilot';
