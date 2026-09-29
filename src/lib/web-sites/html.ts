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

/** Elementos cuyo CONTENIDO también se descarta (hasta su cierre). */
const DROP_WITH_CONTENT = new Set(['script', 'iframe', 'object', 'applet', 'noscript', 'template']);
/** Elementos que se quitan solos; su contenido, si lo hay, se conserva como texto. */
const DROP_TAG = new Set([
  'embed', 'base', 'frame', 'frameset', 'link', 'meta', 'form', 'input', 'button', 'select', 'textarea', 'param', 'portal',
  // SVG animado que puede reescribir enlaces o atributos en vuelo.
  'animate', 'set', 'animatemotion', 'animatetransform', 'handler', 'listener',
]);
const FORM_TAGS = new Set(['form', 'input', 'button', 'select', 'textarea']);
/** Atributos que llevan una URL. */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'srcset', 'poster', 'background', 'data', 'action', 'formaction', 'cite', 'longdesc', 'ping', 'manifest', 'codebase']);
const DROP_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'ping', 'manifest', 'codebase']);

// Todo lo de abajo recorre el texto UNA vez (sin retroceso): el HTML es de un
// usuario y puede pesar 200 KB de casos patológicos.
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^<>]*)(>?)/y;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const CSS_IMPORT = /@import\b[^;]*;?/gi;
const CSS_DANGER = /expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript\s*:|vbscript\s*:/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Math.min(Number.parseInt(dec, 10), 0x10ffff)))
    .replace(/&(colon|tab|newline|nbsp);?/gi, (_m, name: string) => ({ colon: ':', tab: '\t', newline: '\n', nbsp: ' ' })[name.toLowerCase() as 'colon' | 'tab' | 'newline' | 'nbsp']);
}

/** ¿Esta URL ejecuta código o incrusta un documento? Se decodifica y se quitan espacios/controles antes de mirar. */
function isDangerousUrl(value: string): boolean {
  const plain = decodeEntities(value).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  if (/^(javascript|vbscript|livescript|mocha):/.test(plain)) return true;
  if (plain.startsWith('data:')) return !/^data:image\/(png|jpe?g|gif|webp|avif);base64,/.test(plain);
  return false;
}

function cleanCss(css: string, note: (message: string) => void): string {
  let out = css;
  if (CSS_IMPORT.test(out)) note('Reglas @import de CSS (pega los estilos directamente)');
  CSS_IMPORT.lastIndex = 0;
  out = out.replace(CSS_IMPORT, '');
  if (CSS_DANGER.test(out)) note('Expresiones de CSS no permitidas');
  CSS_DANGER.lastIndex = 0;
  return out.replace(CSS_DANGER, '');
}

/**
 * Quita scripts, marcos, formularios, manejadores `on…`, URLs `javascript:` o
 * `data:` (incluso disfrazadas con entidades) y similares. Recorre el texto una
 * sola vez y reconstruye cada etiqueta atributo por atributo, en vez de buscar
 * patrones sueltos: `<svg/onload=…>`, `<img src="x"/onerror=…>` o
 * `href="&#106;avascript:…"` no se cuelan. Igual es una limpieza de cortesía:
 * la barrera real es `SANDBOX_CSP`.
 */
export function sanitizeHtml(input: string): SanitizeResult {
  const removed = new Set<string>();
  const note = (message: string) => removed.add(message);
  const source = input.replace(/\0/g, '');
  const lower = source.toLowerCase();
  let out = '';
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, lt);

    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      i = close === -1 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      // <!doctype> se conserva tal cual; declaraciones y <? … ?> se descartan.
      const close = source.indexOf('>', lt);
      const end = close === -1 ? source.length : close + 1;
      if (/^<!doctype\s+html\s*>$/i.test(source.slice(lt, end))) out += source.slice(lt, end);
      i = end;
      continue;
    }

    TAG_RE.lastIndex = lt;
    const match = TAG_RE.exec(source);
    if (!match) {
      out += '&lt;'; // un "<" suelto es texto
      i = lt + 1;
      continue;
    }
    const [whole, slash, rawName, attrText, closed] = match as unknown as [string, string, string, string, string];
    const name = rawName.toLowerCase();
    i = lt + whole.length;
    // Etiqueta sin ">" de cierre: los navegadores la completarían con lo que siga. Se descarta.
    if (!closed) continue;

    if (DROP_WITH_CONTENT.has(name)) {
      if (!slash) {
        note(name === 'script' ? 'Scripts (el HTML propio no ejecuta JavaScript)' : name === 'iframe' ? 'Marcos incrustados (iframe)' : `Elementos incrustados (${name})`);
        const closeAt = lower.indexOf(`</${name}`, i);
        if (closeAt === -1) {
          i = source.length;
        } else {
          const gt = source.indexOf('>', closeAt);
          i = gt === -1 ? source.length : gt + 1;
        }
      }
      continue;
    }
    if (DROP_TAG.has(name)) {
      if (FORM_TAGS.has(name)) note('Formularios y campos (usa un enlace de WhatsApp o correo, o el modo guiado)');
      else if (name === 'meta' || name === 'link') note('Etiquetas <meta> y <link> (la plataforma agrega las suyas)');
      else note(`Elementos no permitidos (${name})`);
      continue;
    }
    if (slash) {
      out += `</${rawName}>`;
      continue;
    }

    let attrs = '';
    for (const attr of attrText.matchAll(ATTR_RE)) {
      const attrName = attr[1]!.toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4];
      if (attrName.startsWith('on')) {
        note('Atributos de eventos (onclick, onload…)');
        continue;
      }
      if (DROP_ATTRS.has(attrName)) {
        note('Atributos no permitidos (action, srcdoc…)');
        continue;
      }
      if (value !== undefined && URL_ATTRS.has(attrName) && isDangerousUrl(value)) {
        note('Enlaces javascript: o data:');
        continue;
      }
      if (value === undefined) {
        attrs += ` ${attr[1]}`;
        continue;
      }
      const cleaned = attrName === 'style' ? cleanCss(value, note) : value;
      attrs += ` ${attr[1]}="${cleaned.replace(/"/g, '&quot;')}"`;
    }
    const selfClosing = /\/\s*$/.test(attrText) ? ' /' : '';
    out += `<${rawName}${attrs}${selfClosing}>`;

    if (name === 'style') {
      const closeAt = lower.indexOf('</style', i);
      const endAt = closeAt === -1 ? source.length : closeAt;
      out += cleanCss(source.slice(i, endAt), note);
      i = endAt;
    }
  }

  return { html: out.trim(), removed: [...removed] };
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
