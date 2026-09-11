/**
 * Cliente mínimo de Sentry sobre su API de *envelopes*, sin el SDK.
 *
 * Por qué no `@sentry/nextjs`: el SDK oficial pesa varios MB, envuelve
 * `next.config`, inyecta tres archivos de instrumentación y sube source maps
 * en cada build. Lo único que este proyecto necesita hoy es "que un error de
 * producción llegue a algún lado donde alguien lo vea". El endpoint de
 * envelopes es HTTP + JSON y no requiere dependencias, mismo criterio con que
 * `src/lib/storage/blob.ts` reemplazó a `@vercel/blob`.
 *
 * Si algún día se necesitan trazas de rendimiento, replays de sesión o
 * agrupación por release con source maps, ahí sí conviene el SDK — este módulo
 * expone la misma forma (`sendEvent`) y se puede reemplazar por dentro.
 *
 * Sin `SENTRY_DSN` configurado, `sendEvent` no hace nada y devuelve `false`:
 * la app funciona igual, solo que los errores quedan únicamente en el log
 * estructurado de stdout.
 */

export type SentryLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

interface SentryStackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export interface SentryEventInput {
  level: SentryLevel;
  message: string;
  error?: Error;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
  /** Agrupa eventos distintos bajo un mismo issue; si se omite, Sentry agrupa por stack. */
  fingerprint?: string[];
}

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/**
 * DSN de Sentry: `https://<publicKey>@<host>/<projectId>`.
 * Devuelve `null` (en vez de lanzar) si falta o está mal formado: un DSN con
 * un typo no puede tumbar el arranque del servidor.
 */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, '');
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

/** 32 hex sin guiones, que es el formato que Sentry exige para `event_id`. */
function eventId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '');
}

const STACK_LINE = /^\s*at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?\s*$/;

/**
 * Convierte el stack de V8 al formato de Sentry.
 *
 * Sentry espera los frames del más antiguo al más reciente — al revés de como
 * los imprime JavaScript — porque los renderiza de arriba hacia abajo con el
 * punto de falla al final. `in_app` distingue código propio de `node_modules`
 * para que la UI colapse las dependencias por defecto.
 */
function parseStack(stack: string | undefined): SentryStackFrame[] {
  if (!stack) return [];
  const frames: SentryStackFrame[] = [];
  for (const line of stack.split('\n')) {
    const match = STACK_LINE.exec(line);
    if (!match) continue;
    const [, fnName, filename, lineno, colno] = match;
    frames.push({
      filename: filename ?? '<desconocido>',
      function: fnName ?? '<anónimo>',
      lineno: lineno ? Number(lineno) : undefined,
      colno: colno ? Number(colno) : undefined,
      in_app: !filename?.includes('node_modules') && !filename?.startsWith('node:'),
    });
  }
  return frames.reverse();
}

function environment(): string {
  return process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
}

/** Commit del despliegue, para saber qué versión produjo el error. */
function release(): string | undefined {
  return process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
}

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN && parseDsn(process.env.SENTRY_DSN));
}

/**
 * Envía un evento a Sentry. Nunca lanza: si la telemetría falla, el request que
 * la originó debe seguir su curso — un error al reportar un error no puede
 * convertirse en un segundo error visible para el usuario.
 */
export async function sendEvent(input: SentryEventInput): Promise<boolean> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  const parsed = parseDsn(dsn);
  if (!parsed) return false;

  try {
    const id = eventId();
    const sentAt = new Date().toISOString();

    const payload: Record<string, unknown> = {
      event_id: id,
      timestamp: sentAt,
      platform: 'node',
      level: input.level,
      logger: 'aether-erp',
      environment: environment(),
      release: release(),
      server_name: process.env.VERCEL_REGION ?? undefined,
      message: { formatted: input.message },
      tags: input.tags,
      extra: input.extra,
      user: input.user,
      fingerprint: input.fingerprint,
    };

    if (input.error) {
      payload.exception = {
        values: [
          {
            type: input.error.name || 'Error',
            value: input.error.message,
            stacktrace: { frames: parseStack(input.error.stack) },
          },
        ],
      };
    }

    // Envelope = tres líneas NDJSON: cabecera del sobre, cabecera del ítem, ítem.
    const body = [
      JSON.stringify({ event_id: id, sent_at: sentAt }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(payload),
    ].join('\n');

    const response = await fetch(parsed.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=aether-erp/1.0, sentry_key=${parsed.publicKey}`,
      },
      body,
      // Un cuelgue de Sentry no debe arrastrar al request que lo invocó.
      signal: AbortSignal.timeout(5_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}
