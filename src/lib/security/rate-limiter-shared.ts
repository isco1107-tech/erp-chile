import 'server-only';

import { createHash } from 'node:crypto';
import { captureMessage } from '@/lib/observability';
import { checkRateLimit, peekRateLimit, type RateLimitConfig, type RateLimitResult } from './rate-limiter';

/**
 * Rate limit compartido entre instancias serverless.
 *
 * El limitador de `rate-limiter.ts` vive en la memoria de cada instancia: un
 * atacante cuyas peticiones caen en instancias distintas no comparte contador.
 * Este módulo lo complementa con un contador en Redis (Upstash, por su API
 * REST con `fetch`, sin dependencias nuevas):
 *
 *  1. Primero el limitador local: rechaza gratis una ráfaga contra una misma
 *     instancia sin llamar a la red.
 *  2. Si pasa, cuenta en Redis (ventana fija: `SET NX PX` + `INCR` + `PTTL`
 *     en una sola ida y vuelta).
 *
 * Sin `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (o los
 * `KV_REST_API_URL`/`KV_REST_API_TOKEN` que pone la integración de Vercel) se
 * comporta exactamente como el limitador local. Si Redis falla o tarda, **no
 * bloquea a nadie** (abre): la disponibilidad del login y de los portales
 * pesa más que perder un contador un rato; el fallo se reporta y se evita
 * insistir durante `BREAKER_MS`.
 *
 * Las claves se guardan con hash SHA-256: los identificadores incluyen IPs,
 * correos y tokens de portal, que no deben viajar en claro a un tercero.
 */

const REQUEST_TIMEOUT_MS = 800;
const BREAKER_MS = 30_000;

interface RedisEnv {
  url: string;
  token: string;
}

function readEnv(): RedisEnv | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function isSharedRateLimitEnabled(): boolean {
  return readEnv() !== null;
}

/** Clave opaca y de largo fijo: `rl:<prefijo>:<sha256(identificador)>`. */
export function sharedRateLimitKey(prefix: string, identifier: string): string {
  return `rl:${prefix}:${createHash('sha256').update(identifier).digest('hex')}`;
}

let breakerUntil = 0;

function tripBreaker(reason: string): void {
  breakerUntil = Date.now() + BREAKER_MS;
  captureMessage('Rate limit compartido no disponible: se usa solo el límite local', 'warn', { module: 'rate-limit', extra: { reason } });
}

type PipelineReply = { result?: unknown; error?: string };

async function pipeline(env: RedisEnv, commands: (string | number)[][]): Promise<PipelineReply[] | null> {
  if (Date.now() < breakerUntil) return null;
  try {
    const response = await fetch(`${env.url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      tripBreaker(`HTTP ${response.status}`);
      return null;
    }
    const replies = (await response.json()) as PipelineReply[];
    if (!Array.isArray(replies) || replies.some((reply) => reply.error)) {
      tripBreaker('respuesta con error');
      return null;
    }
    return replies;
  } catch (error) {
    tripBreaker(error instanceof Error ? error.name : 'error de red');
    return null;
  }
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Registra un intento y dice si pasa. Reemplazo de `checkRateLimit` para
 * rutas públicas: mismo resultado, pero el conteo es global.
 */
export async function checkRateLimitShared(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const local = checkRateLimit(identifier, config);
  if (!local.allowed) return local;

  const env = readEnv();
  if (!env) return local;

  const key = sharedRateLimitKey(config.prefix, identifier);
  const replies = await pipeline(env, [
    ['SET', key, 0, 'PX', config.windowMs, 'NX'],
    ['INCR', key],
    ['PTTL', key],
  ]);
  const count = toNumber(replies?.[1]?.result);
  if (count === null) return local;

  if (count > config.limit) {
    const ttl = toNumber(replies?.[2]?.result);
    const waitMs = ttl !== null && ttl > 0 ? ttl : config.windowMs;
    return { allowed: false, remaining: 0, retryAfterMs: Date.now() + waitMs, limit: config.limit };
  }
  return { allowed: true, remaining: Math.min(local.remaining, config.limit - count), limit: config.limit, retryAfterMs: null };
}

/** Como `peekRateLimit` (no registra un intento), pero con el conteo global. */
export async function peekRateLimitShared(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const local = peekRateLimit(identifier, config);
  if (!local.allowed) return local;

  const env = readEnv();
  if (!env) return local;

  const key = sharedRateLimitKey(config.prefix, identifier);
  const replies = await pipeline(env, [['GET', key], ['PTTL', key]]);
  if (!replies) return local;

  const count = toNumber(replies[0]?.result) ?? 0;
  if (count >= config.limit) {
    const ttl = toNumber(replies[1]?.result);
    const waitMs = ttl !== null && ttl > 0 ? ttl : config.windowMs;
    return { allowed: false, remaining: 0, retryAfterMs: Date.now() + waitMs, limit: config.limit };
  }
  return { allowed: true, remaining: Math.min(local.remaining, config.limit - count), limit: config.limit, retryAfterMs: null };
}

/** Solo para tests: reabre el cortacircuito. */
export function resetSharedRateLimitBreaker(): void {
  breakerUntil = 0;
}
