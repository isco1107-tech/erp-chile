/**
 * Paleta semántica compartida por los componentes del nuevo tema claro
 * (KpiCard, StatusBadge, DataTable, ActionCard). Un solo lugar para mapear
 * "tono" -> clases Tailwind, en vez de repetir el mismo `Record` en cada
 * componente.
 *
 * `accent` es el acento de marca (emerald) del brief, mapeado a los tokens
 * `--accent`/`--accent-foreground` de `globals.css` (que en este tema claro
 * son justamente el par soft/hover del emerald, no el significado genérico
 * de "superficie hover" que shadcn le da normalmente a `--accent`).
 */
export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const TONE_SOFT_BG: Record<Tone, string> = {
  accent: 'bg-accent',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
  neutral: 'bg-muted',
};

export const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-muted-foreground',
};
