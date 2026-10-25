/**
 * Rangos de fechas de «Exportar datos». Todo en días calendario `YYYY-MM-DD` de
 * Chile; el servidor los convierte a instantes con `dateRange` (que usa la
 * medianoche de Santiago), así que acá no hay husos horarios.
 */

export const RANGE_PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: '7dias', label: 'Últimos 7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes-anterior', label: 'Mes anterior' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo el historial' },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]['id'];

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export interface DayRange {
  from?: string;
  to?: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatDay({ year, month, day }: CalendarDay): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Suma días calendario sin pasar por la zona horaria del servidor. */
function addDays(base: CalendarDay, days: number): CalendarDay {
  const moved = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** `YYYY-MM-DD` real (rechaza 2026-02-31). */
export function isValidDay(value: string | undefined): value is string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isRangePreset(value: string | undefined): value is RangePresetId {
  return RANGE_PRESETS.some((preset) => preset.id === value);
}

export function presetRange(preset: RangePresetId, today: CalendarDay): DayRange {
  switch (preset) {
    case 'hoy':
      return { from: formatDay(today), to: formatDay(today) };
    case 'ayer': {
      const yesterday = formatDay(addDays(today, -1));
      return { from: yesterday, to: yesterday };
    }
    case '7dias':
      return { from: formatDay(addDays(today, -6)), to: formatDay(today) };
    case 'mes':
      return { from: formatDay({ ...today, day: 1 }), to: formatDay(today) };
    case 'mes-anterior': {
      const lastOfPrevious = addDays({ ...today, day: 1 }, -1);
      return { from: formatDay({ ...lastOfPrevious, day: 1 }), to: formatDay(lastOfPrevious) };
    }
    case 'anio':
      return { from: formatDay({ year: today.year, month: 1, day: 1 }), to: formatDay(today) };
    case 'todo':
      return {};
  }
}

/** Fechas inválidas se ignoran y un rango al revés se da vuelta: nunca lanza ni devuelve vacío por error. */
export function normalizeRange(from: string | undefined, to: string | undefined): DayRange {
  const start = isValidDay(from) ? from : undefined;
  const end = isValidDay(to) ? to : undefined;
  if (start && end && start > end) return { from: end, to: start };
  return { ...(start ? { from: start } : {}), ...(end ? { to: end } : {}) };
}

export interface RangeParams {
  rango?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Qué rango pide la dirección: un atajo (`rango=mes`), fechas propias
 * (`desde`/`hasta`, vacías = sin límite de ese lado) o nada, que es el mes en
 * curso. El mes en curso es el punto de partida porque un archivo de todo el
 * historial puede pasar el tope de filas; «Todo el historial» queda a un clic.
 */
export function rangeFromParams(params: RangeParams, today: CalendarDay): DayRange & { preset: RangePresetId | 'custom' } {
  if (isRangePreset(params.rango)) return { ...presetRange(params.rango, today), preset: params.rango };
  if (params.desde !== undefined || params.hasta !== undefined) {
    const range = normalizeRange(params.desde || undefined, params.hasta || undefined);
    if (!range.from && !range.to) return { preset: 'todo' };
    return { ...range, preset: 'custom' };
  }
  return { ...presetRange('mes', today), preset: 'mes' };
}

/** Texto para el encabezado y el nombre del archivo. */
export function describeRange(range: DayRange): string {
  const show = (value: string) => value.split('-').reverse().join('-');
  if (range.from && range.to) return range.from === range.to ? show(range.from) : `${show(range.from)} al ${show(range.to)}`;
  if (range.from) return `desde ${show(range.from)}`;
  if (range.to) return `hasta ${show(range.to)}`;
  return 'todo el historial';
}

export function exportFileName(prefix: string, range: DayRange): string {
  if (range.from && range.to) return `${prefix}-${range.from}${range.from === range.to ? '' : `_a_${range.to}`}.xlsx`;
  if (range.from) return `${prefix}-desde-${range.from}.xlsx`;
  if (range.to) return `${prefix}-hasta-${range.to}.xlsx`;
  return `${prefix}-historial-completo.xlsx`;
}
