import type { StageItemStatus } from '@prisma/client';
import type { Tone } from '@/components/ui/tone';
import type { StageSegmentTypeKey } from '@/modules/production/schema';

/**
 * Presentación compartida de la escaleta (editor, modo show e impresión). El
 * color del segmento es solo una franja de apoyo: el tipo siempre va también
 * escrito, así que nunca se depende del color para identificarlo.
 */
export const SEGMENT_STRIPE: Record<StageSegmentTypeKey, string> = {
  OPENING: 'bg-chart-1',
  PRESENTATION: 'bg-chart-2',
  SWIMSUIT: 'bg-chart-3',
  EVENING_GOWN: 'bg-chart-5',
  NATIONAL_COSTUME: 'bg-chart-4',
  QUESTION: 'bg-chart-2',
  ARTISTIC: 'bg-chart-5',
  SPONSOR: 'bg-chart-1',
  BREAK: 'bg-chart-6',
  CROWNING: 'bg-chart-1',
  OTHER: 'bg-chart-6',
};

export const STAGE_STATUS_TONE: Record<StageItemStatus, Tone> = { PENDING: 'neutral', IN_PROGRESS: 'info', DONE: 'success', SKIPPED: 'danger' };

export function formatClock(value: Date | string): string {
  return new Date(value).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

/** `Date` → valor de `<input type="datetime-local">` en la hora local del navegador. */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function candidateLabel(candidate: { fullName: string; stageName: string | null; candidateNumber?: number | null; representing?: string | null } | null): string {
  if (!candidate) return '';
  const name = candidate.stageName || candidate.fullName;
  const number = candidate.candidateNumber != null ? `N° ${candidate.candidateNumber} · ` : '';
  const rep = candidate.representing ? ` (${candidate.representing})` : '';
  return `${number}${name}${rep}`;
}
