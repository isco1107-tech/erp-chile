export const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Hoy en la zona del navegador, "YYYY-MM-DD". */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentPeriod(): string {
  return todayIso().slice(0, 7);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10" → "octubre 2026". */
export function periodLabel(period: string): string {
  return `${MONTHS[Number(period.slice(5, 7)) - 1] ?? period} ${period.slice(0, 4)}`;
}
