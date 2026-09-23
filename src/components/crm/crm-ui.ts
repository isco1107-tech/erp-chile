import type { Tone } from '@/components/ui/tone';
import type { DealTypeKey, OpportunityStageKey, PriorityKey } from '@/modules/crm/schema';

/** Presentación compartida por las pantallas del CRM (tablero, lista, agenda, reportes). */

export const DEAL_TYPE_TONE: Record<DealTypeKey, Tone> = {
  SPONSORSHIP: 'accent',
  EVENT_PRODUCTION: 'info',
  CORPORATE_TICKETS: 'warning',
  TALENT_BOOKING: 'success',
  LICENSING: 'neutral',
  MEDIA: 'info',
  OTHER: 'neutral',
};

export const PRIORITY_TONE: Record<PriorityKey, Tone> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

export const PRIORITY_DOT: Record<PriorityKey, string> = {
  HIGH: 'bg-danger',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground/40',
};

export const STAGE_TONE: Record<OpportunityStageKey, Tone> = {
  LEAD: 'neutral',
  QUALIFIED: 'info',
  PROPOSAL: 'info',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
};

export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  // Fecha calendario de Santiago, no UTC: un cierre del 30 no debe mostrarse como 29.
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/** `YYYY-MM-DD` del input → mediodía de Santiago en UTC, para que ningún huso lo corra de día. */
export function fromDateInput(value: string): string | null {
  return value ? `${value}T12:00:00-03:00` : null;
}

export function partyName(opp: { contact: { razonSocial: string } | null; prospectName: string | null }): string {
  return opp.contact?.razonSocial ?? opp.prospectName ?? 'Sin cliente';
}
