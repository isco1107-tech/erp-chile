/**
 * Punto de entrada único de observabilidad. Todo el código de la app debería
 * importar desde acá y no desde `./logger` o `./sentry` directamente: así el
 * día que se cambie de proveedor no hay que tocar los llamadores.
 *
 * Uso típico, reemplazando un `console.error(e)` suelto:
 *
 *   } catch (error) {
 *     captureException(error, { module: 'dte', companyId, extra: { folio } });
 *     return { success: false, error: 'No se pudo emitir el documento' };
 *   }
 */
import { logger, toError, type LogContext } from './logger';
import { redactContext } from './redact';
import { isSentryEnabled, sendEvent, type SentryLevel } from './sentry';

export { logger, toError } from './logger';
export type { LogContext, LogLevel, LogRecord } from './logger';
export { isSentryEnabled } from './sentry';
export { redact, redactContext, REDACTED } from './redact';

export interface CaptureContext extends LogContext {
  /** Datos adicionales del incidente; se redactan igual que el resto del contexto. */
  extra?: Record<string, unknown>;
  /** Fuerza la agrupación en Sentry — útil para errores esperables de terceros. */
  fingerprint?: string[];
}

/** Los campos que Sentry indexa como etiquetas deben ser strings cortos, no objetos. */
function buildTags(context: CaptureContext | undefined): Record<string, string> {
  const tags: Record<string, string> = {};
  if (context?.companyId) tags.companyId = context.companyId;
  if (context?.module) tags.module = context.module;
  return tags;
}

function buildExtra(context: CaptureContext | undefined): Record<string, unknown> {
  const { extra, fingerprint: _fingerprint, companyId: _companyId, userId: _userId, module: _module, ...rest } = context ?? {};
  return redactContext({ ...rest, ...extra });
}

/**
 * Registra un error y, si hay Sentry configurado, lo reporta.
 *
 * El envío a Sentry NO se espera a propósito (`void`): en una Server Action o
 * un Route Handler, agregar el viaje de red al reporte antes de responder le
 * suma latencia al usuario por un error que ya ocurrió. Si el proceso muere
 * antes de que el `fetch` termine se pierde ese evento — un intercambio
 * aceptable frente a hacer esperar cada respuesta fallida. Cuando el evento
 * importe más que la latencia (crons, cierre de período), usar
 * `captureExceptionAndFlush`.
 */
export function captureException(error: unknown, context?: CaptureContext): void {
  const normalized = toError(error);
  logger.error(normalized.message, normalized, context);
  if (isSentryEnabled()) void dispatch('error', normalized.message, normalized, context);
}

/** Igual que `captureException`, pero espera la confirmación de envío. */
export async function captureExceptionAndFlush(error: unknown, context?: CaptureContext): Promise<void> {
  const normalized = toError(error);
  logger.error(normalized.message, normalized, context);
  if (isSentryEnabled()) await dispatch('error', normalized.message, normalized, context);
}

/** Evento sin excepción asociada: algo anómalo pero no una falla dura. */
export function captureMessage(message: string, level: 'info' | 'warn' | 'error' = 'warn', context?: CaptureContext): void {
  if (level === 'error') logger.error(message, undefined, context);
  else if (level === 'warn') logger.warn(message, context);
  else logger.info(message, context);

  const sentryLevel: SentryLevel = level === 'warn' ? 'warning' : level;
  if (isSentryEnabled()) void dispatch(sentryLevel, message, undefined, context);
}

function dispatch(level: SentryLevel, message: string, error: Error | undefined, context: CaptureContext | undefined): Promise<boolean> {
  return sendEvent({
    level,
    message,
    error,
    tags: buildTags(context),
    extra: buildExtra(context),
    user: context?.userId ? { id: context.userId } : undefined,
    fingerprint: context?.fingerprint,
  });
}
