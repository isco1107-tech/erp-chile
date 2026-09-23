/**
 * Motor del "modo show" de la escaleta: qué bloque está al aire, cuál sigue,
 * cuánto va el show adelantado o atrasado respecto del plan y a qué hora
 * termina si sigue a este ritmo.
 *
 * Puro y sin reloj propio (`now` entra como parámetro) para que la pantalla
 * en vivo y los tests lleguen exactamente al mismo resultado. El plan
 * (`startTime` + `durationMinutes`) nunca se reescribe al marcar tiempos
 * reales: la diferencia entre plan y real ES la información que necesita el
 * director de piso.
 */

export type RunOfShowStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';

export interface RunOfShowBlock {
  id: string;
  startTime: Date;
  durationMinutes: number;
  status: RunOfShowStatus;
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}

export interface RunOfShowState {
  currentId: string | null;
  nextId: string | null;
  /** Minutos de atraso acumulado (negativo = adelantado). 0 antes de partir. */
  driftMinutes: number;
  /** Segundos que le quedan al bloque al aire según su duración planificada (negativo = se pasó). */
  currentRemainingSeconds: number | null;
  /** Hora estimada de inicio de cada bloque pendiente, corrida por el atraso actual. */
  projectedStartById: Record<string, Date>;
  /** Hora estimada de término del show completo. */
  projectedEnd: Date | null;
  plannedEnd: Date | null;
  doneCount: number;
  skippedCount: number;
  totalCount: number;
}

const MINUTE_MS = 60_000;

function plannedEndOf(block: RunOfShowBlock): Date {
  return new Date(block.startTime.getTime() + block.durationMinutes * MINUTE_MS);
}

/**
 * Atraso vigente, desde el hito real más reciente:
 *  - con un bloque al aire: cuánto tarde (o temprano) partió respecto de su plan,
 *    más lo que ya se pasó de su duración si se extendió;
 *  - sin bloque al aire: cuánto tarde terminó el último bloque cerrado.
 */
function computeDriftMinutes(blocks: readonly RunOfShowBlock[], now: Date): number {
  const current = blocks.find((b) => b.status === 'IN_PROGRESS' && b.actualStartedAt);
  if (current?.actualStartedAt) {
    const startDrift = current.actualStartedAt.getTime() - current.startTime.getTime();
    const elapsed = now.getTime() - current.actualStartedAt.getTime();
    const overrun = Math.max(0, elapsed - current.durationMinutes * MINUTE_MS);
    return Math.round((startDrift + overrun) / MINUTE_MS);
  }
  const lastClosed = [...blocks].reverse().find((b) => b.status === 'DONE' && b.actualEndedAt);
  if (lastClosed?.actualEndedAt) {
    return Math.round((lastClosed.actualEndedAt.getTime() - plannedEndOf(lastClosed).getTime()) / MINUTE_MS);
  }
  return 0;
}

/** `blocks` deben venir en el orden real de la escaleta (`blockOrder`). */
export function computeRunOfShow(blocks: readonly RunOfShowBlock[], now: Date): RunOfShowState {
  const current = blocks.find((b) => b.status === 'IN_PROGRESS') ?? null;
  const currentIndex = current ? blocks.indexOf(current) : -1;
  const next = blocks.find((b, index) => b.status === 'PENDING' && index > currentIndex) ?? null;
  const driftMinutes = computeDriftMinutes(blocks, now);

  let currentRemainingSeconds: number | null = null;
  if (current?.actualStartedAt) {
    const elapsedSeconds = Math.floor((now.getTime() - current.actualStartedAt.getTime()) / 1000);
    currentRemainingSeconds = current.durationMinutes * 60 - elapsedSeconds;
  }

  const projectedStartById: Record<string, Date> = {};
  for (const block of blocks) {
    if (block.status === 'PENDING') projectedStartById[block.id] = new Date(block.startTime.getTime() + driftMinutes * MINUTE_MS);
  }

  // El término se calcula sobre lo que falta por salir al aire (lo omitido no
  // suma). Si ya no queda nada, el show terminó cuando cerró el último bloque.
  const remaining = blocks.filter((b) => b.status === 'PENDING' || b.status === 'IN_PROGRESS');
  const lastPlanned = blocks.length > 0 ? blocks.reduce((latest, b) => (plannedEndOf(b) > latest ? plannedEndOf(b) : latest), plannedEndOf(blocks[0]!)) : null;
  let projectedEnd: Date | null = null;
  if (remaining.length > 0) {
    const lastRemaining = remaining[remaining.length - 1]!;
    projectedEnd = new Date(plannedEndOf(lastRemaining).getTime() + driftMinutes * MINUTE_MS);
  } else {
    const endings = blocks.map((b) => b.actualEndedAt).filter((d): d is Date => d !== null);
    projectedEnd = endings.length > 0 ? new Date(Math.max(...endings.map((d) => d.getTime()))) : lastPlanned;
  }

  return {
    currentId: current?.id ?? null,
    nextId: next?.id ?? null,
    driftMinutes,
    currentRemainingSeconds,
    projectedStartById,
    projectedEnd,
    plannedEnd: lastPlanned,
    doneCount: blocks.filter((b) => b.status === 'DONE').length,
    skippedCount: blocks.filter((b) => b.status === 'SKIPPED').length,
    totalCount: blocks.length,
  };
}

/**
 * "Encadenar horarios": reprograma las horas de inicio en cadena desde una
 * hora de partida, cada bloque empieza cuando termina el anterior. Devuelve
 * solo los bloques cuya hora cambia, para escribir lo mínimo.
 */
export function chainStartTimes(
  blocks: ReadonlyArray<{ id: string; startTime: Date; durationMinutes: number }>,
  firstStart: Date
): Array<{ id: string; startTime: Date }> {
  const changes: Array<{ id: string; startTime: Date }> = [];
  let cursor = firstStart.getTime();
  for (const block of blocks) {
    if (block.startTime.getTime() !== cursor) changes.push({ id: block.id, startTime: new Date(cursor) });
    cursor += block.durationMinutes * MINUTE_MS;
  }
  return changes;
}

/** "+4 min" / "−2 min" / "a tiempo" para el indicador del modo show. */
export function formatDrift(driftMinutes: number): string {
  if (driftMinutes === 0) return 'A tiempo';
  const abs = Math.abs(driftMinutes);
  return driftMinutes > 0 ? `+${abs} min atrasado` : `${abs} min adelantado`;
}

/** mm:ss con signo para la cuenta regresiva del bloque al aire. */
export function formatCountdown(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '−' : '';
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
