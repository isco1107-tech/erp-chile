/**
 * Saneamiento de datos antes de que salgan a un log o a un servicio externo.
 *
 * Por qué existe: los objetos de contexto que se adjuntan a un error suelen ser
 * "el payload que venía" o "la sesión", y ahí viajan contraseñas, tokens de
 * cron, secretos TOTP, cookies de sesión y llaves de R2. Un log es texto que
 * termina en un servicio de terceros y sobrevive al incidente, así que el
 * filtro va acá — en el borde — y no en cada llamador, que es donde se olvida.
 */

/** Claves cuyo VALOR nunca debe registrarse, comparadas en minúsculas y por substring. */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'contrasena',
  'contraseña',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'totp',
  'seed',
  'dsn',
  'signature',
  'bearer',
  'credential',
  'pfx',
  'passphrase',
] as const;

export const REDACTED = '[redactado]';

/** Profundidad máxima: un ciclo o un árbol enorme no debe colgar el logger. */
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 2_000;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncado]` : value;
}

/**
 * Copia `value` reemplazando por `[redactado]` todo lo que cuelgue de una clave
 * sensible. Devuelve estructuras planas serializables a JSON; los tipos que no
 * sobreviven a `JSON.stringify` (Map, Set, función, símbolo) se convierten a su
 * descripción textual en vez de desaparecer en silencio.
 */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'function') return '[función]';
  if (typeof value === 'symbol') return value.toString();

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message), stack: value.stack ? truncate(value.stack) : undefined };
  }

  if (depth >= MAX_DEPTH) return '[profundidad máxima]';

  if (typeof value === 'object') {
    // Un ciclo (`a.b = a`) haría recursión infinita; se corta antes de bajar.
    if (seen.has(value)) return '[referencia circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`…y ${value.length - MAX_ARRAY_ITEMS} más`);
      return items;
    }

    if (value instanceof Map) return `[Map de ${value.size}]`;
    if (value instanceof Set) return `[Set de ${value.size}]`;

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1, seen);
    }
    return output;
  }

  return String(value);
}

/**
 * Igual que `redact`, pero garantiza un objeto plano en la salida. Los
 * consumidores (logger, Sentry) necesitan un `Record` para mezclarlo con sus
 * propios campos; un contexto que llegue como array o primitivo se envuelve.
 */
export function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  const result = redact(context);
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { value: result };
}
