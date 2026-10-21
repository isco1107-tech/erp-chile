import { rollState, type RollState } from '@/lib/academy/calendar';
import type { SessionRow } from '@/modules/academy/services/academy-calendar.service';
import type { Tone } from '@/components/ui/tone';

/**
 * Colores del calendario: un color por grupo, tomado de los tokens de gráficos
 * de `globals.css` (nunca hex sueltos). Las clases van escritas completas para
 * que Tailwind las detecte.
 */
export interface GroupTone {
  /** Punto de color (leyenda, vista de celular). */
  dot: string;
  /** Fondo suave de la ficha de una clase. */
  chip: string;
  /** Franja de color a la izquierda. */
  bar: string;
  /** Bloque de la vista semanal (más marcado). */
  block: string;
}

const TONES: GroupTone[] = [
  { dot: 'bg-chart-1', chip: 'bg-chart-1/15', bar: 'border-l-chart-1', block: 'bg-chart-1/25' },
  { dot: 'bg-chart-2', chip: 'bg-chart-2/15', bar: 'border-l-chart-2', block: 'bg-chart-2/25' },
  { dot: 'bg-chart-3', chip: 'bg-chart-3/15', bar: 'border-l-chart-3', block: 'bg-chart-3/25' },
  { dot: 'bg-chart-4', chip: 'bg-chart-4/15', bar: 'border-l-chart-4', block: 'bg-chart-4/25' },
  { dot: 'bg-chart-5', chip: 'bg-chart-5/15', bar: 'border-l-chart-5', block: 'bg-chart-5/25' },
  { dot: 'bg-chart-6', chip: 'bg-chart-6/15', bar: 'border-l-chart-6', block: 'bg-chart-6/25' },
];

/** Un grupo conserva su color mientras no se creen grupos nuevos "antes" que él (el id crece con el tiempo). */
export function buildToneMap(groups: ReadonlyArray<{ id: string }>): Map<string, GroupTone> {
  const sorted = [...groups].sort((a, b) => a.id.localeCompare(b.id));
  return new Map(sorted.map((group, index) => [group.id, TONES[index % TONES.length]!]));
}

export function toneOf(map: Map<string, GroupTone>, groupId: string): GroupTone {
  return map.get(groupId) ?? TONES[5]!;
}

export function sessionRoll(session: SessionRow, today: string): RollState {
  return rollState({ isCancelled: session.isCancelled, date: session.date, today, tally: { expected: session.expected, marked: session.marked } });
}

export const ROLL_TONE: Record<RollState, Tone> = {
  cancelled: 'neutral',
  upcoming: 'neutral',
  empty: 'neutral',
  pending: 'warning',
  partial: 'warning',
  done: 'success',
};

export function rollLabel(session: SessionRow, state: RollState): string {
  switch (state) {
    case 'cancelled':
      return 'Cancelada';
    case 'upcoming':
      return 'Por venir';
    case 'empty':
      return 'Sin alumnas';
    case 'pending':
      return 'Falta pasar lista';
    case 'partial':
      return `Lista a medias · ${session.marked}/${session.expected}`;
    case 'done':
      return `Lista completa · ${session.marked}/${session.expected}`;
  }
}

/** Título corto de una clase: el tema si lo tiene, si no el nombre del grupo. */
export function sessionHeading(session: SessionRow): string {
  return session.title ? `${session.groupName} · ${session.title}` : session.groupName;
}
