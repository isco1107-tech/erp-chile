import { median, percentile, safeDivide } from './stats';

/**
 * Minería de procesos "liviana": reconstruye cómo fluye el negocio de punta a
 * punta a partir de los documentos que ya existen, sin pedirle a nadie que
 * registre nada extra. Cada etapa muestra volumen, monto y el tiempo real que
 * toma pasar a la siguiente; la etapa más lenta respecto de su referencia es
 * el cuello de botella.
 */

export interface FlowStage {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** % respecto de la etapa anterior (null en la primera o sin base). */
  conversionPct: number | null;
}

export interface FlowLeadTime {
  key: string;
  label: string;
  /** Mediana en días. */
  medianDays: number | null;
  /** Percentil 75: el caso "lento pero no excepcional". */
  p75Days: number | null;
  /** Referencia sana para la etapa; se usa para detectar el cuello de botella. */
  targetDays: number;
  sampleSize: number;
}

export interface BusinessFlow {
  key: 'order-to-cash' | 'procure-to-pay' | 'lead-to-deal';
  title: string;
  description: string;
  stages: FlowStage[];
  leadTimes: FlowLeadTime[];
  bottleneck: { label: string; detail: string } | null;
  /** Indicadores de calidad propios del flujo (ej. % pagado a tiempo). */
  highlights: Array<{ label: string; value: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(0)}%`);

function withConversion(stages: Array<Omit<FlowStage, 'conversionPct'>>): FlowStage[] {
  return stages.map((stage, index) => {
    if (index === 0) return { ...stage, conversionPct: null };
    const ratio = safeDivide(stage.count, stages[index - 1].count);
    return { ...stage, conversionPct: ratio === null ? null : Math.min(100, ratio * 100) };
  });
}

function leadTime(key: string, label: string, samples: number[], targetDays: number): FlowLeadTime {
  const med = median(samples);
  const p75 = percentile(samples, 75);
  return {
    key,
    label,
    medianDays: med === null ? null : Math.round(med * 10) / 10,
    p75Days: p75 === null ? null : Math.round(p75 * 10) / 10,
    targetDays,
    sampleSize: samples.length,
  };
}

/** La etapa cuya mediana más excede su referencia (proporcionalmente). */
function findBottleneck(leadTimes: FlowLeadTime[]): BusinessFlow['bottleneck'] {
  let worst: FlowLeadTime | null = null;
  let worstRatio = 1;
  for (const lt of leadTimes) {
    if (lt.medianDays === null || lt.sampleSize < 3) continue;
    const ratio = lt.medianDays / lt.targetDays;
    if (ratio > worstRatio) {
      worst = lt;
      worstRatio = ratio;
    }
  }
  if (!worst || worst.medianDays === null) return null;
  return {
    label: worst.label,
    detail: `Toma ${worst.medianDays.toLocaleString('es-CL')} días (mediana) contra una referencia de ${worst.targetDays}. Es la etapa que más frena el flujo.`,
  };
}

// ── Order-to-Cash ───────────────────────────────────────────────────────────

export interface O2CInput {
  quotes: Array<{ issueDate: Date; totalAmount: number }>;
  invoices: Array<{
    issueDate: Date;
    dueDate: Date | null;
    totalAmount: number;
    paidAmount: number;
    /** Fecha del último abono cuando quedó totalmente pagada. */
    fullyPaidAt: Date | null;
    /**
     * Venta a crédito. El tiempo de cobro se mide solo sobre estas: una boleta
     * pagada en el mostrador "se cobra" en 0 días y hundiría la mediana.
     * Omitido = se asume a crédito.
     */
    onCredit?: boolean;
  }>;
}

export function orderToCash(input: O2CInput): BusinessFlow {
  const invoiced = input.invoices;
  const withPayment = invoiced.filter((inv) => inv.paidAmount > 0);
  const fullyPaid = invoiced.filter((inv) => inv.fullyPaidAt !== null && inv.paidAmount >= inv.totalAmount);

  const stages: Array<Omit<FlowStage, 'conversionPct'>> = [];
  if (input.quotes.length > 0) {
    stages.push({ key: 'quotes', label: 'Cotizaciones', count: input.quotes.length, amount: input.quotes.reduce((s, q) => s + q.totalAmount, 0) });
  }
  stages.push(
    { key: 'invoiced', label: 'Ventas emitidas', count: invoiced.length, amount: invoiced.reduce((s, i) => s + i.totalAmount, 0) },
    { key: 'collecting', label: 'Con algún cobro', count: withPayment.length, amount: withPayment.reduce((s, i) => s + i.paidAmount, 0) },
    { key: 'collected', label: 'Cobradas 100%', count: fullyPaid.length, amount: fullyPaid.reduce((s, i) => s + i.totalAmount, 0) }
  );

  const creditPaid = fullyPaid.filter((inv) => inv.onCredit !== false);
  const collectionDays = creditPaid.map((inv) => daysBetween(inv.issueDate, inv.fullyPaidAt as Date));
  const withDue = creditPaid.filter((inv) => inv.dueDate !== null);
  const onTime = withDue.filter((inv) => (inv.fullyPaidAt as Date).getTime() <= (inv.dueDate as Date).getTime() + DAY_MS);
  const onTimePct = safeDivide(onTime.length, withDue.length);

  const leadTimes = [leadTime('invoice-to-cash', 'De la venta a crédito al cobro total', collectionDays, 30)];
  const totalInvoiced = invoiced.reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoiced.reduce((s, i) => s + Math.min(i.paidAmount, i.totalAmount), 0);

  return {
    key: 'order-to-cash',
    title: 'De la cotización al cobro',
    description: 'Cómo se transforma lo que cotizas y vendes en plata en la cuenta.',
    stages: withConversion(stages),
    leadTimes,
    bottleneck: findBottleneck(leadTimes),
    highlights: [
      { label: 'Cobrado sobre lo vendido', value: pct(safeDivide(totalCollected, totalInvoiced) === null ? null : (totalCollected / totalInvoiced) * 100) },
      { label: 'Pagadas dentro del plazo', value: pct(onTimePct === null ? null : onTimePct * 100) },
    ],
  };
}

// ── Procure-to-Pay ──────────────────────────────────────────────────────────

export interface P2PInput {
  orders: Array<{ issueDate: Date; totalAmount: number; firstReceiptAt: Date | null; cancelled: boolean }>;
  invoices: Array<{
    issueDate: Date;
    totalAmount: number;
    paidAmount: number;
    fullyPaidAt: Date | null;
    fromOrder: boolean;
    mismatched: boolean;
    pendingApproval: boolean;
  }>;
}

export function procureToPay(input: P2PInput): BusinessFlow {
  const orders = input.orders.filter((order) => !order.cancelled);
  const received = orders.filter((order) => order.firstReceiptAt !== null);
  const invoices = input.invoices;
  const paid = invoices.filter((inv) => inv.fullyPaidAt !== null && inv.paidAmount >= inv.totalAmount);

  const stages: Array<Omit<FlowStage, 'conversionPct'>> = [];
  if (orders.length > 0) {
    stages.push(
      { key: 'orders', label: 'Órdenes de compra', count: orders.length, amount: orders.reduce((s, o) => s + o.totalAmount, 0) },
      { key: 'received', label: 'Mercadería recibida', count: received.length, amount: received.reduce((s, o) => s + o.totalAmount, 0) }
    );
  }
  stages.push(
    { key: 'invoiced', label: 'Facturas de proveedor', count: invoices.length, amount: invoices.reduce((s, i) => s + i.totalAmount, 0) },
    { key: 'paid', label: 'Pagadas 100%', count: paid.length, amount: paid.reduce((s, i) => s + i.totalAmount, 0) }
  );

  const leadTimes: FlowLeadTime[] = [];
  if (orders.length > 0) {
    leadTimes.push(
      leadTime(
        'order-to-receipt',
        'De la orden a la recepción',
        received.map((o) => daysBetween(o.issueDate, o.firstReceiptAt as Date)),
        7
      )
    );
  }
  leadTimes.push(leadTime('invoice-to-payment', 'De la factura al pago', paid.map((i) => daysBetween(i.issueDate, i.fullyPaidAt as Date)), 30));

  const fromOrder = invoices.filter((inv) => inv.fromOrder);
  const mismatched = fromOrder.filter((inv) => inv.mismatched).length;
  const pendingApproval = invoices.filter((inv) => inv.pendingApproval).length;

  return {
    key: 'procure-to-pay',
    title: 'De la compra al pago',
    description: 'Cuánto tardas en abastecerte y en pagarle a tus proveedores, y dónde se traba.',
    stages: withConversion(stages),
    leadTimes,
    bottleneck: findBottleneck(leadTimes),
    highlights: [
      { label: 'Facturas con orden de compra', value: pct(invoices.length === 0 ? null : (fromOrder.length / invoices.length) * 100) },
      { label: 'Con diferencias OC ↔ factura', value: String(mismatched) },
      { label: 'Esperando aprobación', value: String(pendingApproval) },
    ],
  };
}

// ── Lead-to-Deal (CRM) ──────────────────────────────────────────────────────

export interface LeadToDealInput {
  opportunities: Array<{ stage: string; amount: number; createdAt: Date; closedAt: Date | null }>;
}

const STAGE_ORDER = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'] as const;
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  LEAD: 'Prospectos',
  QUALIFIED: 'Calificados',
  PROPOSAL: 'Con propuesta',
  NEGOTIATION: 'En negociación',
  WON: 'Ganados',
};

/**
 * Embudo acumulado: una oportunidad en "Negociación" también pasó por
 * Prospecto, Calificada y Propuesta. Las perdidas cuentan solo en la primera
 * etapa (no sabemos en cuál se cayeron sin historial de etapas).
 */
export function leadToDeal(input: LeadToDealInput): BusinessFlow {
  const reached = (stageIndex: number) =>
    input.opportunities.filter((opp) => {
      const index = STAGE_ORDER.indexOf(opp.stage as (typeof STAGE_ORDER)[number]);
      return index >= stageIndex || (stageIndex === 0 && opp.stage === 'LOST');
    });
  const stages = STAGE_ORDER.map((stage, index) => {
    const items = reached(index);
    return { key: stage, label: STAGE_LABEL[stage], count: items.length, amount: items.reduce((s, o) => s + o.amount, 0) };
  });
  const won = input.opportunities.filter((opp) => opp.stage === 'WON' && opp.closedAt);
  const lost = input.opportunities.filter((opp) => opp.stage === 'LOST');
  const closed = won.length + lost.length;
  const leadTimes = [leadTime('lead-to-won', 'Del prospecto al cierre ganado', won.map((o) => daysBetween(o.createdAt, o.closedAt as Date)), 45)];

  return {
    key: 'lead-to-deal',
    title: 'Del prospecto al negocio',
    description: 'Tu embudo comercial: cuántos prospectos avanzan y cuánto tardan en cerrarse.',
    stages: withConversion(stages),
    leadTimes,
    bottleneck: findBottleneck(leadTimes),
    highlights: [{ label: 'Tasa de cierre (ganadas / cerradas)', value: pct(closed === 0 ? null : (won.length / closed) * 100) }],
  };
}
