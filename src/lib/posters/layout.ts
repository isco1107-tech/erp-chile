/**
 * Reparto vertical del afiche. Cada estilo describe sus bloques (alto ya
 * calculado con las métricas reales de la fuente) y cuánto vale cada uno;
 * si no caben todos, se descartan primero los más prescindibles, y lo que
 * sobra va a la pieza central (foto, fecha, mosaico…). Así un certamen con
 * muchos datos no empuja el texto fuera del afiche: se cae lo menos
 * importante, nunca se corta nada a la mitad.
 */

export interface StackBlock {
  key: string;
  height: number;
  /** Espacio sobre el bloque. */
  gap: number;
  /** 0 = imprescindible; mientras más alto, antes se descarta. */
  drop: number;
}

export interface StackSolution {
  kept: Set<string>;
  /** Alto que queda para la pieza central. */
  flex: number;
}

export function solveStack(blocks: StackBlock[], available: number, flexMin: number): StackSolution {
  const kept = new Map(blocks.map((block) => [block.key, block]));
  const used = () => Array.from(kept.values()).reduce((sum, block) => sum + block.height + block.gap, 0);
  const droppable = blocks.filter((block) => block.drop > 0).sort((a, b) => b.drop - a.drop);
  const dropped: StackBlock[] = [];
  for (const block of droppable) {
    if (used() + flexMin <= available) break;
    kept.delete(block.key);
    dropped.push(block);
  }
  // Al sacar un bloque grande puede sobrar espacio para uno más chico ya descartado: vuelven, los más importantes primero.
  for (const block of dropped.sort((a, b) => a.drop - b.drop)) {
    if (used() + block.height + block.gap + flexMin <= available) kept.set(block.key, block);
  }
  return { kept: new Set(blocks.filter((block) => kept.has(block.key)).map((block) => block.key)), flex: Math.max(0, available - used()) };
}

/**
 * Alto mínimo que necesita una pieza central con muchos elementos (nombres de
 * auspiciadores, mosaico de candidatas) para que sigan siendo legibles: si no
 * cabe, se descartan antes los bloques prescindibles que achicar los nombres.
 */
export function heroCrowdMin(hero: { kind: string; tiles?: unknown[]; groups?: Array<{ items: string[] }> }, u: number): number {
  if (hero.kind === 'names' && hero.groups) {
    const items = hero.groups.reduce((sum, group) => sum + group.items.length, 0);
    return Math.min(720, 160 + 44 * items + 50 * hero.groups.length) * u;
  }
  if (hero.kind === 'mosaic' && hero.tiles) return Math.min(700, 300 + 14 * hero.tiles.length) * u;
  return 0;
}

export interface GridSolution {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Mejor grilla para `count` fichas de proporción `aspect` (alto/ancho) más
 * una franja de texto fija bajo cada una, dentro de `width` × `height`: la
 * que deja las fotos más grandes.
 */
export function solveGrid(count: number, width: number, height: number, options: { aspect: number; gap: number; captionHeight: number }): GridSolution {
  const { aspect, gap, captionHeight } = options;
  let best: GridSolution = { cols: 1, rows: count, tileWidth: 0, tileHeight: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const byWidth = (width - gap * (cols - 1)) / cols;
    const byHeight = (height - gap * (rows - 1) - captionHeight * rows) / rows / aspect;
    const tileWidth = Math.floor(Math.min(byWidth, byHeight));
    if (tileWidth > best.tileWidth) best = { cols, rows, tileWidth, tileHeight: Math.floor(tileWidth * aspect) };
  }
  return best;
}

/** Pseudoaleatorio estable a partir de un texto: el mismo afiche se dibuja siempre igual. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}
