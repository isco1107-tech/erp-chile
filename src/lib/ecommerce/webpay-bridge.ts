import { createHash } from 'crypto';
import { WEBPAY_HOSTS, isWebpayUrl } from './webpay-verdict';

/**
 * Página puente hacia Webpay Plus. Transbank no entrega una dirección a la que se
 * navega con GET: hay que enviar el `token_ws` por un formulario POST a su sitio. La
 * página es mínima, se arma en el servidor y se sirve con una CSP propia y estricta
 * (la global solo permite enviar formularios al propio origen): sin recursos externos,
 * el único script es el literal de abajo (autoriza su hash) y el formulario solo puede
 * ir a los hosts de Transbank.
 *
 * `next.config.js` repite `WEBPAY_BRIDGE_CSP` para esta ruta (Next aplica primero las
 * cabeceras globales y no deja que el handler las reemplace); un test los compara.
 */

/** Envía el formulario apenas carga; sin scripts, el botón de `<noscript>` hace lo mismo. */
export const WEBPAY_BRIDGE_SCRIPT = 'document.getElementById("webpay").submit();';

const SCRIPT_HASH = createHash('sha256').update(WEBPAY_BRIDGE_SCRIPT).digest('base64');

export const WEBPAY_BRIDGE_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "style-src 'unsafe-inline'",
  `form-action ${WEBPAY_HOSTS.map((host) => `https://${host}`).join(' ')}`,
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const WEBPAY_BRIDGE_PATH = '/api/public/store/webpay/start';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

const STYLES =
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1c2330}' +
  'main{max-width:22rem;padding:2rem;text-align:center}' +
  'p{margin:0 0 1rem;line-height:1.5}' +
  'button{font:inherit;font-weight:600;padding:.75rem 1.5rem;border:0;border-radius:.5rem;background:#1c2330;color:#fff;cursor:pointer}';

/** HTML del puente, o `null` si la dirección no es de Transbank (nunca se manda al comprador a otro lado). */
export function webpayBridgeHtml(formUrl: string, token: string): string | null {
  if (!isWebpayUrl(formUrl) || !/^[A-Za-z0-9]{10,100}$/.test(token)) return null;
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">' +
    '<title>Llevándote a Webpay</title>' +
    `<style>${STYLES}</style></head><body><main>` +
    '<p>Te estamos llevando a Webpay para completar tu pago de forma segura…</p>' +
    `<form id="webpay" method="POST" action="${escapeAttr(formUrl)}">` +
    `<input type="hidden" name="token_ws" value="${escapeAttr(token)}">` +
    '<noscript><button type="submit">Continuar a Webpay</button></noscript>' +
    `</form><script>${WEBPAY_BRIDGE_SCRIPT}</script></main></body></html>`
  );
}
