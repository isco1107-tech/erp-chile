/**
 * Señal de vida de la plataforma en un dominio propio: `GET /api/hosting/ping`
 * responde `{ app: DOMAIN_PING_APP }`. Puro (sin servidor ni base de datos)
 * para que la ruta no arrastre dependencias.
 */
export const DOMAIN_PING_PATH = '/api/hosting/ping';
export const DOMAIN_PING_APP = 'aether-erp';
