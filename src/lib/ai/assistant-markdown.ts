/**
 * Formato mínimo de las respuestas del asistente: párrafos, listas
 * (numeradas o con viñetas), **negrita** y enlaces a pantallas del panel.
 *
 * Se parsea a una estructura y el widget la dibuja con elementos de React:
 * nunca `dangerouslySetInnerHTML` con texto de un modelo. Solo se enlazan
 * rutas internas del panel (`/dashboard...`); un enlace externo que el
 * modelo escriba queda como texto, para que una respuesta nunca saque al
 * usuario a un sitio que nadie revisó.
 */

export type AssistantInline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string };

export type AssistantBlock =
  | { type: 'paragraph'; inlines: AssistantInline[] }
  | { type: 'list'; ordered: boolean; items: AssistantInline[][] };

/** Solo rutas del panel, sin espacios ni esquemas: `/dashboard`, `/dashboard/x/y`, `/dashboard/manual#seccion`. */
export function isInternalHref(href: string): boolean {
  return /^\/dashboard(?:[/?#][^\s]*)?$/.test(href) && !href.includes('//');
}

// [texto](ruta) | **negrita** | ruta suelta /dashboard/...
const INLINE_PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(\/dashboard(?:\/[\w\-./]*[\w\-/])?(?:#[\w-]+)?)/g;

export function parseInlines(line: string): AssistantInline[] {
  const result: AssistantInline[] = [];
  let lastIndex = 0;
  const push = (inline: AssistantInline) => {
    const previous = result[result.length - 1];
    if (inline.type === 'text' && previous?.type === 'text') previous.text += inline.text;
    else if (inline.type !== 'text' || inline.text) result.push(inline);
  };

  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    push({ type: 'text', text: line.slice(lastIndex, index) });
    const [whole, linkText, linkHref, boldText, barePath] = match;
    if (linkText !== undefined && linkHref !== undefined) {
      const label = linkText.replace(/\*\*/g, '');
      push(isInternalHref(linkHref) ? { type: 'link', text: label, href: linkHref } : { type: 'text', text: label });
    } else if (boldText !== undefined) {
      push({ type: 'bold', text: boldText });
    } else if (barePath !== undefined) {
      push(isInternalHref(barePath) ? { type: 'link', text: barePath, href: barePath } : { type: 'text', text: whole });
    }
    lastIndex = index + whole.length;
  }
  push({ type: 'text', text: line.slice(lastIndex) });
  return result;
}

const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const BULLET_ITEM = /^\s*[-*•]\s+(.*)$/;

export function parseAssistantMarkdown(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: AssistantInline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.replace(/^#{1,6}\s+/, '').trimEnd();
    const ordered = ORDERED_ITEM.exec(line);
    const bullet = ordered ? null : BULLET_ITEM.exec(line);
    if (ordered || bullet) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push(parseInlines((ordered ?? bullet)![1]!.trim()));
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    // Una línea suelta indentada justo después de un ítem es su continuación.
    if (list && /^\s{2,}\S/.test(rawLine)) {
      const items: AssistantInline[][] = (list as { items: AssistantInline[][] }).items;
      items[items.length - 1] = [...items[items.length - 1]!, { type: 'text', text: ' ' }, ...parseInlines(line.trim())];
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}
