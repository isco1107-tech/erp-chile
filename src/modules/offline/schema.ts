import { z } from 'zod';

/**
 * Modo contingencia (docs/adr/0002): el equipo sigue operando sin conexión a
 * lo más este tiempo desde la primera operación sin sincronizar. Pasado eso,
 * no acepta operaciones nuevas hasta volver a conectarse.
 */
export const OFFLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * El servidor acepta operaciones capturadas hasta este tiempo atrás: la
 * conexión puede volver después de las 2 horas (la mañana siguiente), y lo
 * que ya se hizo se tiene que poder sincronizar.
 */
export const OFFLINE_MAX_SYNC_AGE_MS = 24 * 60 * 60 * 1000;

/** Tolerancia al reloj del equipo adelantado. */
export const OFFLINE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const base = {
  companyId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(8).max(100),
  capturedAt: z.string().datetime(),
  /** Reintento explícito de una operación que el servidor rechazó. */
  retry: z.boolean().optional(),
};

/**
 * Lo que manda el equipo al sincronizar. `payload` lo valida después la
 * misma Server Action que usa el formulario en línea, con su propio esquema.
 */
export const offlineOperationSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('POS_SALE'), shiftId: z.string().min(1).max(100), payload: z.record(z.string(), z.unknown()) }),
  z.object({ ...base, kind: z.literal('STOCK_MOVEMENT'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ ...base, kind: z.literal('PURCHASE'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ ...base, kind: z.literal('GOODS_RECEIPT'), payload: z.record(z.string(), z.unknown()) }),
]);

export type OfflineOperationInput = z.infer<typeof offlineOperationSchema>;

/** `null` si la hora de captura es aceptable; si no, el motivo. */
export function capturedAtProblem(capturedAt: Date, now: Date = new Date()): string | null {
  if (Number.isNaN(capturedAt.getTime())) return 'Hora de la operación inválida';
  if (capturedAt.getTime() > now.getTime() + OFFLINE_CLOCK_SKEW_MS) {
    return 'La hora del equipo está adelantada: corrígela y vuelve a sincronizar';
  }
  if (capturedAt.getTime() < now.getTime() - OFFLINE_MAX_SYNC_AGE_MS) {
    return 'La operación se hizo hace más de 24 horas sin conexión: regístrala de nuevo en línea';
  }
  return null;
}
