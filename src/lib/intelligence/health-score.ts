import { piecewise } from './stats';

/**
 * Puntaje de salud de la empresa (0-100), compuesto por seis dimensiones.
 *
 * Criterio de diseño: cada dimensión se calcula SOLO si hay datos reales para
 * ella (una empresa de servicios no tiene inventario, una sin Tesorería no
 * tiene cartera). El puntaje global es el promedio ponderado de las
 * dimensiones disponibles, renormalizando los pesos — nunca se rellena un
 * hueco con un valor inventado.
 *
 * Los tramos son referenciales para pymes chilenas y se explican en pantalla:
 * el objetivo es orientar la conversación, no reemplazar el juicio del dueño
 * o del contador.
 */

export type HealthDimensionKey = 'liquidity' | 'profitability' | 'growth' | 'collection' | 'inventory' | 'concentration';
export type HealthStatus = 'good' | 'fair' | 'poor';
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface HealthInput {
  /** (CxC + inventario) / CxP. `Infinity` si hay activos y cero deuda con proveedores. */
  quickRatio: number | null;
  grossMarginPct: number | null;
  /** Variación % de ventas: últimos 90 días vs. los 90 anteriores. */
  growthPct: number | null;
  /** % de la cartera por cobrar que está vencida. */
  overdueReceivablesPct: number | null;
  dso: number | null;
  dio: number | null;
  /** % del valor del inventario sin ventas en 90 días. */
  stagnantInventoryPct: number | null;
  topCustomerSharePct: number | null;
  top5CustomerSharePct: number | null;
}

export interface HealthDimension {
  key: HealthDimensionKey;
  label: string;
  score: number;
  status: HealthStatus;
  weight: number;
  valueLabel: string;
  explanation: string;
  recommendation: string;
}

export interface HealthScore {
  overall: number | null;
  grade: HealthGrade | null;
  dimensions: HealthDimension[];
}

const WEIGHTS: Record<HealthDimensionKey, number> = {
  liquidity: 20,
  profitability: 20,
  growth: 15,
  collection: 20,
  inventory: 10,
  concentration: 15,
};

export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  good: 'Saludable',
  fair: 'Atención',
  poor: 'Crítico',
};

function statusFor(score: number): HealthStatus {
  if (score >= 70) return 'good';
  if (score >= 45) return 'fair';
  return 'poor';
}

export function gradeFor(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

const pct = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

function recommendation(status: HealthStatus, texts: Record<HealthStatus, string>): string {
  return texts[status];
}

export function computeHealthScore(input: HealthInput): HealthScore {
  const dimensions: HealthDimension[] = [];
  const add = (key: HealthDimensionKey, label: string, score: number, valueLabel: string, explanation: string, texts: Record<HealthStatus, string>) => {
    const rounded = Math.round(Math.min(100, Math.max(0, score)));
    const status = statusFor(rounded);
    dimensions.push({ key, label, score: rounded, status, weight: WEIGHTS[key], valueLabel, explanation, recommendation: recommendation(status, texts) });
  };

  if (input.quickRatio !== null) {
    const ratio = input.quickRatio;
    const score = Number.isFinite(ratio) ? piecewise(ratio, [[0.5, 10], [1, 50], [1.5, 75], [2, 90], [3, 100]]) : 100;
    add(
      'liquidity',
      'Liquidez operativa',
      score,
      Number.isFinite(ratio) ? `${ratio.toFixed(2).replace('.', ',')}x` : 'Sin deuda con proveedores',
      'Cuánto cubren tus cuentas por cobrar e inventario lo que debes a proveedores. No incluye el saldo en bancos.',
      {
        good: 'Tu capital de trabajo cubre con holgura lo que debes. Evalúa negociar descuentos por pronto pago a proveedores.',
        fair: 'La cobertura es justa: prioriza cobrar lo vencido antes de comprometer compras nuevas.',
        poor: 'Debes más de lo que tienes por cobrar e inventario. Renegocia plazos con proveedores y acelera la cobranza ya.',
      }
    );
  }

  if (input.grossMarginPct !== null) {
    add(
      'profitability',
      'Rentabilidad bruta',
      piecewise(input.grossMarginPct, [[0, 0], [10, 30], [20, 55], [30, 75], [40, 90], [55, 100]]),
      pct(input.grossMarginPct),
      'Margen sobre costo PMP de lo vendido en los últimos 90 días (ventas netas − costo de ventas).',
      {
        good: 'Buen margen. Protégelo vigilando los descuentos y el alza de costos de tus proveedores.',
        fair: 'Margen ajustado: revisa precios de los productos A con menor margen y los descuentos por línea.',
        poor: 'El margen no alcanza a cubrir gastos fijos. Revisa precios, costos de compra y productos con margen negativo.',
      }
    );
  }

  if (input.growthPct !== null) {
    const growth = input.growthPct;
    add(
      'growth',
      'Crecimiento',
      piecewise(growth, [[-30, 0], [-10, 30], [0, 55], [10, 75], [25, 95], [40, 100]]),
      `${growth > 0 ? '+' : ''}${pct(growth)}`,
      'Ventas netas de los últimos 90 días contra los 90 días anteriores.',
      {
        good: 'Las ventas crecen. Asegura que el inventario y la cobranza acompañen el ritmo.',
        fair: 'Ventas planas: activa a los clientes "en riesgo" del análisis RFM y revisa el embudo comercial.',
        poor: 'Las ventas caen de forma relevante. Identifica qué clientes y productos explican la baja.',
      }
    );
  }

  const collectionScore = average([
    input.overdueReceivablesPct === null ? null : piecewise(input.overdueReceivablesPct, [[0, 100], [10, 85], [25, 60], [50, 25], [75, 5]]),
    input.dso === null ? null : piecewise(input.dso, [[15, 100], [30, 85], [45, 65], [60, 45], [90, 20], [120, 5]]),
  ]);
  if (collectionScore !== null) {
    const parts: string[] = [];
    if (input.dso !== null) parts.push(`${input.dso} días de cobro`);
    if (input.overdueReceivablesPct !== null) parts.push(`${pct(input.overdueReceivablesPct)} vencido`);
    add(
      'collection',
      'Cobranza',
      collectionScore,
      parts.join(' · '),
      'Días promedio que tardas en cobrar (DSO) y qué parte de la cartera ya venció.',
      {
        good: 'Cobras a tiempo. Mantén los recordatorios automáticos activos.',
        fair: 'La cartera se está alargando: automatiza recordatorios y revisa límites de crédito.',
        poor: 'Tienes mucha plata atrapada en clientes. Congela crédito a morosos y gestiona la cartera vencida hoy.',
      }
    );
  }

  const inventoryScore = average([
    input.dio === null ? null : piecewise(input.dio, [[15, 100], [30, 90], [60, 70], [90, 50], [180, 20], [365, 5]]),
    input.stagnantInventoryPct === null ? null : piecewise(input.stagnantInventoryPct, [[0, 100], [10, 85], [25, 60], [50, 25], [75, 5]]),
  ]);
  if (inventoryScore !== null) {
    const parts: string[] = [];
    if (input.dio !== null) parts.push(`${input.dio} días de inventario`);
    if (input.stagnantInventoryPct !== null) parts.push(`${pct(input.stagnantInventoryPct)} sin rotación`);
    add(
      'inventory',
      'Eficiencia de inventario',
      inventoryScore,
      parts.join(' · '),
      'Días que dura tu inventario al ritmo actual de ventas (DIO) y cuánto valor no se ha movido en 90 días.',
      {
        good: 'Inventario sano. Revisa los mínimos de stock para no quebrar en productos A.',
        fair: 'Hay capital inmovilizado: liquida o promociona los productos sin rotación.',
        poor: 'Demasiada plata en bodega. Frena compras de productos C y liquida stock sin movimiento.',
      }
    );
  }

  const concentrationScore = average([
    input.topCustomerSharePct === null ? null : piecewise(input.topCustomerSharePct, [[10, 100], [20, 85], [30, 65], [50, 35], [70, 10]]),
    input.top5CustomerSharePct === null ? null : piecewise(input.top5CustomerSharePct, [[30, 100], [50, 80], [70, 55], [90, 20]]),
  ]);
  if (concentrationScore !== null) {
    const parts: string[] = [];
    if (input.topCustomerSharePct !== null) parts.push(`Principal cliente: ${pct(input.topCustomerSharePct)}`);
    if (input.top5CustomerSharePct !== null) parts.push(`Top 5: ${pct(input.top5CustomerSharePct)}`);
    add(
      'concentration',
      'Diversificación de clientes',
      concentrationScore,
      parts.join(' · '),
      'Qué tan dependiente es tu venta de pocos clientes en los últimos 12 meses. Menos concentración = menos riesgo.',
      {
        good: 'Venta bien repartida: perder un cliente no pone en riesgo el negocio.',
        fair: 'Dependes bastante de pocos clientes: desarrolla nuevas cuentas con el CRM.',
        poor: 'Alta dependencia de uno o pocos clientes. Un solo atraso o pérdida te golpearía fuerte.',
      }
    );
  }

  if (dimensions.length === 0) return { overall: null, grade: null, dimensions };
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const overall = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight);
  return { overall, grade: gradeFor(overall), dimensions };
}
