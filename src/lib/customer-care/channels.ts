/**
 * Canales por los que un cliente llega ("¿Cómo nos encontraste?"). Lista
 * cerrada a propósito: con texto libre no se puede contar cuál canal trae
 * más clientes. Lo que no calce va en `OTRO` con su nota.
 */
export const ACQUISITION_CHANNELS = [
  { value: 'SUPERMERCADO', label: 'Supermercado' },
  { value: 'TIENDA_ESPECIALIZADA', label: 'Tienda especializada' },
  { value: 'HORECA', label: 'Hoteles, restaurantes y cafés' },
  { value: 'FERIA', label: 'Feria o rueda de negocios' },
  { value: 'REDES_SOCIALES', label: 'Redes sociales' },
  { value: 'SITIO_WEB', label: 'Sitio web o tienda online' },
  { value: 'WHATSAPP', label: 'WhatsApp directo' },
  { value: 'REFERIDO', label: 'Recomendación de otro cliente' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number]['value'];

export const ACQUISITION_CHANNEL_VALUES = ACQUISITION_CHANNELS.map((c) => c.value) as [AcquisitionChannel, ...AcquisitionChannel[]];

const LABELS = new Map<string, string>(ACQUISITION_CHANNELS.map((c) => [c.value, c.label]));

export function isAcquisitionChannel(value: unknown): value is AcquisitionChannel {
  return typeof value === 'string' && LABELS.has(value);
}

export function channelLabel(value: string | null | undefined): string {
  if (!value) return 'Sin registrar';
  return LABELS.get(value) ?? 'Otro';
}

export interface ChannelShare {
  channel: AcquisitionChannel | null;
  label: string;
  count: number;
  /** Porcentaje entero sobre el total de clientes considerados. */
  percent: number;
}

/**
 * Reparte clientes por canal de origen. `null` reúne a los que aún no se
 * registran: se muestra siempre, porque ese hueco es la brecha a cerrar.
 * Con 0 clientes devuelve una lista vacía (no inventa porcentajes).
 */
export function channelBreakdown(channels: Array<string | null | undefined>): ChannelShare[] {
  const total = channels.length;
  if (total === 0) return [];
  const counts = new Map<AcquisitionChannel | null, number>();
  for (const raw of channels) {
    const key = isAcquisitionChannel(raw) ? raw : raw ? 'OTRO' : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, label: channelLabel(channel), count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}
