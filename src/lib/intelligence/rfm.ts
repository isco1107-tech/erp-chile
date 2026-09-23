/**
 * Segmentación RFM de clientes: Recencia (hace cuánto compró), Frecuencia
 * (cuántas veces) y Monto (cuánto). Cada eje se puntúa 1-5 por RANGO relativo
 * dentro de la propia cartera, no contra umbrales fijos: un cliente "frecuente"
 * en una distribuidora no es lo mismo que en una tienda de barrio.
 */

export interface RfmInput {
  id: string;
  name: string;
  lastPurchase: Date;
  /** Documentos de venta en la ventana analizada. */
  frequency: number;
  /** Venta neta en la ventana analizada (CLP). */
  monetary: number;
}

export type RfmSegment = 'CHAMPIONS' | 'LOYAL' | 'PROMISING' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CANT_LOSE' | 'HIBERNATING';

export interface RfmResult extends RfmInput {
  recencyDays: number;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
}

export const RFM_SEGMENT_META: Record<
  RfmSegment,
  { label: string; description: string; action: string; tone: 'success' | 'info' | 'accent' | 'warning' | 'danger' | 'neutral' }
> = {
  CHAMPIONS: {
    label: 'Campeones',
    description: 'Compran seguido, hace poco y montos altos.',
    action: 'Cuídalos: atención preferente, acceso anticipado a productos y referidos.',
    tone: 'success',
  },
  LOYAL: {
    label: 'Leales',
    description: 'Compran con frecuencia y siguen activos.',
    action: 'Ofrece venta cruzada y condiciones por volumen para subir el ticket.',
    tone: 'info',
  },
  PROMISING: {
    label: 'Nuevos prometedores',
    description: 'Compraron hace poco, pero todavía pocas veces.',
    action: 'Haz seguimiento a la segunda compra: es la que convierte un cliente en recurrente.',
    tone: 'accent',
  },
  NEEDS_ATTENTION: {
    label: 'Requieren atención',
    description: 'Comportamiento intermedio: ni fieles ni perdidos.',
    action: 'Contacto proactivo con una oferta concreta antes de que se enfríen.',
    tone: 'neutral',
  },
  AT_RISK: {
    label: 'En riesgo',
    description: 'Compraban seguido, pero hace tiempo que no vuelven.',
    action: 'Llámalos esta semana: pregunta qué cambió y recupera la relación.',
    tone: 'warning',
  },
  CANT_LOSE: {
    label: 'No se pueden perder',
    description: 'Tus clientes de mayor valor están dejando de comprar.',
    action: 'Prioridad máxima: visita o reunión del dueño o gerente comercial.',
    tone: 'danger',
  },
  HIBERNATING: {
    label: 'Dormidos',
    description: 'Compraron poco y hace mucho.',
    action: 'Campaña de reactivación de bajo costo (correo o WhatsApp masivo).',
    tone: 'neutral',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Puntaje 1-5 por rango: cuántos valores de la cartera son PEORES que este.
 * Los empates reciben el mismo puntaje. Con un solo cliente no hay rango
 * posible: se asigna el neutro 3 en vez de condenarlo a 1.
 */
function rankScores(values: readonly number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n === 1) return [3];
  return values.map((value) => {
    const worse = values.filter((other) => (higherIsBetter ? other < value : other > value)).length;
    return 1 + Math.round((4 * worse) / (n - 1));
  });
}

export function segmentFor(r: number, f: number, m: number): RfmSegment {
  if (r >= 4 && f >= 4 && m >= 4) return 'CHAMPIONS';
  if (r <= 2 && f >= 4 && m >= 4) return 'CANT_LOSE';
  if (r <= 2 && f >= 3) return 'AT_RISK';
  if (r >= 3 && f >= 4) return 'LOYAL';
  if (r >= 4 && f <= 2) return 'PROMISING';
  if (r <= 2 && f <= 2) return 'HIBERNATING';
  return 'NEEDS_ATTENTION';
}

export function scoreRfm(customers: readonly RfmInput[], now: Date = new Date()): RfmResult[] {
  if (customers.length === 0) return [];
  const recency = customers.map((c) => Math.max(0, Math.floor((now.getTime() - c.lastPurchase.getTime()) / DAY_MS)));
  const rScores = rankScores(recency, false);
  const fScores = rankScores(
    customers.map((c) => c.frequency),
    true
  );
  const mScores = rankScores(
    customers.map((c) => c.monetary),
    true
  );
  return customers.map((customer, index) => ({
    ...customer,
    recencyDays: recency[index],
    r: rScores[index],
    f: fScores[index],
    m: mScores[index],
    segment: segmentFor(rScores[index], fScores[index], mScores[index]),
  }));
}

export function summarizeRfm(results: readonly RfmResult[]): Record<RfmSegment, { count: number; monetary: number }> {
  const summary = Object.fromEntries(
    (Object.keys(RFM_SEGMENT_META) as RfmSegment[]).map((segment) => [segment, { count: 0, monetary: 0 }])
  ) as Record<RfmSegment, { count: number; monetary: number }>;
  for (const result of results) {
    summary[result.segment].count += 1;
    summary[result.segment].monetary += result.monetary;
  }
  return summary;
}
