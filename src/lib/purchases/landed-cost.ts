/**
 * Costeo de una carpeta de importación ("costo puesto en bodega").
 *
 * Costo de cada producto = su valor FOB en pesos + la parte que le toca de
 * los costos de la carpeta (flete, seguro, derechos, agente de aduana,
 * puerto, transporte). El reparto es por valor FOB (lo habitual: el seguro y
 * el arancel se calculan sobre valor) o por unidades (útil cuando el flete
 * manda y los productos son parecidos en volumen).
 *
 * El IVA de importación NO es costo: es crédito fiscal y se recupera en el
 * F29, igual que el de una compra local. Se calcula solo como referencia.
 */

export const IMPORT_COST_KINDS = ['FREIGHT', 'INSURANCE', 'DUTY', 'CUSTOMS_AGENT', 'PORT', 'TRANSPORT', 'OTHER'] as const;
export type ImportCostKind = (typeof IMPORT_COST_KINDS)[number];

export const IMPORT_COST_LABELS: Record<ImportCostKind, string> = {
  FREIGHT: 'Flete internacional',
  INSURANCE: 'Seguro',
  DUTY: 'Derechos de aduana (ad valorem)',
  CUSTOMS_AGENT: 'Agente de aduana',
  PORT: 'Puerto y almacenaje',
  TRANSPORT: 'Transporte a bodega',
  OTHER: 'Otros costos',
};

/** Derecho ad valorem general de Chile sobre el valor CIF (sin tratado de libre comercio). */
export const GENERAL_DUTY_RATE = 0.06;
export const IMPORT_VAT_RATE = 0.19;

export type AllocationMethod = 'VALUE' | 'QUANTITY';

export interface LandedItemInput {
  id: string;
  quantity: number;
  unitPriceForeign: number;
}

export interface LandedCostInput {
  kind: string;
  amount: number;
}

export interface LandedItemResult {
  id: string;
  /** Valor FOB de la línea en pesos (entero). */
  fobClp: number;
  /** Costos asignados a la línea (entero). */
  allocated: number;
  /** Costo total puesto en bodega de la línea. */
  landedTotal: number;
  /** Costo unitario con 2 decimales (misma precisión que el PMP). */
  landedUnitCost: number;
}

export interface LandedCostResult {
  items: LandedItemResult[];
  fobTotal: number;
  costsTotal: number;
  landedTotal: number;
  /** CIF = FOB + flete + seguro (base del arancel). */
  cif: number;
  /** Arancel general sugerido (6% del CIF). */
  suggestedDuty: number;
  /** IVA de importación de referencia: 19% sobre CIF + derechos. Crédito fiscal, no costo. */
  importVat: number;
  /** Cuánto sube el costo sobre el FOB, en porcentaje (1 decimal). */
  upliftPercent: number;
}

/**
 * Reparte `total` en enteros proporcionales a `weights` por el método del
 * resto mayor: la suma siempre cuadra exacta con `total`, sin pesos perdidos.
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0 || weights.length === 0) return weights.map(() => 0);
  if (weightSum <= 0) {
    // Sin base de reparto (todo con valor 0): partes iguales.
    return allocateLargestRemainder(total, weights.map(() => 1));
  }
  const raw = weights.map((weight) => (total * weight) / weightSum);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (remainder <= 0) break;
    floors[entry.index] += 1;
    remainder -= 1;
  }
  return floors;
}

export function computeLandedCost(input: {
  exchangeRate: number;
  method: AllocationMethod;
  items: LandedItemInput[];
  costs: LandedCostInput[];
}): LandedCostResult {
  if (!(input.exchangeRate > 0)) throw new Error('El tipo de cambio debe ser mayor a cero');
  const fob = input.items.map((item) => Math.round(item.quantity * item.unitPriceForeign * input.exchangeRate));
  const costsTotal = input.costs.reduce((sum, cost) => sum + cost.amount, 0);
  const weights = input.method === 'QUANTITY' ? input.items.map((item) => item.quantity) : fob;
  const allocation = allocateLargestRemainder(costsTotal, weights);

  const items: LandedItemResult[] = input.items.map((item, index) => {
    const landedTotal = fob[index] + allocation[index];
    return {
      id: item.id,
      fobClp: fob[index],
      allocated: allocation[index],
      landedTotal,
      landedUnitCost: item.quantity > 0 ? Math.round((landedTotal / item.quantity) * 100) / 100 : 0,
    };
  });

  const fobTotal = fob.reduce((sum, value) => sum + value, 0);
  const freightInsurance = input.costs.filter((cost) => cost.kind === 'FREIGHT' || cost.kind === 'INSURANCE').reduce((sum, cost) => sum + cost.amount, 0);
  const duty = input.costs.filter((cost) => cost.kind === 'DUTY').reduce((sum, cost) => sum + cost.amount, 0);
  const cif = fobTotal + freightInsurance;
  const landedTotal = fobTotal + costsTotal;

  return {
    items,
    fobTotal,
    costsTotal,
    landedTotal,
    cif,
    suggestedDuty: Math.round(cif * GENERAL_DUTY_RATE),
    importVat: Math.round((cif + duty) * IMPORT_VAT_RATE),
    upliftPercent: fobTotal > 0 ? Math.round((costsTotal / fobTotal) * 1000) / 10 : 0,
  };
}
