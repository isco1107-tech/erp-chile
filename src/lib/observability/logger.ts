/**
 * Log estructurado en JSON, pensado para que un recolector externo lo indexe.
 *
 * Por qué JSON y no `console.error(algo, error)`: en Vercel la salida de
 * consola es texto plano y efímero. Una línea JSON por evento la ingiere tal
 * cual cualquier drenaje de logs (Vercel Log Drains, Axiom, Better Stack,
 * Datadog) y se vuelve consultable por `companyId`, `module` o `level`, que es
 * la diferencia entre "algo falló" y "falló el cierre mensual de esta empresa".
 *
 * En desarrollo la salida es legible para humanos: una línea JSON por evento es
 * inservible en una terminal mientras se programa.
 */
import { redactContext } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Contexto que acompaña a cada evento. `companyId` es el campo más importante:
 * es lo que permite responder "¿a qué cliente le está fallando?" sin adivinar.
 */
export interface LogContext {
  companyId?: string;
  userId?: string;
  /** Origen lógico: 'dte', 'cron:weekly-report', 'api:webhooks'… */
  module?: string;
  [key: string]: unknown;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

/**
 * Umbral mínimo. `LOG_LEVEL` lo controla; el default deja fuera `debug` en
 * producción para no pagar por ruido en el recolector.
 */
function minSeverity(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVEL_SEVERITY) return LEVEL_SEVERITY[configured as LogLevel];
  return process.env.NODE_ENV === 'production' ? LEVEL_SEVERITY.info : LEVEL_SEVERITY.debug;
}

function isPretty(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json';
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

/** Normaliza cualquier valor lanzado a un `Error`: en JS se puede lanzar un string. */
export function toError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (typeof thrown === 'string') return new Error(thrown);
  try {
    return new Error(JSON.stringify(thrown));
  } catch {
    return new Error(String(thrown));
  }
}

/** Construye el registro ya saneado. Exportado aparte para poder testearlo sin capturar stdout. */
export function buildRecord(level: LogLevel, message: string, context?: LogContext, error?: unknown): LogRecord {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: redactContext(context),
  };
  if (error !== undefined) {
    const normalized = toError(error);
    record.error = { name: normalized.name, message: normalized.message, stack: normalized.stack };
  }
  return record;
}

function emit(record: LogRecord): void {
  if (LEVEL_SEVERITY[record.level] < minSeverity()) return;

  // `fatal` no existe en la consola; se mapea a error. `debug` va a stdout vía
  // console.debug para no ensuciar stderr con ruido de desarrollo.
  const write =
    record.level === 'error' || record.level === 'fatal'
      ? console.error
      : record.level === 'warn'
        ? console.warn
        : record.level === 'debug'
          ? console.debug
          : console.info;

  if (isPretty()) {
    const scope = typeof record.context.module === 'string' ? ` [${record.context.module}]` : '';
    write(`${record.level.toUpperCase()}${scope} ${record.message}`);
    if (record.error?.stack) write(record.error.stack);
    const { module: _module, ...rest } = record.context;
    if (Object.keys(rest).length > 0) write(rest);
    return;
  }

  write(JSON.stringify(record));
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    emit(buildRecord('debug', message, context));
  },
  info(message: string, context?: LogContext): void {
    emit(buildRecord('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    emit(buildRecord('warn', message, context));
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    emit(buildRecord('error', message, context, error));
  },
  fatal(message: string, error?: unknown, context?: LogContext): void {
    emit(buildRecord('fatal', message, context, error));
  },
};
