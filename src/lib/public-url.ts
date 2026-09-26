/**
 * URL pública absoluta de la plataforma para enlaces que se copian o
 * comparten desde el panel (jurado, sponsors, postulación, entradas,
 * votación, invitaciones, portal del trabajador, webhooks…).
 *
 * Usa `APP_URL` (ej. https://aetherp.online), expuesta al navegador en el
 * build como `NEXT_PUBLIC_APP_URL` (ver next.config.js), y NO la dirección
 * desde la que navega quien copia el enlace: así un enlace nunca sale con
 * una dirección vieja o de `*.vercel.app`. Sin `APP_URL` (previews, local)
 * cae a la dirección actual del navegador.
 */
export function publicAppBase(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** `path` (con `/` inicial) como URL absoluta del dominio de la plataforma; una URL ya absoluta se devuelve igual. */
export function publicUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${publicAppBase()}${path}`;
}
