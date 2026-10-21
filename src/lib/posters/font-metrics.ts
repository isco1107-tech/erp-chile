/**
 * Anchos reales de los glifos de una fuente TrueType/OpenType, leídos de sus
 * tablas `cmap` (carácter → glifo) y `hmtx` (avance de cada glifo). Con esto
 * el motor de afiches sabe cuánto mide una línea ANTES de dibujarla, con la
 * misma fuente que usará el renderizador, y puede elegir el tamaño y los
 * cortes de línea para que el texto llene su caja sin salirse nunca.
 *
 * No aplica el kerning (tablas `kern`/`GPOS`): el error es de 1-2 % a lo más
 * y `text-fit.ts` deja un margen de seguridad para cubrirlo.
 */

export interface FontMetrics {
  unitsPerEm: number;
  /** Avance en unidades de la fuente, o `null` si la fuente no tiene ese carácter. */
  advance(codePoint: number): number | null;
  /** Avance promedio: se usa para un carácter que la fuente no trae. */
  fallbackAdvance: number;
}

export type Measurer = (text: string, fontSize: number, letterSpacingEm?: number) => number;

function tableOffsets(view: DataView): Map<string, number> {
  const tables = new Map<string, number>();
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
    tables.set(tag, view.getUint32(record + 8));
  }
  return tables;
}

type GlyphLookup = (codePoint: number) => number;

function cmapFormat4(view: DataView, offset: number): GlyphLookup {
  const segCount = view.getUint16(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  return (codePoint) => {
    if (codePoint > 0xffff) return 0;
    for (let i = 0; i < segCount; i++) {
      const end = view.getUint16(endCodes + i * 2);
      if (codePoint > end) continue;
      const start = view.getUint16(startCodes + i * 2);
      if (codePoint < start) return 0;
      const delta = view.getInt16(idDeltas + i * 2);
      const rangeOffsetAt = idRangeOffsets + i * 2;
      const rangeOffset = view.getUint16(rangeOffsetAt);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = view.getUint16(rangeOffsetAt + rangeOffset + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function cmapFormat12(view: DataView, offset: number): GlyphLookup {
  const groups = view.getUint32(offset + 12);
  return (codePoint) => {
    for (let i = 0; i < groups; i++) {
      const group = offset + 16 + i * 12;
      const start = view.getUint32(group);
      const end = view.getUint32(group + 4);
      if (codePoint >= start && codePoint <= end) return view.getUint32(group + 8) + (codePoint - start);
    }
    return 0;
  };
}

function glyphLookup(view: DataView, cmap: number): GlyphLookup {
  const count = view.getUint16(cmap + 2);
  let best: { offset: number; format: number } | null = null;
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmap + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode || (format !== 4 && format !== 12)) continue;
    // El formato 12 cubre todo Unicode; el 4 solo el plano básico.
    if (!best || (format === 12 && best.format === 4)) best = { offset, format };
  }
  if (!best) throw new Error('La fuente no tiene una tabla cmap Unicode');
  return best.format === 12 ? cmapFormat12(view, best.offset) : cmapFormat4(view, best.offset);
}

/** Lee las métricas de una fuente TTF/OTF. Lanza si el archivo no es una fuente válida. */
export function parseFontMetrics(data: ArrayBuffer): FontMetrics {
  const view = new DataView(data);
  const tables = tableOffsets(view);
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) throw new Error('Fuente sin tablas head/hhea/hmtx/cmap');

  const unitsPerEm = view.getUint16(head + 18);
  const numberOfHMetrics = view.getUint16(hhea + 34);
  const lookup = glyphLookup(view, cmap);
  const glyphAdvance = (glyph: number) => view.getUint16(hmtx + Math.min(glyph, numberOfHMetrics - 1) * 4);

  let total = 0;
  let counted = 0;
  for (let glyph = 1; glyph < numberOfHMetrics; glyph++) {
    const advance = glyphAdvance(glyph);
    if (advance > 0) {
      total += advance;
      counted++;
    }
  }
  const fallbackAdvance = counted > 0 ? total / counted : unitsPerEm * 0.55;

  return {
    unitsPerEm,
    fallbackAdvance,
    advance(codePoint) {
      const glyph = lookup(codePoint);
      return glyph === 0 ? null : glyphAdvance(glyph);
    },
  };
}

/** Espacios y saltos de línea de ancho cero no suman: el resto de caracteres sí. */
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

/**
 * Mide un texto a un tamaño dado. El espaciado entre letras va en `em` (como
 * `letterSpacing` / `fontSize`), igual que lo aplica el renderizador: después
 * de cada carácter.
 */
export function measurerFor(metrics: FontMetrics): Measurer {
  return (text, fontSize, letterSpacingEm = 0) => {
    let units = 0;
    let chars = 0;
    for (const char of text) {
      const codePoint = char.codePointAt(0)!;
      if (ZERO_WIDTH.has(codePoint)) continue;
      units += metrics.advance(codePoint) ?? metrics.fallbackAdvance;
      chars++;
    }
    return (units / metrics.unitsPerEm) * fontSize + letterSpacingEm * fontSize * chars;
  };
}

/**
 * Medición aproximada para cuando la fuente no se pudo descargar (el afiche se
 * dibuja igual, con la fuente de reserva). Generosa a propósito: prefiere
 * quedarse corta a salirse de la caja.
 */
export function approximateMeasurer(averageEm = 0.6): Measurer {
  return (text, fontSize, letterSpacingEm = 0) => {
    let width = 0;
    for (const char of text) {
      const upper = char !== char.toLowerCase();
      width += char === ' ' ? 0.3 : upper ? averageEm * 1.2 : averageEm;
      width += letterSpacingEm;
    }
    return width * fontSize;
  };
}
