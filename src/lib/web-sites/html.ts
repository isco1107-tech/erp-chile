/**
 * Modo HTML propio. El usuario escribe HTML y CSS; se publica en un documento
 * aparte (`/web/[slug]/raw`) servido con una política de seguridad que lo deja
 * inerte: sin scripts, sin formularios, sin conexiones, en un origen aislado
 * del resto de la plataforma. Esa política (`SANDBOX_CSP`) es la defensa real;
 * `sanitizeHtml` quita lo obvio antes de guardar, para que el usuario vea qué
 * no va a funcionar y para no depender de un solo control.
 *
 * Por qué importa tanto: el HTML de un cliente se sirve desde nuestro propio
 * dominio. Sin el aislamiento, un `<script>` publicado ahí correría con el
 * mismo origen que el panel del ERP.
 */

export const MAX_HTML_BYTES = 200_000;

/**
 * Cabecera `Content-Security-Policy` del documento HTML propio.
 * - `sandbox` (sin `allow-scripts` ni `allow-same-origin`): origen opaco, sin JS.
 * - `default-src 'none'` y `form-action 'none'`: nada se conecta ni se envía.
 * - Imágenes y fuentes solo por https/data; estilos en línea permitidos.
 */
export const SANDBOX_CSP = [
  'sandbox allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src https: data:',
  'font-src https: data:',
  'media-src https:',
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** Cabeceras completas de la respuesta del documento propio. */
export const SANDBOX_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': SANDBOX_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'public, max-age=60, s-maxage=60',
};

export interface SanitizeResult {
  html: string;
  /** Cosas que se quitaron, en español, sin repetir. */
  removed: string[];
}

const BLOCK_WITH_CONTENT = /<(script|iframe|object|applet|noscript|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const VOID_DANGEROUS = /<\/?(embed|base|frame|frameset|link|meta|form|input|button|select|textarea|param|portal)\b[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URL_ATTR = /\s+(href|src|action|formaction|xlink:href|srcset|poster|background)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/gi;
const CSS_IMPORT = /@import\b[^;]*;?/gi;
const CSS_EXPRESSION = /expression\s*\(|behavior\s*:|-moz-binding\s*:/gi;

/**
 * Quita scripts, marcos, formularios, manejadores `on…=`, enlaces `javascript:`
 * y similares. Es una limpieza de cortesía: la seguridad la da `SANDBOX_CSP`.
 */
export function sanitizeHtml(input: string): SanitizeResult {
  const removed = new Set<string>();
  let html = input.replace(/\0/g, '');
  const strip = (pattern: RegExp, note: string) => {
    html = html.replace(pattern, () => {
      removed.add(note);
      return '';
    });
  };

  // Dos pasadas: quitar un fragmento puede dejar pegado otro (`<scr<script>ipt>`).
  for (let pass = 0; pass < 2; pass += 1) {
    strip(/<!--[\s\S]*?-->/g, '');
    html = html.replace(BLOCK_WITH_CONTENT, (_match, tag: string) => {
      removed.add(
        tag.toLowerCase() === 'script' ? 'Scripts (el HTML propio no ejecuta JavaScript)' : tag.toLowerCase() === 'iframe' ? 'Marcos incrustados (iframe)' : 'Elementos incrustados (' + tag.toLowerCase() + ')'
      );
      return '';
    });
    html = html.replace(VOID_DANGEROUS, (match) => {
      const tag = /^<\/?([a-z]+)/i.exec(match)?.[1]?.toLowerCase() ?? '';
      if (['form', 'input', 'button', 'select', 'textarea'].includes(tag)) removed.add('Formularios y campos (usa un enlace de WhatsApp o correo, o el modo guiado)');
      else if (tag === 'meta' || tag === 'link') removed.add('Etiquetas <meta> y <link> (la plataforma agrega las suyas)');
      else removed.add('Elementos no permitidos (' + tag + ')');
      return '';
    });
    strip(EVENT_ATTR, 'Atributos de eventos (onclick, onload…)');
    strip(DANGEROUS_URL_ATTR, 'Enlaces javascript: o data:');
  }
  strip(CSS_IMPORT, 'Reglas @import de CSS (pega los estilos directamente)');
  strip(CSS_EXPRESSION, 'Expresiones de CSS no permitidas');

  removed.delete('');
  return { html: html.trim(), removed: [...removed] };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Documento final: si el usuario pegó una página completa se respeta; si pegó
 * solo el contenido, se envuelve. Siempre lleva codificación, viewport, título
 * y descripción para móviles y buscadores.
 */
export function wrapHtmlDocument(html: string, meta: { title: string; description?: string | null; lang?: string }): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(meta.title)}</title>`,
    meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (/<html[\s>]/i.test(html)) {
    const withoutTitle = html.replace(/<title[\s\S]*?<\/title>/gi, '');
    if (/<head[\s>]/i.test(withoutTitle)) return withoutTitle.replace(/<head([^>]*)>/i, `<head$1>\n${head}`);
    return withoutTitle.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${head}\n</head>`);
  }
  return `<!doctype html>\n<html lang="${meta.lang ?? 'es'}">\n<head>\n${head}\n</head>\n<body>\n${html}\n</body>\n</html>`;
}

/** Recomendaciones para el HTML propio (no bloquean): ayudan a que quede bien. */
export function htmlHints(html: string): { id: string; ok: boolean; label: string; hint: string }[] {
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const withoutAlt = imgs.filter((tag) => !/\balt\s*=/i.test(tag)).length;
  return [
    { id: 'h1', ok: /<h1[\s>]/i.test(html), label: 'Tiene un título principal (<h1>)', hint: 'Un solo <h1> que diga de qué trata la página ayuda a buscadores y lectores de pantalla.' },
    { id: 'img-alt', ok: withoutAlt === 0, label: 'Todas las imágenes tienen descripción (alt)', hint: withoutAlt > 0 ? `${withoutAlt} imagen(es) sin alt. Agrega alt="descripción" a cada <img>.` : 'Sin imágenes que revisar o todas describen su contenido.' },
    { id: 'contact', ok: /href\s*=\s*["'](?:mailto:|tel:|https:\/\/wa\.me\/)/i.test(html), label: 'Ofrece una forma de contacto (correo, teléfono o WhatsApp)', hint: 'Como los formularios no funcionan en HTML propio, agrega un enlace mailto:, tel: o https://wa.me/56912345678.' },
    { id: 'images-https', ok: !/<img\b[^>]*\bsrc\s*=\s*["']http:\/\//i.test(html), label: 'Las imágenes usan https', hint: 'Las imágenes con http:// no se cargan. Sube la imagen a la biblioteca del sitio y usa su dirección.' },
  ];
}
