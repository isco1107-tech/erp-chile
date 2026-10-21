/**
 * Edición del texto con formato (`rich-text.ts`) desde la barra de botones del
 * editor: negrita, cursiva, listas, subtítulo y enlaces. Son funciones puras
 * sobre (texto, selección) → (texto nuevo, selección nueva), para que el
 * componente solo aplique el resultado y para poder probarlas sin navegador.
 *
 * Las marcas son las que entiende `parseRichText`: `**negrita**`, `*cursiva*`,
 * `[texto](enlace)`, `- lista`, `1. numerada` y `## subtítulo`.
 */

export interface TextSelection {
  start: number;
  end: number;
}

export interface TextEdit {
  value: string;
  selection: TextSelection;
}

function clampSelection(value: string, selection: TextSelection): TextSelection {
  const a = Math.max(0, Math.min(selection.start, value.length));
  const b = Math.max(0, Math.min(selection.end, value.length));
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * Pone o quita negrita (`**`) o cursiva (`*`) en lo seleccionado. Los espacios
 * de los bordes de la selección quedan fuera de las marcas (`**hola **` no se
 * lee como negrita). Sin selección inserta el texto de ejemplo ya seleccionado.
 */
export function toggleInline(value: string, selection: TextSelection, marker: '**' | '*', placeholder: string): TextEdit {
  const { start, end } = clampSelection(value, selection);
  const raw = value.slice(start, end);
  const hasText = raw.trim().length > 0;
  const coreStart = hasText ? start + (raw.length - raw.trimStart().length) : start;
  const coreEnd = hasText ? end - (raw.length - raw.trimEnd().length) : start;
  const before = value.slice(0, coreStart);
  const core = value.slice(coreStart, coreEnd);
  const after = value.slice(coreEnd);

  if (!core) {
    const inserted = `${marker}${placeholder}${marker}`;
    return {
      value: `${before}${inserted}${after}`,
      selection: { start: coreStart + marker.length, end: coreStart + marker.length + placeholder.length },
    };
  }

  // Marcas justo alrededor de la selección → quitarlas.
  const wrappedOutside = marker === '**' ? before.endsWith('**') && after.startsWith('**') : /(?:^|[^*])\*$/.test(before) && /^\*(?:[^*]|$)/.test(after);
  if (wrappedOutside) {
    return {
      value: `${before.slice(0, -marker.length)}${core}${after.slice(marker.length)}`,
      selection: { start: coreStart - marker.length, end: coreEnd - marker.length },
    };
  }

  // La selección incluye las marcas → quitarlas.
  const wrappedInside = core.length > marker.length * 2 && core.startsWith(marker) && core.endsWith(marker) && (marker === '**' || (!core.startsWith('**') && !core.endsWith('**')));
  if (wrappedInside) {
    const inner = core.slice(marker.length, core.length - marker.length);
    return { value: `${before}${inner}${after}`, selection: { start: coreStart, end: coreStart + inner.length } };
  }

  return {
    value: `${before}${marker}${core}${marker}${after}`,
    selection: { start: coreStart + marker.length, end: coreEnd + marker.length },
  };
}

export type LineFormat = 'ul' | 'ol' | 'heading';

const ANY_PREFIX = /^(\s*)(?:[-•*]\s+|\d{1,3}[.)]\s+|#{2,3}\s+)/;
const PREFIX: Record<LineFormat, RegExp> = {
  ul: /^\s*[-•*]\s+/,
  ol: /^\s*\d{1,3}[.)]\s+/,
  heading: /^\s*#{2,3}\s+/,
};

/**
 * Convierte las líneas tocadas por la selección en lista, lista numerada o
 * subtítulo; si todas ya tienen ese formato, se lo quita. Cambiar de un formato
 * a otro (lista → numerada) reemplaza la marca en vez de apilarla.
 */
export function toggleLineFormat(value: string, selection: TextSelection, format: LineFormat): TextEdit {
  const { start, end } = clampSelection(value, selection);
  const blockStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  // Una selección que termina justo al inicio de una línea no toca esa línea.
  const lastTouched = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = value.indexOf('\n', lastTouched);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;

  const lines = value.slice(blockStart, blockEnd).split('\n');
  const filled = lines.filter((line) => line.trim());
  const remove = filled.length > 0 && filled.every((line) => PREFIX[format].test(line));

  let counter = 0;
  const next = lines.map((line) => {
    if (remove) return line.replace(PREFIX[format], '');
    // Las líneas en blanco de en medio quedan como separadores (salvo que todas estén en blanco).
    if (!line.trim() && filled.length > 0) return line;
    counter += 1;
    const mark = format === 'ul' ? '- ' : format === 'ol' ? `${counter}. ` : '## ';
    return `${mark}${line.replace(ANY_PREFIX, '$1').trimStart()}`;
  });

  const block = next.join('\n');
  const result = `${value.slice(0, blockStart)}${block}${value.slice(blockEnd)}`;
  const collapsed = start === end;
  return {
    value: result,
    selection: collapsed ? { start: blockStart + block.length, end: blockStart + block.length } : { start: blockStart, end: blockStart + block.length },
  };
}

/** Texto visible de un enlace: sin corchetes ni saltos de línea (romperían la marca). */
export function cleanLinkText(text: string): string {
  return text
    .replace(/[[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Destino del enlace: sin espacios ni paréntesis de cierre (cortarían la marca). */
export function cleanLinkHref(href: string): string {
  return href.trim().replace(/\s+/g, '%20').replace(/\)/g, '%29').slice(0, 500);
}

/** Reemplaza la selección (o inserta en el cursor) por `[texto](destino)`. `null` si falta el texto o el destino. */
export function insertLink(value: string, selection: TextSelection, text: string, href: string): TextEdit | null {
  const label = cleanLinkText(text);
  const target = cleanLinkHref(href);
  if (!label || !target) return null;
  const { start, end } = clampSelection(value, selection);
  const markup = `[${label}](${target})`;
  const caret = start + markup.length;
  return { value: `${value.slice(0, start)}${markup}${value.slice(end)}`, selection: { start: caret, end: caret } };
}
