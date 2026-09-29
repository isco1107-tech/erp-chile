/**
 * Texto con formato simple para los párrafos de un sitio en modo guiado. Quien
 * edita escribe como en WhatsApp o en un correo:
 *
 *   **negrita**   *cursiva*   [texto del enlace](https://…)
 *   - elemento de lista        1. elemento numerado
 *   ## Subtítulo
 *
 * Esto NO es HTML ni Markdown completo: el resultado es un árbol de nodos con
 * texto plano que el renderizador pinta como elementos de React (escapados).
 * Los enlaces quedan tal cual se escribieron; quien pinta los resuelve con la
 * misma barrera que el resto de los botones (`resolveLink` / `safeHref`), así
 * que `[x](javascript:…)` se ve como texto, nunca como enlace.
 *
 * Puro y sin dependencias: lo usan el editor, el renderizador y la lista
 * "qué le falta" (para revisar los enlaces escritos dentro del texto).
 */

export type RichInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: RichInline[] }
  | { kind: 'em'; children: RichInline[] }
  | { kind: 'link'; href: string; children: RichInline[] };

export type RichBlock =
  | { kind: 'p'; lines: RichInline[][] }
  | { kind: 'ul'; items: RichInline[][] }
  | { kind: 'ol'; items: RichInline[][] }
  | { kind: 'h3'; content: RichInline[] };

const BULLET_RE = /^\s*[-•*]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{2,3}\s+(.*)$/;
const LINK_RE = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/;

function pushText(out: RichInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

/**
 * Una línea → nodos. `depth` corta el anidamiento (negrita dentro de cursiva
 * dentro de un enlace…) para que un texto patológico no dispare la recursión.
 */
export function parseInline(input: string, depth = 0): RichInline[] {
  const out: RichInline[] = [];
  if (depth > 3) {
    pushText(out, input);
    return out;
  }
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end > 2) {
        out.push({ kind: 'strong', children: parseInline(rest.slice(2, end), depth + 1) });
        i += end + 2;
        continue;
      }
    }
    const marker = rest[0];
    if ((marker === '*' || marker === '_') && rest[1] !== marker && rest[1] !== ' ' && rest[1] !== undefined) {
      const end = rest.indexOf(marker, 1);
      // Cierre pegado a una letra: "*así*". "5 * 3 * 2" no es cursiva.
      if (end > 1 && rest[end - 1] !== ' ') {
        out.push({ kind: 'em', children: parseInline(rest.slice(1, end), depth + 1) });
        i += end + 1;
        continue;
      }
    }
    if (marker === '[') {
      const match = LINK_RE.exec(rest);
      if (match) {
        out.push({ kind: 'link', href: match[2] ?? '', children: parseInline(match[1] ?? '', depth + 1) });
        i += match[0].length;
        continue;
      }
    }
    pushText(out, marker ?? '');
    i += 1;
  }
  return out;
}

/** Texto completo → bloques (párrafos, listas y subtítulos). */
export function parseRichText(input: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  // Estado en un objeto: el análisis de flujo de TypeScript no sigue asignaciones hechas dentro de clausuras.
  const state: { paragraph: RichInline[][]; list: { kind: 'ul' | 'ol'; items: RichInline[][] } | null } = { paragraph: [], list: null };

  const flushParagraph = () => {
    if (state.paragraph.length) blocks.push({ kind: 'p', lines: state.paragraph });
    state.paragraph = [];
  };
  const flushList = () => {
    if (state.list && state.list.items.length) blocks.push(state.list);
    state.list = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'h3', content: parseInline((heading[1] ?? '').trim()) });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBERED_RE.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (!state.list || state.list.kind !== kind) {
        flushList();
        state.list = { kind, items: [] };
      }
      state.list.items.push(parseInline(((bullet ?? numbered)?.[1] ?? '').trim()));
      continue;
    }
    flushList();
    state.paragraph.push(parseInline(line.trim()));
  }
  flushParagraph();
  flushList();
  return blocks;
}

function collectLinks(nodes: RichInline[], out: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'link') {
      out.push(node.href);
      collectLinks(node.children, out);
    } else if (node.kind !== 'text') collectLinks(node.children, out);
  }
}

/** Enlaces escritos dentro del texto (para validarlos antes de publicar). */
export function richTextLinks(input: string): string[] {
  const out: string[] = [];
  for (const block of parseRichText(input)) {
    if (block.kind === 'p') block.lines.forEach((line) => collectLinks(line, out));
    else if (block.kind === 'h3') collectLinks(block.content, out);
    else block.items.forEach((item) => collectLinks(item, out));
  }
  return out;
}

/** Texto sin marcas (para resúmenes y títulos de la vista del editor). */
export function richTextPlain(input: string): string {
  return input
    .replace(/\[([^\]\n]{1,200})\]\([^)\s]{1,500}\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*?)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*#{2,3}\s+/gm, '')
    .replace(/^\s*(?:[-•*]|\d{1,3}[.)])\s+/gm, '');
}
