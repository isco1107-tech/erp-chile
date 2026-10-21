const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProcedureLike {
  id: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  version: number;
  reviewEveryDays: number | null;
  lastReviewedAt: Date | null;
  createdAt: Date;
}

export interface AckLike {
  procedureId: string;
  userId: string;
  version: number;
}

/** ¿Toca revisar el procedimiento? Solo los vigentes con una frecuencia de revisión definida. */
export function isReviewDue(procedure: ProcedureLike, now: Date): boolean {
  if (procedure.status !== 'ACTIVE' || !procedure.reviewEveryDays) return false;
  const base = procedure.lastReviewedAt ?? procedure.createdAt;
  return now.getTime() - base.getTime() >= procedure.reviewEveryDays * DAY_MS;
}

/**
 * Procedimientos vigentes que una persona todavía no leyó EN SU VERSIÓN ACTUAL:
 * al publicar una versión nueva, el acuse anterior deja de valer y hay que
 * volver a leerlo.
 */
export function pendingAcknowledgements<T extends ProcedureLike>(procedures: T[], acks: AckLike[], userId: string): T[] {
  return procedures.filter((procedure) => procedure.status === 'ACTIVE' && !acks.some((ack) => ack.userId === userId && ack.procedureId === procedure.id && ack.version === procedure.version));
}

export interface AckSummary {
  procedureId: string;
  /** Personas que ya leyeron la versión vigente. */
  read: number;
  /** Personas del equipo. */
  team: number;
  /** % entero; `null` si no hay equipo. */
  percent: number | null;
}

export function ackSummary(procedure: Pick<ProcedureLike, 'id' | 'version'>, acks: AckLike[], teamUserIds: string[]): AckSummary {
  const team = new Set(teamUserIds);
  const readers = new Set(acks.filter((a) => a.procedureId === procedure.id && a.version === procedure.version && team.has(a.userId)).map((a) => a.userId));
  return { procedureId: procedure.id, read: readers.size, team: team.size, percent: team.size === 0 ? null : Math.round((readers.size / team.size) * 100) };
}
