/**
 * Rate limiter in-memory con sliding window, pensado para frenar ataques no
 * distribuidos contra endpoints públicos de autenticación.
 *
 * Limitaciones conocidas en Vercel Serverless:
 * - Cada instancia de función tiene su propio `globalThis`, así que un atacante
 *   distribuido cuyas requests caigan en instancias distintas no comparte
 *   contadores. Para rate limiting distribuido real se necesita Vercel WAF o
 *   Upstash Redis.
 * - Dentro de una misma instancia, la protección es real: una ráfaga desde una
 *   sola IP que caiga en la misma instancia se bloquea correctamente.
 *
 * Es "algo es mejor que nada" sin dependencias externas. El comentario explica
 * las limitaciones para que nadie asuma que esto detiene todo.
 */

interface WindowEntry {
  /** Timestamps de cada request dentro de la ventana actual. */
  timestamps: number[];
  /** Timestamp de la primera entrada — se usa para cleanup. */
  firstSeen: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Cuántos requests quedan en la ventana actual. */
  remaining: number;
  /** Cuándo se puede reintentar (epoch ms), si fue bloqueado. */
  retryAfterMs: number | null;
  /** Máximo de requests permitidos en la ventana. */
  limit: number;
}

export interface RateLimitConfig {
  /** Clave que identifica la "dimensión" del rate limit (ej. 'login-ip', 'reset-ip'). */
  prefix: string;
  /** Máximo de requests permitidos dentro de la ventana. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

// ─── Store global (persiste entre requests dentro de la misma instancia) ─────

const STORE_KEY = '__erp_rate_limit_store__';
const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitStore {
  entries: Map<string, WindowEntry>;
  lastCleanup: number;
}

function getStore(): RateLimitStore {
  const g = globalThis as unknown as Record<string, RateLimitStore>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { entries: new Map(), lastCleanup: Date.now() };
  }
  return g[STORE_KEY];
}

/**
 * Elimina entradas cuya ventana ya expiró. Se ejecuta como máximo una vez cada
 * `CLEANUP_INTERVAL_MS` para no penalizar cada request.
 */
function maybeCleanup(store: RateLimitStore, maxWindowMs: number): void {
  const now = Date.now();
  if (now - store.lastCleanup < CLEANUP_INTERVAL_MS) return;
  store.lastCleanup = now;

  for (const [key, entry] of store.entries) {
    // Si la primera entrada registrada es más vieja que la ventana más grande
    // configurada, la entrada entera es segura de borrar.
    if (now - entry.firstSeen > maxWindowMs * 2) {
      store.entries.delete(key);
    }
  }
}

/**
 * Comprueba y registra un intento contra el rate limiter.
 *
 * @param identifier - Clave única (ej. la IP del cliente).
 * @param config     - Configuración de la ventana.
 * @returns          - Si el request fue permitido o bloqueado.
 */
export function checkRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const key = `${config.prefix}:${identifier}`;

  maybeCleanup(store, config.windowMs);

  let entry = store.entries.get(key);
  if (!entry) {
    entry = { timestamps: [], firstSeen: now };
    store.entries.set(key, entry);
  }

  // Descartar timestamps fuera de la ventana actual (sliding window).
  const windowStart = now - config.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.limit) {
    // Bloqueado: el usuario ha superado el límite.
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfterMs = oldestInWindow + config.windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      limit: config.limit,
    };
  }

  // Permitido: registrar el timestamp.
  entry.timestamps.push(now);
  if (entry.timestamps.length === 1) entry.firstSeen = now;

  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
    limit: config.limit,
    retryAfterMs: null,
  };
}

/**
 * Resetea el contador de un identificador. Útil para tests.
 */
export function resetRateLimit(identifier: string, prefix: string): void {
  const store = getStore();
  store.entries.delete(`${prefix}:${identifier}`);
}

/**
 * Limpia todo el store. Solo para tests.
 */
export function clearAllRateLimits(): void {
  const store = getStore();
  store.entries.clear();
}

// ─── Configuraciones predefinidas para rutas de autenticación ────────────────

/** Login: 10 requests por minuto por IP. */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  prefix: 'login-ip',
  limit: 10,
  windowMs: 60_000,
};

/** TOTP verification: 10 requests por minuto por IP. */
export const TOTP_RATE_LIMIT: RateLimitConfig = {
  prefix: 'totp-ip',
  limit: 10,
  windowMs: 60_000,
};

/** Password reset: 3 requests cada 5 minutos por IP. */
export const RESET_RATE_LIMIT: RateLimitConfig = {
  prefix: 'reset-ip',
  limit: 3,
  windowMs: 5 * 60_000,
};

/** Postulación pública de candidatas: 5 envíos por hora por IP (Sección 3
 * del módulo — "Límite de envíos por IP contra spam automatizado"). */
export const CANDIDATE_APPLICATION_RATE_LIMIT: RateLimitConfig = {
  prefix: 'candidate-apply-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Compra pública de entradas (`/api/public/tickets/[token]/purchase`): 5
 * órdenes por hora por IP — mismo criterio y misma cifra que la postulación
 * de candidatas, es el mismo tipo de endpoint público sin sesión. */
export const TICKET_PURCHASE_RATE_LIMIT: RateLimitConfig = {
  prefix: 'ticket-purchase-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Compra pública de votos (`/api/public/votes/[token]/purchase`): mismo
 * criterio que `TICKET_PURCHASE_RATE_LIMIT`. */
export const VOTE_PURCHASE_RATE_LIMIT: RateLimitConfig = {
  prefix: 'vote-purchase-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};
