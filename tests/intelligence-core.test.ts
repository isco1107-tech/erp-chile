import { classifyAbc, summarizeAbc } from '@/lib/intelligence/abc';
import { cashConversionCycle, workingCapitalImpact } from '@/lib/intelligence/cash-cycle';
import { bucketByWeek, runningBalance, type ForecastFlow } from '@/lib/intelligence/cash-forecast';
import { computeHealthScore, gradeFor, type HealthInput } from '@/lib/intelligence/health-score';
import { generateInsights, type InsightInput } from '@/lib/intelligence/insights';
import { leadToDeal, orderToCash, procureToPay } from '@/lib/intelligence/process-flows';
import { scoreRfm, segmentFor, summarizeRfm } from '@/lib/intelligence/rfm';
import { NEUTRAL_LEVERS, simulate } from '@/lib/intelligence/simulator';
import { herfindahl, linearFit, median, percentChange, percentile, piecewise, projectLinear, safeDivide } from '@/lib/intelligence/stats';
import { upcomingTaxObligations } from '@/lib/intelligence/tax-calendar';

const DAY = 24 * 60 * 60 * 1000;

describe('estadística base', () => {
  it('ajusta una recta perfecta con r2 = 1', () => {
    const fit = linearFit([10, 20, 30, 40]);
    expect(fit?.slope).toBeCloseTo(10);
    expect(fit?.intercept).toBeCloseTo(10);
    expect(fit?.r2).toBeCloseTo(1);
  });

  it('no inventa tendencia con menos de 3 puntos', () => {
    expect(projectLinear([100, 200], 3)).toEqual([]);
  });

  it('nunca proyecta ventas negativas', () => {
    const projection = projectLinear([300, 200, 100, 50], 6);
    expect(projection.every((p) => p.value >= 0 && p.low >= 0)).toBe(true);
  });

  it('la banda de confianza se abre con la distancia', () => {
    const projection = projectLinear([100, 140, 90, 160, 120, 180], 3);
    const spreads = projection.map((p) => p.high - p.value);
    expect(spreads[2]).toBeGreaterThanOrEqual(spreads[0]);
  });

  it('mediana y percentiles', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(percentile([10, 20, 30, 40, 50], 75)).toBe(40);
  });

  it('división y variación sin base devuelven null en vez de Infinity', () => {
    expect(safeDivide(5, 0)).toBeNull();
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(120, 100)).toBeCloseTo(20);
  });

  it('interpola por tramos y recorta extremos', () => {
    const points = [[0, 0], [10, 100]] as const;
    expect(piecewise(-5, points)).toBe(0);
    expect(piecewise(5, points)).toBe(50);
    expect(piecewise(50, points)).toBe(100);
  });

  it('Herfindahl de un monopolio es 10.000', () => {
    expect(herfindahl([100])).toBe(10000);
    expect(herfindahl([50, 50])).toBe(5000);
  });
});

describe('clasificación ABC', () => {
  it('el primer ítem siempre es A aunque concentre casi todo', () => {
    const result = classifyAbc([
      { id: 'x', value: 900 },
      { id: 'y', value: 60 },
      { id: 'z', value: 40 },
    ]);
    expect(result[0]).toMatchObject({ id: 'x', abc: 'A' });
    expect(result[1].abc).toBe('B');
    expect(result[2].abc).toBe('C');
  });

  it('reparte A/B/C según participación acumulada', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: String(i), value: 10 }));
    const result = classifyAbc(items);
    const summary = summarizeAbc(result);
    expect(summary.A.count).toBe(8);
    expect(summary.B.count).toBe(2);
    expect(summary.A.share + summary.B.share + summary.C.share).toBeCloseTo(1);
  });

  it('ítems sin valor quedan en C sin romper la suma', () => {
    const result = classifyAbc([
      { id: 'a', value: 0 },
      { id: 'b', value: 100 },
    ]);
    expect(result.find((r) => r.id === 'a')?.abc).toBe('C');
    expect(result.find((r) => r.id === 'b')?.abc).toBe('A');
  });
});

describe('segmentación RFM', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  it('distingue campeones de clientes de alto valor que se están yendo', () => {
    const result = scoreRfm(
      [
        { id: 'champ', name: 'Campeón', lastPurchase: ago(2), frequency: 40, monetary: 50_000_000 },
        { id: 'lost', name: 'Se va', lastPurchase: ago(200), frequency: 35, monetary: 45_000_000 },
        { id: 'new', name: 'Nuevo', lastPurchase: ago(3), frequency: 1, monetary: 200_000 },
        { id: 'sleep', name: 'Dormido', lastPurchase: ago(300), frequency: 1, monetary: 100_000 },
        { id: 'mid', name: 'Medio', lastPurchase: ago(60), frequency: 10, monetary: 5_000_000 },
      ],
      now
    );
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));
    expect(byId.champ.segment).toBe('CHAMPIONS');
    expect(byId.lost.segment).toBe('CANT_LOSE');
    expect(byId.new.segment).toBe('PROMISING');
    expect(byId.sleep.segment).toBe('HIBERNATING');
    expect(byId.champ.recencyDays).toBe(2);
  });

  it('un solo cliente recibe puntaje neutro, no el peor', () => {
    const [only] = scoreRfm([{ id: 'a', name: 'A', lastPurchase: ago(10), frequency: 3, monetary: 1000 }], now);
    expect([only.r, only.f, only.m]).toEqual([3, 3, 3]);
  });

  it('las reglas de segmento cubren todas las combinaciones', () => {
    for (let r = 1; r <= 5; r += 1)
      for (let f = 1; f <= 5; f += 1)
        for (let m = 1; m <= 5; m += 1) expect(typeof segmentFor(r, f, m)).toBe('string');
  });

  it('el resumen suma clientes y montos por segmento', () => {
    const summary = summarizeRfm(
      scoreRfm(
        [
          { id: 'a', name: 'A', lastPurchase: ago(1), frequency: 10, monetary: 100 },
          { id: 'b', name: 'B', lastPurchase: ago(100), frequency: 1, monetary: 50 },
        ],
        now
      )
    );
    const totalCount = Object.values(summary).reduce((s, v) => s + v.count, 0);
    const totalMonetary = Object.values(summary).reduce((s, v) => s + v.monetary, 0);
    expect(totalCount).toBe(2);
    expect(totalMonetary).toBe(150);
  });
});

describe('ciclo de conversión de caja', () => {
  it('calcula DSO, DIO, DPO y CCC', () => {
    const cycle = cashConversionCycle({
      receivables: 30_000,
      salesGross: 90_000,
      inventoryValue: 20_000,
      costOfSales: 60_000,
      payables: 15_000,
      purchasesGross: 45_000,
      days: 90,
    });
    expect(cycle).toEqual({ dso: 30, dio: 30, dpo: 30, ccc: 30 });
  });

  it('una empresa sin inventario sigue teniendo ciclo', () => {
    const cycle = cashConversionCycle({ receivables: 10, salesGross: 90, inventoryValue: 0, costOfSales: 0, payables: 0, purchasesGross: 0, days: 90 });
    expect(cycle.dio).toBeNull();
    expect(cycle.ccc).toBe(10);
  });

  it('sin ventas no hay DSO ni ciclo', () => {
    expect(cashConversionCycle({ receivables: 10, salesGross: 0, inventoryValue: 0, costOfSales: 0, payables: 0, purchasesGross: 0, days: 90 }).ccc).toBeNull();
  });

  it('cobrar 10 días antes libera 10 días de venta', () => {
    expect(workingCapitalImpact({ salesGross: 36_500_000, costOfSales: 0, purchasesGross: 0 }, { dso: -10, dio: 0, dpo: 0 })).toBe(1_000_000);
  });
});

describe('puntaje de salud', () => {
  const EMPTY: HealthInput = {
    quickRatio: null,
    grossMarginPct: null,
    growthPct: null,
    overdueReceivablesPct: null,
    dso: null,
    dio: null,
    stagnantInventoryPct: null,
    topCustomerSharePct: null,
    top5CustomerSharePct: null,
  };

  it('sin datos no inventa un puntaje', () => {
    expect(computeHealthScore(EMPTY)).toEqual({ overall: null, grade: null, dimensions: [] });
  });

  it('solo evalúa las dimensiones con datos y renormaliza los pesos', () => {
    const result = computeHealthScore({ ...EMPTY, grossMarginPct: 55 });
    expect(result.dimensions).toHaveLength(1);
    expect(result.overall).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('una empresa en problemas cae en rojo', () => {
    const result = computeHealthScore({
      quickRatio: 0.4,
      grossMarginPct: -5,
      growthPct: -40,
      overdueReceivablesPct: 80,
      dso: 150,
      dio: 400,
      stagnantInventoryPct: 80,
      topCustomerSharePct: 75,
      top5CustomerSharePct: 95,
    });
    expect(result.overall).toBeLessThan(20);
    expect(result.grade).toBe('E');
    expect(result.dimensions.every((d) => d.status === 'poor')).toBe(true);
  });

  it('sin deuda con proveedores la liquidez es máxima', () => {
    const result = computeHealthScore({ ...EMPTY, quickRatio: Number.POSITIVE_INFINITY });
    expect(result.dimensions[0]).toMatchObject({ key: 'liquidity', score: 100 });
  });

  it('las notas cubren todo el rango', () => {
    expect([gradeFor(90), gradeFor(75), gradeFor(60), gradeFor(45), gradeFor(10)]).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('simulador', () => {
  const baseline = { netSales: 100_000_000, costOfSales: 70_000_000, salesGross: 119_000_000, purchasesGross: 83_300_000 };

  it('sin palancas no cambia nada', () => {
    const result = simulate(baseline, NEUTRAL_LEVERS);
    expect(result.deltaGrossProfit).toBe(0);
    expect(result.cashFromWorkingCapital).toBe(0);
    expect(result.grossMarginPct).toBeCloseTo(30);
  });

  it('bajar 10% el precio con 30% de margen exige vender 50% más para empatar', () => {
    const result = simulate(baseline, { ...NEUTRAL_LEVERS, pricePct: -10 });
    expect(result.breakEvenVolumePct).toBeCloseTo(50);
    expect(result.deltaGrossProfit).toBe(-10_000_000);
  });

  it('subir 5% el precio sin perder volumen va directo a la utilidad', () => {
    expect(simulate(baseline, { ...NEUTRAL_LEVERS, pricePct: 5 }).deltaGrossProfit).toBe(5_000_000);
  });
});

describe('calendario tributario', () => {
  it('antes del 20, el F29 vence este mes por el período anterior', () => {
    const [f29] = upcomingTaxObligations(new Date('2026-09-10T15:00:00Z'), { hasPayroll: false, electronicInvoicing: true }).filter((o) => o.id === 'f29');
    expect(f29.title).toBe('F29 de agosto');
    expect(f29.daysLeft).toBe(11);
  });

  it('después del 20, pasa al mes siguiente', () => {
    const [f29] = upcomingTaxObligations(new Date('2026-09-22T15:00:00Z'), { hasPayroll: false, electronicInvoicing: true }).filter((o) => o.id === 'f29');
    expect(f29.title).toBe('F29 de septiembre');
  });

  it('corre al lunes un vencimiento en fin de semana', () => {
    // 20 de junio de 2026 es sábado.
    const [f29] = upcomingTaxObligations(new Date('2026-06-15T15:00:00Z'), { hasPayroll: false, electronicInvoicing: true }).filter((o) => o.id === 'f29');
    expect(f29.dueDate.toISOString().slice(0, 10)).toBe('2026-06-22');
  });

  it('Previred solo aparece con remuneraciones', () => {
    const without = upcomingTaxObligations(new Date('2026-09-01T15:00:00Z'), { hasPayroll: false, electronicInvoicing: true });
    const withPayroll = upcomingTaxObligations(new Date('2026-09-01T15:00:00Z'), { hasPayroll: true, electronicInvoicing: true });
    expect(without.some((o) => o.id === 'previred')).toBe(false);
    expect(withPayroll.some((o) => o.id === 'previred')).toBe(true);
  });

  it('viene ordenado por fecha', () => {
    const list = upcomingTaxObligations(new Date('2026-09-01T15:00:00Z'), { hasPayroll: true, electronicInvoicing: true });
    for (let i = 1; i < list.length; i += 1) expect(list[i].dueDate.getTime()).toBeGreaterThanOrEqual(list[i - 1].dueDate.getTime());
  });
});

describe('caja proyectada', () => {
  const start = new Date('2026-09-21T03:00:00Z');
  const at = (days: number) => new Date(start.getTime() + days * DAY);

  it('agrupa por semana y separa la cobranza vencida', () => {
    const flows: ForecastFlow[] = [
      { date: at(1), amount: 1000, kind: 'receivable', label: 'F1' },
      { date: at(8), amount: 500, kind: 'payable', label: 'C1' },
      { date: at(-10), amount: 700, kind: 'receivable', label: 'vencida' },
      { date: at(-5), amount: 300, kind: 'payable', label: 'deuda vencida' },
      { date: at(200), amount: 999, kind: 'receivable', label: 'fuera de horizonte' },
    ];
    const forecast = bucketByWeek(flows, start);
    expect(forecast.weeks).toHaveLength(13);
    expect(forecast.weeks[0].inflows).toBe(1000);
    expect(forecast.weeks[0].outflows).toBe(300);
    expect(forecast.weeks[1].outflows).toBe(500);
    expect(forecast.overdueInflows).toBe(700);
    expect(forecast.overdueOutflows).toBe(300);
  });

  it('el saldo acumula y reparte la recuperación de morosidad en 4 semanas', () => {
    const forecast = bucketByWeek([{ date: at(-3), amount: 4000, kind: 'receivable', label: 'x' }], start);
    const balance = runningBalance(forecast, 10_000, 100);
    expect(balance[0].closing).toBe(11_000);
    expect(balance[3].closing).toBe(14_000);
    expect(balance[12].closing).toBe(14_000);
  });
});

describe('flujos del negocio', () => {
  const d = (iso: string) => new Date(iso);

  it('order-to-cash mide el tiempo de cobro y detecta el cuello de botella', () => {
    const invoices = Array.from({ length: 5 }, (_, i) => ({
      issueDate: d('2026-06-01'),
      dueDate: d('2026-07-01'),
      totalAmount: 1000,
      paidAmount: 1000,
      fullyPaidAt: new Date(d('2026-06-01').getTime() + (60 + i) * DAY),
    }));
    const flow = orderToCash({ quotes: [{ issueDate: d('2026-05-20'), totalAmount: 1000 }], invoices });
    expect(flow.stages.map((s) => s.key)).toEqual(['quotes', 'invoiced', 'collecting', 'collected']);
    expect(flow.leadTimes[0].medianDays).toBe(62);
    expect(flow.bottleneck?.label).toBe('De la venta a crédito al cobro total');
  });

  it('las ventas al contado no cuentan para el tiempo de cobro', () => {
    const cash = Array.from({ length: 5 }, () => ({
      issueDate: d('2026-06-01'),
      dueDate: null,
      totalAmount: 1000,
      paidAmount: 1000,
      fullyPaidAt: d('2026-06-01'),
      onCredit: false,
    }));
    const flow = orderToCash({ quotes: [], invoices: cash });
    expect(flow.leadTimes[0].sampleSize).toBe(0);
    expect(flow.stages.find((s) => s.key === 'collected')?.count).toBe(5);
  });

  it('sin muestra suficiente no declara cuello de botella', () => {
    const flow = orderToCash({
      quotes: [],
      invoices: [{ issueDate: d('2026-06-01'), dueDate: null, totalAmount: 1000, paidAmount: 1000, fullyPaidAt: d('2026-12-01') }],
    });
    expect(flow.bottleneck).toBeNull();
  });

  it('procure-to-pay ignora órdenes anuladas', () => {
    const flow = procureToPay({
      orders: [
        { issueDate: d('2026-06-01'), totalAmount: 100, firstReceiptAt: d('2026-06-03'), cancelled: false },
        { issueDate: d('2026-06-01'), totalAmount: 900, firstReceiptAt: null, cancelled: true },
      ],
      invoices: [],
    });
    expect(flow.stages[0]).toMatchObject({ key: 'orders', count: 1, amount: 100 });
  });

  it('el embudo comercial es acumulativo', () => {
    const flow = leadToDeal({
      opportunities: [
        { stage: 'WON', amount: 100, createdAt: d('2026-01-01'), closedAt: d('2026-02-01') },
        { stage: 'PROPOSAL', amount: 50, createdAt: d('2026-01-01'), closedAt: null },
        { stage: 'LOST', amount: 20, createdAt: d('2026-01-01'), closedAt: d('2026-01-10') },
      ],
    });
    const counts = Object.fromEntries(flow.stages.map((s) => [s.key, s.count]));
    expect(counts).toEqual({ LEAD: 3, QUALIFIED: 2, PROPOSAL: 2, NEGOTIATION: 1, WON: 1 });
    expect(flow.highlights[0].value).toBe('50%');
  });
});

describe('señales automáticas', () => {
  const BASE: InsightInput = {
    dayOfMonth: 15,
    monthToDateNetSales: 1_000_000,
    previousMonthSameDayNetSales: 1_000_000,
    negativeMarginProducts: [],
    stagnantInventoryValue: 0,
    stagnantProductCount: 0,
    overdueReceivables: 0,
    overdue90Receivables: 0,
    totalReceivables: 0,
    topCustomer: null,
    cantLoseCustomers: [],
    atRiskCustomerCount: 0,
    estimatedVatToPay: null,
    vatDueInDays: null,
    forecastNextMonth: null,
    lastFullMonthNetSales: null,
    lowStockCount: 0,
    cashCycleDays: null,
  };

  it('una empresa sin problemas no recibe alarmas', () => {
    expect(generateInsights(BASE)).toEqual([]);
  });

  it('prioriza lo crítico primero', () => {
    const insights = generateInsights({
      ...BASE,
      lowStockCount: 3,
      overdue90Receivables: 2_000_000,
      monthToDateNetSales: 500_000,
    });
    expect(insights[0].severity).toBe('critical');
    expect(insights.map((i) => i.id)).toEqual(expect.arrayContaining(['overdue-90', 'sales-pace-down', 'low-stock']));
  });

  it('no compara el ritmo del mes en sus primeros días', () => {
    expect(generateInsights({ ...BASE, dayOfMonth: 2, monthToDateNetSales: 1 }).some((i) => i.id === 'sales-pace-down')).toBe(false);
  });
});
