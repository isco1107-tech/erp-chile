/**
 * Núcleo puro (sin Next ni base de datos) del reparto de cron por lotes de
 * empresas. La parte con efectos (`after()`, observabilidad) vive en `batch.ts`.
 */

/**
 * Duración máxima declarada en cada ruta de cron (`export const maxDuration`).
 * Next exige un literal en la ruta, así que aquí es solo el valor por defecto del
 * presupuesto: si cambias uno, cambia el otro.
 */
export const CRON_MAX_DURATION_SECONDS = 300;

/** Tope de continuaciones encadenadas: frena cualquier bucle accidental. */
export const MAX_CRON_HOPS = 25;

export interface CronBudget {
  /** `true` cuando ya no conviene empezar con otra empresa. */
  exhausted(): boolean;
}

/**
 * Presupuesto de tiempo de una invocación. `reserveSeconds` es lo que debe
 * sobrar al terminar para la empresa que ya está en curso, el cierre y la
 * respuesta: súbelo en crons cuyo trabajo por empresa es lento (IA).
 */
export function createCronBudget(options: { maxDurationSeconds?: number; reserveSeconds?: number; now?: () => number } = {}): CronBudget {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const reserveSeconds = options.reserveSeconds ?? 45;
  const budgetMs = Math.max(0, ((options.maxDurationSeconds ?? CRON_MAX_DURATION_SECONDS) - reserveSeconds) * 1000);
  return { exhausted: () => now() - startedAt >= budgetMs };
}

export interface CronRunOptions {
  /** Procesa solo empresas con `id` mayor a este (continuación de una corrida cortada). */
  after?: string | null;
  budget?: CronBudget;
}

export interface CompanyCursor {
  /** Llamar al inicio de cada vuelta; `true` = cortar el bucle (`break`). */
  stopBefore(companyId: string): boolean;
  /** `id` desde el cual continuar, o `null` si no quedó nada pendiente. */
  readonly nextAfter: string | null;
}

/**
 * Cursor sobre una lista de empresas ordenada por `id` ascendente. Siempre
 * procesa al menos una empresa por invocación, así una corrida con el tiempo
 * ya agotado igual avanza y no queda encadenándose sin progreso.
 */
export function createCompanyCursor(budget?: CronBudget): CompanyCursor {
  let previousId: string | null = null;
  let attempted = 0;
  let nextAfter: string | null = null;
  return {
    stopBefore(companyId: string): boolean {
      if (attempted > 0 && budget?.exhausted()) {
        nextAfter = previousId;
        return true;
      }
      previousId = companyId;
      attempted += 1;
      return false;
    },
    get nextAfter() {
      return nextAfter;
    },
  };
}

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Lee `?after=` y `?hop=` de una invocación de cron; ignora valores malformados. */
export function parseCronCursor(req: Request): { after: string | null; hop: number } {
  const params = new URL(req.url).searchParams;
  const rawAfter = params.get('after');
  const rawHop = Number.parseInt(params.get('hop') ?? '0', 10);
  return {
    after: rawAfter && CURSOR_PATTERN.test(rawAfter) ? rawAfter : null,
    hop: Number.isFinite(rawHop) && rawHop > 0 ? Math.min(rawHop, MAX_CRON_HOPS) : 0,
  };
}

/** URL de la siguiente invocación: misma ruta y parámetros, con cursor y contador actualizados. */
export function buildContinuationUrl(currentUrl: string, nextAfter: string, hop: number): string {
  const url = new URL(currentUrl);
  url.searchParams.set('after', nextAfter);
  url.searchParams.set('hop', String(hop));
  return url.toString();
}
