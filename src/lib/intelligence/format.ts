/** Formatos de presentación compartidos por las pantallas de Inteligencia (es-CL). */

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function formatSignedPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatPct(value, decimals)}`;
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('es-CL')} ${Math.abs(Math.round(value)) === 1 ? 'día' : 'días'}`;
}

/** $1,2 M / $350 mil — para ejes y cifras de contexto, nunca para montos exactos. */
export function formatCompactClp(value: number): string {
  return `$${new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
}

export function formatShortDate(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' }).replace('.', '');
}
