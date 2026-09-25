/**
 * Cálculos de producción: escalar una receta a la cantidad de la orden,
 * detectar faltantes de insumos y costear el producto terminado.
 *
 * Costo del producto terminado = costo de los insumos consumidos (a su PMP
 * al momento de consumirlos) + costos adicionales de fabricación (mano de
 * obra, energía, maquila). El resultado se redondea a 2 decimales, misma
 * precisión que el PMP del kardex.
 */

export interface BomLine {
  productId: string;
  /** Cantidad por `outputQuantity` unidades de producto terminado. */
  quantity: number;
}

/** Redondeo a 4 decimales: cantidades de insumos (kg, litros) sin ruido binario. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function scaleBom(components: BomLine[], outputQuantity: number, orderQuantity: number): BomLine[] {
  if (!(outputQuantity > 0)) throw new Error('La receta debe producir una cantidad mayor a cero');
  if (!(orderQuantity > 0)) throw new Error('La cantidad a producir debe ser mayor a cero');
  const factor = orderQuantity / outputQuantity;
  return components.map((component) => ({ productId: component.productId, quantity: round4(component.quantity * factor) }));
}

export interface Shortage {
  productId: string;
  required: number;
  available: number;
  missing: number;
}

/** Insumos sin stock suficiente en la bodega de la orden. */
export function findShortages(required: BomLine[], available: Record<string, number>): Shortage[] {
  const totals = new Map<string, number>();
  for (const line of required) totals.set(line.productId, round4((totals.get(line.productId) ?? 0) + line.quantity));
  const shortages: Shortage[] = [];
  for (const [productId, quantity] of totals) {
    const stock = available[productId] ?? 0;
    if (stock + 1e-9 < quantity) shortages.push({ productId, required: quantity, available: stock, missing: round4(quantity - stock) });
  }
  return shortages;
}

/** Costo estimado de una orden con el PMP actual de cada insumo. */
export function estimateOrderCost(required: BomLine[], pmp: Record<string, number>, additionalCost: number, quantity: number): { materials: number; total: number; unitCost: number } {
  const materials = Math.round(required.reduce((sum, line) => sum + line.quantity * (pmp[line.productId] ?? 0), 0));
  return finishedCost(materials, additionalCost, quantity);
}

export function finishedCost(materials: number, additionalCost: number, quantity: number): { materials: number; total: number; unitCost: number } {
  if (!(quantity > 0)) throw new Error('La cantidad producida debe ser mayor a cero');
  const total = materials + Math.max(0, Math.round(additionalCost));
  return { materials, total, unitCost: Math.round((total / quantity) * 100) / 100 };
}

/**
 * Una receta no puede consumirse a sí misma ni repetir insumos: lo primero
 * haría una orden que se consume su propio producto, lo segundo esconde
 * cantidades.
 */
export function validateBom(outputProductId: string, components: BomLine[]): string | null {
  if (components.length === 0) return 'La receta necesita al menos un insumo';
  if (components.some((component) => component.productId === outputProductId)) return 'Un producto no puede ser insumo de su propia receta';
  const ids = components.map((component) => component.productId);
  if (new Set(ids).size !== ids.length) return 'Hay un insumo repetido: súmalo en una sola línea';
  if (components.some((component) => !(component.quantity > 0))) return 'Cada insumo debe tener una cantidad mayor a cero';
  return null;
}
