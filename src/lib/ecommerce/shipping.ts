import { z } from 'zod';
import regions from '@/lib/chile/locations';

/**
 * Despacho de la tienda: tarifas por región. Puro (sin servidor ni red): lo usa
 * el panel para configurarlas, el carrito para ofrecerlas y el servidor para
 * cobrarlas (el servidor recalcula SIEMPRE; el navegador nunca fija un precio).
 *
 * Las tarifas son del comercio, no de un transportista: no se inventa un valor ni
 * se consulta un courier. El valor del despacho es el que la empresa quiere cobrar.
 */

export const REGION_NAMES: readonly string[] = regions.map((region) => region.name);
export const MAX_SHIPPING_RATES = 20;

const days = z.number().int().min(0).max(60).nullable().default(null);

export const shippingRateSchema = z
  .object({
    /** Identificador estable: el pedido guarda cuál tarifa eligió el comprador. */
    id: z.string().trim().min(1).max(40),
    name: z.string().trim().min(2, 'Ponle un nombre a la tarifa').max(60, 'El nombre puede tener hasta 60 caracteres'),
    /** Regiones a las que aplica (nombres de `locations.ts`). Vacío = todo Chile. */
    regions: z
      .array(z.string().refine((name) => REGION_NAMES.includes(name), 'Región desconocida'))
      .max(REGION_NAMES.length)
      .default([]),
    /** CLP con IVA. 0 = despacho gratis. */
    price: z.number().int().min(0, 'El precio no puede ser negativo').max(1_000_000, 'El precio es demasiado alto'),
    /** El despacho es gratis cuando los productos del pedido (con IVA) llegan a este monto. */
    freeOver: z.number().int().min(1).max(100_000_000).nullable().default(null),
    minDays: days,
    maxDays: days,
    note: z.string().trim().max(160).default(''),
  })
  .refine((rate) => rate.minDays === null || rate.maxDays === null || rate.minDays <= rate.maxDays, {
    message: 'El plazo mínimo no puede superar al máximo',
    path: ['maxDays'],
  });

export type StoreShippingRate = z.infer<typeof shippingRateSchema>;

export const shippingRatesSchema = z
  .array(shippingRateSchema)
  .max(MAX_SHIPPING_RATES, `Hasta ${MAX_SHIPPING_RATES} tarifas de despacho`)
  .refine((rates) => new Set(rates.map((rate) => rate.id)).size === rates.length, 'Hay tarifas con el mismo identificador');

/** Lee lo guardado en la base: descarta lo que no cumple en vez de romper la tienda entera. */
export function parseShippingRates(raw: unknown): StoreShippingRate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rates: StoreShippingRate[] = [];
  for (const item of raw) {
    const parsed = shippingRateSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    rates.push(parsed.data);
    if (rates.length >= MAX_SHIPPING_RATES) break;
  }
  return rates;
}

/** Tarifas que llegan a una región, de la más barata a la más cara. */
export function ratesForRegion(rates: readonly StoreShippingRate[], region: string): StoreShippingRate[] {
  return rates
    .filter((rate) => rate.regions.length === 0 || rate.regions.includes(region))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'es'));
}

/** Lo que paga el comprador por el despacho de un pedido cuyos productos suman `itemsTotal` (con IVA). */
export function shippingPrice(rate: Pick<StoreShippingRate, 'price' | 'freeOver'>, itemsTotal: number): number {
  if (rate.freeOver !== null && itemsTotal >= rate.freeOver) return 0;
  return rate.price;
}

/** "2 a 4 días hábiles", "Hasta 3 días hábiles" o `null` si la tarifa no declara plazo. */
export function etaLabel(rate: Pick<StoreShippingRate, 'minDays' | 'maxDays'>): string | null {
  const { minDays, maxDays } = rate;
  if (minDays === null && maxDays === null) return null;
  const unit = (n: number) => (n === 1 ? 'día hábil' : 'días hábiles');
  if (minDays !== null && maxDays !== null) {
    if (minDays === maxDays) return `${maxDays} ${unit(maxDays)}`;
    return `${minDays} a ${maxDays} ${unit(maxDays)}`;
  }
  if (maxDays !== null) return `Hasta ${maxDays} ${unit(maxDays)}`;
  return `Desde ${minDays} ${unit(minDays as number)}`;
}

export interface ShippingAddress {
  region: string;
  comuna: string;
  street: string;
  extra: string;
}

export const shippingAddressSchema = z.object({
  region: z.string().refine((name) => REGION_NAMES.includes(name), 'Elige tu región'),
  comuna: z.string().trim().min(2, 'Escribe tu comuna').max(60),
  street: z.string().trim().min(4, 'Escribe la calle y el número').max(120),
  extra: z.string().trim().max(120).default(''),
});

/** Comunas de una región (para sugerirlas al escribir); sin región conocida, vacío. */
export function comunasOf(region: string): string[] {
  return regions.find((entry) => entry.name === region)?.comunas ?? [];
}
