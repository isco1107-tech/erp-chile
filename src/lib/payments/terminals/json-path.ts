/**
 * JSON-path mínimo y seguro para mapear el cuerpo de un webhook cualquiera
 * a campos del ERP. Sintaxis: `data.amount`, `items[0].id`, `$.a.b` (el `$.`
 * inicial es opcional). Sin filtros, sin comodines, sin evaluar nada: la
 * ruta la escribe el cliente, así que tiene que ser inofensiva por diseño.
 */

export type PathSegment = string | number;

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Devuelve los segmentos o null si la ruta es inválida. */
export function parseJsonPath(path: string): PathSegment[] | null {
  let rest = path.trim();
  if (rest.startsWith('$')) rest = rest.slice(1);
  if (rest.startsWith('.')) rest = rest.slice(1);
  if (!rest) return null;

  const segments: PathSegment[] = [];
  for (const part of rest.split('.')) {
    if (!part) return null;
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) return null;
    const key = match[1];
    const indexes = match[2];
    if (key) {
      if (!KEY_PATTERN.test(key) || FORBIDDEN_KEYS.has(key)) return null;
      segments.push(key);
    } else if (!indexes) {
      return null;
    }
    for (const index of indexes.matchAll(/\[(\d+)\]/g)) segments.push(Number(index[1]));
  }
  return segments.length > 0 ? segments : null;
}

export function isValidJsonPath(path: string): boolean {
  return parseJsonPath(path) !== null;
}

export type PathReadResult = { found: true; value: unknown } | { found: false };

/** Lee `path` en `source`. `found: false` si la ruta es inválida o no existe (nunca lanza). */
export function readJsonPath(source: unknown, path: string): PathReadResult {
  const segments = parseJsonPath(path);
  if (!segments) return { found: false };

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return { found: false };
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false };
      current = current[segment];
    } else {
      if (Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (current === undefined || current === null) return { found: false };
  return { found: true, value: current };
}
