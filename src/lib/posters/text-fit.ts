import type { Measurer } from './font-metrics';

/**
 * Ajuste de texto a una caja: decide en cuántas líneas va un título, dónde se
 * corta cada una y a qué tamaño, para que llene el ancho disponible sin
 * salirse jamás. Los cortes se equilibran (dos líneas de largo parecido, no
 * una llena y una palabra sola abajo). Todo puro: recibe un `Measurer` con
 * las métricas reales de la fuente (ver `font-metrics.ts`).
 */

/** Margen contra el kerning que la medición no aplica y el redondeo del renderizador. */
const SAFETY = 0.97;

export interface FitOptions {
  maxWidth: number;
  /** Alto máximo del bloque completo (todas las líneas), opcional. */
  maxHeight?: number;
  maxLines: number;
  maxSize: number;
  /** Tamaño mínimo deseado; si ni así cabe, se achica igual (nunca se desborda) y se marca `belowMin`. */
  minSize: number;
  letterSpacingEm?: number;
  lineHeight?: number;
  /**
   * Cuánto más grande (proporción) tiene que quedar el texto para aceptar una
   * línea más. Evita partir "Ana Pérez" en dos líneas por ganar un 2 %.
   */
  extraLineGain?: number;
}

export interface FitResult {
  lines: string[];
  fontSize: number;
  /** Ancho de la línea más larga, al tamaño elegido. */
  width: number;
  height: number;
  belowMin: boolean;
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Mejor forma de repartir `tokens` en exactamente `count` líneas: la que
 * minimiza la línea más ancha (programación dinámica sobre los cortes).
 */
function balancedLines(tokens: string[], count: number, widthOf: (line: string) => number): { lines: string[]; widest: number } {
  const n = tokens.length;
  const lineWidth = (from: number, to: number) => widthOf(tokens.slice(from, to).join(' '));
  // best[k][i] = ancho máximo mínimo usando k líneas para los primeros i tokens.
  const best: number[][] = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0]![0] = 0;
  for (let k = 1; k <= count; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const candidate = Math.max(best[k - 1]![j]!, lineWidth(j, i));
        if (candidate < best[k]![i]!) {
          best[k]![i] = candidate;
          cut[k]![i] = j;
        }
      }
    }
  }
  const lines: string[] = [];
  let end = n;
  for (let k = count; k >= 1; k--) {
    const start = cut[k]![end]!;
    lines.unshift(tokens.slice(start, end).join(' '));
    end = start;
  }
  return { lines, widest: best[count]![n]! };
}

export function fitText(text: string, measure: Measurer, options: FitOptions): FitResult {
  const { maxWidth, maxHeight, maxLines, maxSize, minSize, letterSpacingEm = 0, lineHeight = 1.05, extraLineGain = 0.12 } = options;
  const tokens = words(text);
  if (tokens.length === 0) return { lines: [], fontSize: maxSize, width: 0, height: 0, belowMin: false };

  // Ancho a tamaño 1: el ancho es lineal en el tamaño, así que basta medir una vez.
  const unitWidth = (line: string) => measure(line, 1, letterSpacingEm);
  const available = maxWidth * SAFETY;

  let chosen: { lines: string[]; size: number; widest: number } | null = null;
  for (let count = 1; count <= Math.min(maxLines, tokens.length); count++) {
    const { lines, widest } = balancedLines(tokens, count, unitWidth);
    let size = Math.min(maxSize, widest > 0 ? available / widest : maxSize);
    if (maxHeight !== undefined) size = Math.min(size, maxHeight / (count * lineHeight));
    if (!chosen || size > chosen.size * (1 + extraLineGain)) chosen = { lines, size, widest };
    if (size >= maxSize) break;
  }

  const fontSize = Math.max(1, Math.floor(chosen!.size));
  return {
    lines: chosen!.lines,
    fontSize,
    width: chosen!.widest * fontSize,
    height: chosen!.lines.length * fontSize * lineHeight,
    belowMin: fontSize < minSize,
  };
}

export interface FlowOptions {
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  separator?: string;
  letterSpacingEm?: number;
  lineHeight?: number;
}

export interface FlowResult {
  /** Cada línea es una lista de ítems enteros (un nombre nunca se parte entre dos líneas). */
  lines: string[][];
  fontSize: number;
  belowMin: boolean;
}

/**
 * Una lista de nombres (auspiciadores, candidatas) que fluye en líneas
 * centradas, al mayor tamaño con que caben TODOS: en un afiche de
 * agradecimiento no se puede dejar a nadie afuera.
 */
export function fitFlow(items: string[], measure: Measurer, options: FlowOptions): FlowResult {
  const { maxWidth, maxHeight, maxSize, minSize, separator = '  ·  ', letterSpacingEm = 0, lineHeight = 1.35 } = options;
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return { lines: [], fontSize: maxSize, belowMin: false };
  const available = maxWidth * SAFETY;

  const pack = (size: number): string[][] | null => {
    const lines: string[][] = [];
    let current: string[] = [];
    for (const item of clean) {
      if (measure(item, size, letterSpacingEm) > available) return null;
      const attempt = [...current, item].join(separator);
      if (current.length > 0 && measure(attempt, size, letterSpacingEm) > available) {
        lines.push(current);
        current = [item];
      } else {
        current.push(item);
      }
    }
    if (current.length > 0) lines.push(current);
    return lines.length * size * lineHeight <= maxHeight ? lines : null;
  };

  // Búsqueda binaria sobre enteros: con un tope no entero (formatos escalados) `mid` podía quedar
  // igual a `low` para siempre y la búsqueda no terminaba.
  const top = Math.max(1, Math.floor(maxSize));
  let best: string[][] | null = pack(top);
  if (best) return { lines: best, fontSize: top, belowMin: top < minSize };
  let low = 1;
  let high = top;
  best = pack(1);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const lines = pack(mid);
    if (lines) {
      low = mid;
      best = lines;
    } else {
      high = mid;
    }
  }
  return { lines: best ?? [clean], fontSize: low, belowMin: low < minSize };
}

export interface GroupsOptions {
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  separator?: string;
  letterSpacingEm?: number;
  lineHeight?: number;
  /** Alto del rótulo de cada grupo (y su separación) para un tamaño de ítem dado. */
  labelHeight: (itemSize: number) => number;
}

export interface GroupsResult<T> {
  fontSize: number;
  groups: Array<{ group: T; lines: string[][] }>;
  belowMin: boolean;
}

/**
 * Varios grupos de nombres (ej. auspiciadores por categoría) al mismo tamaño,
 * el mayor con que caben TODOS los grupos en la caja.
 */
export function fitGroups<T extends { label: string | null; items: string[] }>(groups: T[], measure: Measurer, options: GroupsOptions): GroupsResult<T> {
  const { maxWidth, maxHeight, maxSize, minSize, separator = '  ·  ', letterSpacingEm = 0, lineHeight = 1.35, labelHeight } = options;
  const available = maxWidth * SAFETY;

  const packAt = (size: number): Array<{ group: T; lines: string[][] }> | null => {
    const result: Array<{ group: T; lines: string[][] }> = [];
    let height = 0;
    for (const group of groups) {
      const lines: string[][] = [];
      let current: string[] = [];
      for (const item of group.items.map((i) => i.trim()).filter(Boolean)) {
        if (measure(item, size, letterSpacingEm) > available) return null;
        if (current.length > 0 && measure([...current, item].join(separator), size, letterSpacingEm) > available) {
          lines.push(current);
          current = [item];
        } else {
          current.push(item);
        }
      }
      if (current.length > 0) lines.push(current);
      height += (group.label ? labelHeight(size) : 0) + lines.length * size * lineHeight;
      result.push({ group, lines });
    }
    return height <= maxHeight ? result : null;
  };

  // Enteros, por la misma razón que en `fitFlow`.
  const top = Math.max(1, Math.floor(maxSize));
  const atMax = packAt(top);
  if (atMax) return { fontSize: top, groups: atMax, belowMin: top < minSize };
  let low = 1;
  let high = top;
  let best = packAt(1);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const packed = packAt(mid);
    if (packed) {
      low = mid;
      best = packed;
    } else {
      high = mid;
    }
  }
  return { fontSize: low, groups: best ?? groups.map((group) => ({ group, lines: [group.items] })), belowMin: low < minSize };
}
