import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { checkRateLimit, VISITOR_CONFIRMATION_EMAIL_RATE_LIMIT, type RateLimitConfig, type RateLimitResult } from './rate-limiter';

/**
 * Límite de tasa COMPARTIDO por todas las instancias del servidor, contado en
 * Postgres (`RateLimitBucket`). El limitador en memoria (`rate-limiter.ts`) es
 * por instancia serverless: un atacante con muchas IP o cuyas solicitudes caen
 * en instancias distintas no comparte contadores. Este no.
 *
 * - Ventana fija por clave: el primer intento abre la ventana y cuenta hasta
 *   `limit`; vencida, el siguiente la reinicia. Un solo `INSERT … ON CONFLICT`
 *   atómico: dos solicitudes simultáneas nunca leen el mismo conteo.
 * - La clave es `prefijo:SHA-256(identificador)`: en la base nunca queda la IP,
 *   el correo ni el RUT.
 * - Falla ABIERTO: si la base no responde se deja pasar y se reporta. El
 *   limitador en memoria sigue delante (`checkLayeredRateLimit`), y una caída
 *   del contador no puede dejar a todos sin entrar.
 */

const CLEANUP_PROBABILITY = 0.01;
/** Una caída de la base no debe inundar observabilidad: a lo más un reporte por minuto y prefijo. */
const ERROR_REPORT_INTERVAL_MS = 60_000;
const lastErrorReport = new Map<string, number>();

function reportFailure(error: unknown, step: string, prefix: string): void {
  const now = Date.now();
  if ((lastErrorReport.get(prefix) ?? 0) > now - ERROR_REPORT_INTERVAL_MS) return;
  lastErrorReport.set(prefix, now);
  captureException(error, { module: 'seguridad', extra: { step, prefix } });
}
const CLEANUP_BATCH = 500;

function bucketKey(identifier: string, prefix: string): string {
  const digest = crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 40);
  return `${prefix}:${digest}`;
}

function allowedResult(config: RateLimitConfig, remaining: number): RateLimitResult {
  return { allowed: true, remaining: Math.max(0, remaining), retryAfterMs: null, limit: config.limit };
}

/** Borra de a poco las filas vencidas, sin frenar la solicitud que lo dispara. */
function maybeCleanup(): void {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  void prisma.$executeRaw`
    DELETE FROM "RateLimitBucket"
    WHERE "key" IN (SELECT "key" FROM "RateLimitBucket" WHERE "expiresAt" < NOW() LIMIT ${CLEANUP_BATCH})
  `.catch(() => undefined);
}

/** Registra un intento y dice si todavía estaba dentro del límite. */
export async function hitDurableRateLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const key = bucketKey(identifier, config.prefix);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
      VALUES (${key}, 1, NOW() + (${config.windowMs}::int * INTERVAL '1 millisecond'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN EXCLUDED."expiresAt" ELSE "RateLimitBucket"."expiresAt" END
      RETURNING "count", "expiresAt"
    `;
    maybeCleanup();
    const row = rows[0];
    if (!row) return allowedResult(config, config.limit - 1);
    const count = Number(row.count);
    if (count > config.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: new Date(row.expiresAt).getTime(), limit: config.limit };
    }
    return allowedResult(config, config.limit - count);
  } catch (error) {
    reportFailure(error, 'durable-rate-limit', config.prefix);
    return allowedResult(config, config.limit);
  }
}

/** Consulta el cupo SIN registrar un intento (para topes que solo cuentan lo que salió bien). */
export async function peekDurableRateLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const key = bucketKey(identifier, config.prefix);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      SELECT "count", "expiresAt" FROM "RateLimitBucket" WHERE "key" = ${key} AND "expiresAt" > NOW()
    `;
    const row = rows[0];
    if (!row) return allowedResult(config, config.limit);
    const count = Number(row.count);
    if (count >= config.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: new Date(row.expiresAt).getTime(), limit: config.limit };
    }
    return allowedResult(config, config.limit - count);
  } catch (error) {
    reportFailure(error, 'durable-rate-limit-peek', config.prefix);
    return allowedResult(config, config.limit);
  }
}

/**
 * Primero el límite en memoria (barato, frena ráfagas sin ir a la base) y,
 * si pasa, el compartido. Mismo `RateLimitResult` que `checkRateLimit`, así
 * que reemplazarlo en una ruta es cambiar la llamada y agregar `await`.
 */
export async function checkLayeredRateLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const local = checkRateLimit(identifier, config);
  if (!local.allowed) return local;
  return hitDurableRateLimit(identifier, config);
}

/**
 * ¿Se puede mandar a `email` el correo de confirmación de un formulario público
 * de `companyId`? Registra el envío; con el cupo agotado devuelve `false` y el
 * llamador omite el correo (la solicitud ya quedó guardada).
 */
export async function allowVisitorConfirmationEmail(companyId: string, email: string): Promise<boolean> {
  const result = await hitDurableRateLimit(`${companyId}:${email.trim().toLowerCase()}`, VISITOR_CONFIRMATION_EMAIL_RATE_LIMIT);
  return result.allowed;
}

/** Segundos hasta poder reintentar, para la cabecera `Retry-After`. */
export function retryAfterSeconds(result: RateLimitResult, fallbackSeconds = 60): number {
  return result.retryAfterMs ? Math.max(1, Math.ceil((result.retryAfterMs - Date.now()) / 1000)) : fallbackSeconds;
}
