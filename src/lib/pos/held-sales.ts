import { z } from 'zod';
import { MAX_LINE_QUANTITY, type CartLine } from './cart';

/**
 * Ventas en espera: el cajero deja un carrito a un lado para atender a otro
 * cliente y lo retoma después. Vive solo en el equipo (no toca el ERP): una
 * venta en espera no descuenta stock ni reserva nada hasta que se cobra.
 */
export interface HeldSale {
  id: string;
  /** Epoch ms de cuando se puso en espera. */
  heldAt: number;
  customerRut: string | null;
  customerName: string | null;
  /** El paso del RUT ya se resolvió (con RUT o como consumidor final). */
  rutResolved: boolean;
  lines: CartLine[];
}

export const MAX_HELD_SALES = 5;

const lineSchema = z.object({
  productId: z.string().min(1),
  sku: z.string(),
  name: z.string(),
  netPrice: z.number().int().min(0),
  grossPrice: z.number().int().min(0),
  quantity: z.number().positive().max(MAX_LINE_QUANTITY),
  stock: z.number(),
  isTrackable: z.boolean(),
  isExempt: z.boolean(),
});

const heldSchema = z.object({
  id: z.string().min(1),
  heldAt: z.number(),
  customerRut: z.string().nullable(),
  customerName: z.string().nullable(),
  rutResolved: z.boolean(),
  lines: z.array(lineSchema).min(1),
});

export type HoldResult = { ok: true; list: HeldSale[] } | { ok: false; error: string };

/** Agrega una venta a la lista; rechaza un carrito vacío o pasar el tope. */
export function holdSale(list: HeldSale[], sale: HeldSale): HoldResult {
  if (sale.lines.length === 0) return { ok: false, error: 'No hay productos para poner en espera' };
  if (list.length >= MAX_HELD_SALES) {
    return { ok: false, error: `Ya hay ${MAX_HELD_SALES} ventas en espera. Cobra o descarta una antes de poner otra` };
  }
  return { ok: true, list: [...list, sale] };
}

/** Saca una venta de la lista (para retomarla o descartarla). */
export function takeHeldSale(list: HeldSale[], id: string): { sale: HeldSale | null; list: HeldSale[] } {
  const sale = list.find((item) => item.id === id) ?? null;
  return { sale, list: list.filter((item) => item.id !== id) };
}

export function serializeHeldSales(list: HeldSale[]): string {
  return JSON.stringify(list);
}

/** Lee el almacenamiento del equipo: lo corrupto o ajeno se descarta, nunca rompe la pantalla. */
export function parseHeldSales(raw: string | null): HeldSale[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const valid: HeldSale[] = [];
    for (const item of data) {
      const parsed = heldSchema.safeParse(item);
      if (parsed.success) valid.push(parsed.data);
    }
    return valid.slice(0, MAX_HELD_SALES);
  } catch {
    return [];
  }
}
