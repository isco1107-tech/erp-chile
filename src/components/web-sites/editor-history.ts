import type { SiteDocument } from '@/lib/web-sites/site';

/**
 * Historial de Deshacer / Rehacer del editor de sitios. Es puro (sin React ni
 * reloj propio): el editor le pasa la hora, así se puede probar sin esperar.
 *
 * Cada paso guarda el estado COMPLETO anterior. Como todas las operaciones del
 * editor devuelven objetos nuevos sin mutar los anteriores, guardar un paso
 * cuesta una referencia, no una copia.
 */

/** Cuántos pasos se recuerdan. */
export const HISTORY_LIMIT = 60;
/** Cambios de escritura seguidos con menos de esto entre sí cuentan como un solo paso. */
export const HISTORY_GROUP_MS = 700;

export interface HistoryState<T> {
  /** Estados anteriores, del más antiguo al más reciente. */
  past: T[];
  /** Estados que se pueden rehacer, el próximo al final. */
  future: T[];
  /** Hora del último cambio registrado (0 = el próximo cambio abre un paso nuevo). */
  lastEditAt: number;
}

export function emptyHistory<T>(): HistoryState<T> {
  return { past: [], future: [], lastEditAt: 0 };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

/**
 * Registra que `previous` se cambió por otro estado. Si el cambio llega pronto
 * después del anterior (y no es "estructural"), se une al mismo paso: escribir
 * una frase completa se deshace de una vez, no letra por letra.
 * Cualquier cambio nuevo borra lo que se podía rehacer.
 */
export function recordChange<T>(history: HistoryState<T>, previous: T, now: number, options: { boundary?: boolean } = {}): HistoryState<T> {
  const joins = !options.boundary && history.past.length > 0 && history.lastEditAt > 0 && now - history.lastEditAt < HISTORY_GROUP_MS;
  if (joins) return { past: history.past, future: [], lastEditAt: now };
  const past = [...history.past, previous];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastEditAt: now };
}

export function undoStep<T>(history: HistoryState<T>, current: T): { history: HistoryState<T>; value: T } | null {
  const value = history.past[history.past.length - 1];
  if (history.past.length === 0 || value === undefined) return null;
  return { value, history: { past: history.past.slice(0, -1), future: [...history.future, current], lastEditAt: 0 } };
}

export function redoStep<T>(history: HistoryState<T>, current: T): { history: HistoryState<T>; value: T } | null {
  const value = history.future[history.future.length - 1];
  if (history.future.length === 0 || value === undefined) return null;
  return { value, history: { past: [...history.past, current], future: history.future.slice(0, -1), lastEditAt: 0 } };
}

/**
 * Firma de la "estructura" del sitio: qué páginas, secciones, ítems de menú y
 * columnas hay y en qué orden. Si cambia, es una acción (agregar, quitar,
 * mover) y no una escritura: siempre abre un paso propio en el historial.
 */
export function structureSignature(doc: SiteDocument): string {
  const pages = doc.pages.map((page) => `${page.id}:${page.blocks.map((block) => block.id).join(',')}`).join('|');
  const menu = doc.header.menu.map((item) => `${item.id}:${item.children.map((child) => child.id).join(',')}`).join('|');
  const columns = doc.footer.columns.map((column) => `${column.id}:${column.links.map((entry) => entry.id).join(',')}`).join('|');
  return `${pages}#${menu}#${columns}`;
}
