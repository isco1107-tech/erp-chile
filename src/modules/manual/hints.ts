import type { ManualSection } from './types';

/**
 * Versión liviana del manual para el navegador: lo justo para que el
 * tutorial y el asistente sepan qué sección del manual corresponde a la
 * pantalla actual (enlace "Leer el manual", preguntas sugeridas), sin cargar
 * en el cliente los pasos completos de todos los módulos. Se arma en el
 * servidor (layout del panel) ya filtrada por módulos y permisos del usuario.
 */
export interface ManualHint {
  id: string;
  title: string;
  routes: string[];
  topics: { title: string; route?: string }[];
}

export function toManualHints(sections: readonly ManualSection[]): ManualHint[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    routes: [...new Set([section.route, ...section.topics.flatMap((topic) => (topic.route ? [topic.route] : []))])],
    topics: section.topics.map((topic) => (topic.route ? { title: topic.title, route: topic.route } : { title: topic.title })),
  }));
}

/** `/dashboard` solo calza consigo mismo (es prefijo de todo); el resto, consigo y sus subrutas. */
export function routeMatchesPath(route: string, path: string): boolean {
  if (route === '/dashboard') return path === '/dashboard';
  return path === route || path.startsWith(`${route}/`);
}

/** El elemento cuya ruta calza de forma más específica con `path`. */
export function findByLongestRoute<T>(items: readonly T[], routesOf: (item: T) => readonly string[], path: string): T | null {
  let best: { item: T; length: number } | null = null;
  for (const item of items) {
    for (const route of routesOf(item)) {
      if (routeMatchesPath(route, path) && (!best || route.length > best.length)) best = { item, length: route.length };
    }
  }
  return best?.item ?? null;
}

export function findHintForPath(hints: readonly ManualHint[], path: string): ManualHint | null {
  return findByLongestRoute(hints, (hint) => hint.routes, path);
}

/** Temas de la sección que aplican a la pantalla actual (los de su ruta exacta primero). */
export function hintTopicsForPath(hint: ManualHint, path: string): { title: string; route?: string }[] {
  const specific = hint.topics.filter((topic) => topic.route && routeMatchesPath(topic.route, path));
  if (specific.length > 0) return specific;
  return hint.topics.filter((topic) => !topic.route || topic.route === hint.routes[0]);
}
