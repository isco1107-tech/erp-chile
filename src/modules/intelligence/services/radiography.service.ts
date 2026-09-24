import 'server-only';

import type { DteType, PurchaseDocumentType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TAXABLE_PURCHASE_DOCUMENT_TYPES, TAXABLE_SALES_DTE_TYPES, signForPurchaseDocumentType, signForSalesDteType } from '@/lib/chile/document-sign';
import { addMonthsSantiago, santiagoDateParts, startOfMonthSantiago, startOfTodaySantiago } from '@/lib/chile/timezone';
import { classifyAbc, summarizeAbc, type AbcClass } from '@/lib/intelligence/abc';
import { cashConversionCycle, type CashCycle } from '@/lib/intelligence/cash-cycle';
import { computeHealthScore, type HealthScore } from '@/lib/intelligence/health-score';
import { generateInsights, type Insight } from '@/lib/intelligence/insights';
import { scoreRfm, summarizeRfm, type RfmSegment } from '@/lib/intelligence/rfm';
import type { SimulatorBaseline } from '@/lib/intelligence/simulator';
import { herfindahl, median, percentChange, projectLinear, safeDivide } from '@/lib/intelligence/stats';
import { upcomingTaxObligations } from '@/lib/intelligence/tax-calendar';

/**
 * Radiografía 360 de la empresa: carga una sola vez los documentos reales de
 * los últimos 12 meses y deriva de ellos todos los indicadores. Nada se
 * persiste ni se estima con datos inventados; cada bloque declara si tuvo
 * datos para calcularse (`coverage`).
 *
 * Todas las consultas filtran por `companyId` (aislamiento multi-tenant).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;

/** Receptores de boleta sin RUT (POS): no son un "cliente" para el análisis de cartera. */
const GENERIC_CONSUMER_RUT_PREFIX = '66666666';

/** Tipos que forman una cuenta por cobrar real (sin guías, cotizaciones ni NC). */
const RECEIVABLE_DTE_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56'];

export interface MonthlyPoint {
  key: string;
  label: string;
  netSales: number;
  costOfSales: number;
  grossProfit: number;
}

export interface ForecastPoint {
  label: string;
  value: number;
  low: number;
  high: number;
}

export interface CustomerRow {
  id: string;
  name: string;
  netSales: number;
  sharePct: number;
  abc: AbcClass;
  frequency: number;
  recencyDays: number;
  segment: RfmSegment;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  netSales: number;
  grossProfit: number;
  marginPct: number | null;
  quantity: number;
  abc: AbcClass;
  quadrant: ProductQuadrant;
}

export type ProductQuadrant = 'STARS' | 'VOLUME' | 'NICHE' | 'REVIEW';

export const PRODUCT_QUADRANT_META: Record<ProductQuadrant, { label: string; description: string; tone: 'success' | 'info' | 'accent' | 'warning' }> = {
  STARS: { label: 'Estrellas', description: 'Alta venta y alto margen: protégelas del quiebre de stock.', tone: 'success' },
  VOLUME: { label: 'Motores de volumen', description: 'Venden mucho con margen bajo: revisa precio o costo de compra.', tone: 'info' },
  NICHE: { label: 'Joyas de nicho', description: 'Poco volumen pero muy rentables: promociónalas.', tone: 'accent' },
  REVIEW: { label: 'A revisar', description: 'Poca venta y poco margen: candidatas a salir del catálogo.', tone: 'warning' },
};

export interface StagnantRow {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  value: number;
  lastSoldDaysAgo: number | null;
}

export interface Radiography {
  generatedAt: string;
  coverage: { sales: boolean; purchases: boolean; inventory: boolean; receivables: boolean; customers: boolean };
  health: HealthScore;
  kpis: {
    netSales12m: number;
    netSales90d: number;
    growthPct: number | null;
    grossMarginPct90d: number | null;
    receivables: number;
    overdueReceivables: number;
    payables: number;
    inventoryValue: number;
    cycle: CashCycle;
    averageTicket: number | null;
    activeCustomers: number;
  };
  monthly: MonthlyPoint[];
  forecast: ForecastPoint[];
  customers: {
    rows: CustomerRow[];
    segments: Record<RfmSegment, { count: number; monetary: number }>;
    topSharePct: number | null;
    top5SharePct: number | null;
    hhi: number | null;
    abc: Record<AbcClass, { count: number; share: number }>;
    consumerSales: number;
  };
  products: {
    rows: ProductRow[];
    quadrants: Record<ProductQuadrant, number>;
    abc: Record<AbcClass, { count: number; share: number }>;
    negativeMargin: ProductRow[];
    stagnant: StagnantRow[];
    stagnantValue: number;
  };
  tax: {
    obligations: Array<{ id: string; title: string; description: string; dueDate: string; daysLeft: number; kind: string }>;
    vatPeriodLabel: string;
    debitVat: number;
    creditVat: number;
    previousRemanent: number;
    ppm: number;
    estimatedPayment: number;
  };
  insights: Insight[];
  simulatorBaseline: SimulatorBaseline;
}

function monthKey(date: Date): string {
  const { year, month } = santiagoDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'America/Santiago' }).replace('.', '');
}

export async function getRadiography(companyId: string, options: { hasPayroll: boolean }): Promise<Radiography> {
  const now = new Date();
  const todayStart = startOfTodaySantiago(now);
  const currentMonth = startOfMonthSantiago(now);
  const nextMonth = addMonthsSantiago(now, 1);
  const previousMonth = addMonthsSantiago(now, -1);
  const trendStart = addMonthsSantiago(now, -11);
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const priorWindowStart = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);

  const [sales, receivables, payables, purchases, stocks, settings] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', dteType: { in: TAXABLE_SALES_DTE_TYPES }, issueDate: { gte: trendStart, lt: nextMonth } },
      select: {
        dteType: true,
        issueDate: true,
        contactId: true,
        netAmount: true,
        exemptAmount: true,
        ivaAmount: true,
        totalAmount: true,
        items: { select: { productId: true, description: true, sku: true, quantity: true, subtotal: true, unitCostPMP: true } },
      },
    }),
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { in: RECEIVABLE_DTE_TYPES } },
      select: { totalAmount: true, paidAmount: true, dueDate: true, issueDate: true },
    }),
    prisma.purchaseDocument.aggregate({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', documentType: { in: TAXABLE_PURCHASE_DOCUMENT_TYPES }, issueDate: { gte: windowStart } },
      select: { documentType: true, issueDate: true, totalAmount: true, ivaAmount: true },
    }),
    prisma.stock.findMany({
      where: { companyId },
      select: {
        productId: true,
        quantity: true,
        product: { select: { name: true, sku: true, costPricePMP: true, minStock: true, isTrackable: true } },
      },
    }),
    prisma.companySettings.findUnique({ where: { companyId }, select: { ppmRateBasisPoints: true } }),
  ]);

  // ── Series mensuales, ventana de 90 días, ritmo del mes ────────────────────
  const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, index) => {
    const date = addMonthsSantiago(trendStart, index);
    return { key: monthKey(date), label: monthLabel(date), netSales: 0, costOfSales: 0, grossProfit: 0 };
  });
  const monthByKey = new Map(monthly.map((point) => [point.key, point]));

  const todayDay = santiagoDateParts(now).day;
  let netSales90 = 0;
  let netSalesPrior90 = 0;
  let cost90 = 0;
  let gross90 = 0;
  let monthToDate = 0;
  let prevMonthSameDay = 0;
  let netSales12m = 0;
  let cost12m = 0;
  let gross12m = 0;
  const debitVatByMonth = new Map<string, number>();
  const netByMonth = new Map<string, number>();
  let documentCount12m = 0;

  interface CustomerAgg { netSales: number; frequency: number; lastPurchase: Date }
  const customerAgg = new Map<string, CustomerAgg>();
  interface ProductAgg { name: string; sku: string | null; netSales: number; cost: number; quantity: number; lastSold: Date }
  const productAgg = new Map<string, ProductAgg>();

  for (const doc of sales) {
    const sign = signForSalesDteType(doc.dteType);
    const revenue = sign * (doc.netAmount + doc.exemptAmount);
    const cost = sign * doc.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
    const key = monthKey(doc.issueDate);
    const bucket = monthByKey.get(key);
    if (bucket) {
      bucket.netSales += revenue;
      bucket.costOfSales += cost;
      bucket.grossProfit += revenue - cost;
    }
    debitVatByMonth.set(key, (debitVatByMonth.get(key) ?? 0) + sign * doc.ivaAmount);
    // Base del PPM = ventas netas afectas + exentas, igual que el motor F29 (`f29.ts`).
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + sign * (doc.netAmount + doc.exemptAmount));
    netSales12m += revenue;
    cost12m += cost;
    gross12m += sign * doc.totalAmount;
    if (sign > 0) documentCount12m += 1;

    if (doc.issueDate >= windowStart) {
      netSales90 += revenue;
      cost90 += cost;
      gross90 += sign * doc.totalAmount;
    } else if (doc.issueDate >= priorWindowStart) {
      netSalesPrior90 += revenue;
    }
    if (doc.issueDate >= currentMonth) monthToDate += revenue;
    else if (doc.issueDate >= previousMonth && santiagoDateParts(doc.issueDate).day <= todayDay) prevMonthSameDay += revenue;

    const customer = customerAgg.get(doc.contactId) ?? { netSales: 0, frequency: 0, lastPurchase: doc.issueDate };
    customer.netSales += revenue;
    if (sign > 0) customer.frequency += 1;
    if (doc.issueDate > customer.lastPurchase) customer.lastPurchase = doc.issueDate;
    customerAgg.set(doc.contactId, customer);

    for (const item of doc.items) {
      const productKey = item.productId ?? `desc:${item.description}`;
      const agg = productAgg.get(productKey) ?? { name: item.description, sku: item.sku, netSales: 0, cost: 0, quantity: 0, lastSold: doc.issueDate };
      agg.netSales += sign * item.subtotal;
      agg.cost += sign * Math.round(item.quantity * item.unitCostPMP);
      agg.quantity += sign * item.quantity;
      if (doc.issueDate > agg.lastSold) agg.lastSold = doc.issueDate;
      productAgg.set(productKey, agg);
    }
  }

  // ── Proyección ────────────────────────────────────────────────────────────
  // Solo meses COMPLETOS: el mes en curso a medias haría caer la tendencia.
  const completeMonths = monthly.slice(0, -1);
  const firstWithSales = completeMonths.findIndex((point) => point.netSales !== 0);
  const series = firstWithSales === -1 ? [] : completeMonths.slice(firstWithSales).map((point) => point.netSales);
  const projection = projectLinear(series, 3);
  const forecast: ForecastPoint[] = projection.map((point, index) => ({
    label: monthLabel(addMonthsSantiago(now, index + 1)),
    ...point,
  }));

  // ── Cartera ───────────────────────────────────────────────────────────────
  let receivablesTotal = 0;
  let overdueTotal = 0;
  let overdue90 = 0;
  for (const doc of receivables) {
    const balance = doc.totalAmount - doc.paidAmount;
    if (balance <= 0) continue;
    receivablesTotal += balance;
    const due = doc.dueDate ?? doc.issueDate;
    if (due < todayStart) {
      overdueTotal += balance;
      if (todayStart.getTime() - due.getTime() > 90 * DAY_MS) overdue90 += balance;
    }
  }
  const payablesTotal = (payables._sum.totalAmount ?? 0) - (payables._sum.paidAmount ?? 0);

  let purchasesGross90 = 0;
  for (const doc of purchases) {
    if (doc.issueDate >= windowStart) purchasesGross90 += signForPurchaseDocumentType(doc.documentType as PurchaseDocumentType) * doc.totalAmount;
  }

  // ── Inventario ────────────────────────────────────────────────────────────
  let inventoryValue = 0;
  let lowStockCount = 0;
  const stockByProduct = new Map<string, { name: string; sku: string; quantity: number; value: number; minStock: number; trackable: boolean }>();
  for (const stock of stocks) {
    // Stock negativo (permitido con `allowNegativeStock`) no resta valor: es
    // un descuadre a corregir, no un activo negativo.
    const value = stock.quantity > 0 ? Math.round(stock.quantity * stock.product.costPricePMP) : 0;
    inventoryValue += value;
    const current = stockByProduct.get(stock.productId) ?? {
      name: stock.product.name,
      sku: stock.product.sku,
      quantity: 0,
      value: 0,
      minStock: stock.product.minStock,
      trackable: stock.product.isTrackable,
    };
    current.quantity += stock.quantity;
    current.value += value;
    stockByProduct.set(stock.productId, current);
  }
  const stagnant: StagnantRow[] = [];
  for (const [productId, stock] of stockByProduct) {
    if (stock.trackable && stock.minStock > 0 && stock.quantity <= stock.minStock) lowStockCount += 1;
    const sold = productAgg.get(productId);
    if (sold && sold.lastSold >= windowStart) continue;
    if (stock.value <= 0) continue;
    stagnant.push({
      id: productId,
      name: stock.name,
      sku: stock.sku,
      quantity: stock.quantity,
      value: stock.value,
      lastSoldDaysAgo: sold ? Math.floor((now.getTime() - sold.lastSold.getTime()) / DAY_MS) : null,
    });
  }
  stagnant.sort((a, b) => b.value - a.value);
  const stagnantValue = stagnant.reduce((sum, row) => sum + row.value, 0);

  // ── Clientes: concentración, ABC y RFM ────────────────────────────────────
  const contactIds = [...customerAgg.keys()];
  const contacts = contactIds.length
    ? await prisma.contact.findMany({ where: { companyId, id: { in: contactIds } }, select: { id: true, razonSocial: true, rutClean: true } })
    : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  let consumerSales = 0;
  const realCustomers: Array<{ id: string; name: string; value: number; frequency: number; lastPurchase: Date }> = [];
  for (const [id, agg] of customerAgg) {
    const contact = contactById.get(id);
    if (!contact) continue;
    if (contact.rutClean.startsWith(GENERIC_CONSUMER_RUT_PREFIX)) {
      consumerSales += agg.netSales;
      continue;
    }
    if (agg.netSales <= 0 || agg.frequency === 0) continue;
    realCustomers.push({ id, name: contact.razonSocial, value: agg.netSales, frequency: agg.frequency, lastPurchase: agg.lastPurchase });
  }
  const customerTotal = realCustomers.reduce((sum, c) => sum + c.value, 0);
  const customerAbc = classifyAbc(realCustomers);
  const rfm = scoreRfm(
    realCustomers.map((c) => ({ id: c.id, name: c.name, lastPurchase: c.lastPurchase, frequency: c.frequency, monetary: c.value })),
    now
  );
  const rfmById = new Map(rfm.map((r) => [r.id, r]));
  const customerRows: CustomerRow[] = customerAbc.map((c) => {
    const r = rfmById.get(c.id);
    return {
      id: c.id,
      name: c.name,
      netSales: c.value,
      sharePct: c.share * 100,
      abc: c.abc,
      frequency: c.frequency,
      recencyDays: r?.recencyDays ?? 0,
      segment: r?.segment ?? 'NEEDS_ATTENTION',
    };
  });
  const shares = customerRows.map((row) => row.sharePct);
  const topSharePct = customerTotal > 0 && shares.length > 0 ? shares[0] : null;
  const top5SharePct = customerTotal > 0 && shares.length > 0 ? shares.slice(0, 5).reduce((s, v) => s + v, 0) : null;

  // ── Productos: ABC por venta y matriz venta × margen ──────────────────────
  const productList = [...productAgg.entries()]
    .filter(([, agg]) => agg.netSales > 0)
    .map(([id, agg]) => ({
      id,
      name: agg.name,
      sku: agg.sku,
      value: agg.netSales,
      grossProfit: agg.netSales - agg.cost,
      marginPct: agg.netSales === 0 ? null : ((agg.netSales - agg.cost) / agg.netSales) * 100,
      quantity: agg.quantity,
    }));
  const productAbc = classifyAbc(productList);
  const salesMedian = median(productList.map((p) => p.value)) ?? 0;
  const referenceMargin = netSales12m === 0 ? 0 : ((netSales12m - cost12m) / netSales12m) * 100;
  const quadrants: Record<ProductQuadrant, number> = { STARS: 0, VOLUME: 0, NICHE: 0, REVIEW: 0 };
  const productRows: ProductRow[] = productAbc.map((p) => {
    const highSales = p.value >= salesMedian;
    const highMargin = (p.marginPct ?? 0) >= referenceMargin;
    const quadrant: ProductQuadrant = highSales ? (highMargin ? 'STARS' : 'VOLUME') : highMargin ? 'NICHE' : 'REVIEW';
    quadrants[quadrant] += 1;
    return { id: p.id, name: p.name, sku: p.sku, netSales: p.value, grossProfit: p.grossProfit, marginPct: p.marginPct, quantity: p.quantity, abc: p.abc, quadrant };
  });
  const negativeMargin = productRows.filter((p) => p.marginPct !== null && p.marginPct < 0).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));

  // ── Ciclo de caja y salud ─────────────────────────────────────────────────
  const cycle = cashConversionCycle({
    receivables: receivablesTotal,
    payables: payablesTotal,
    inventoryValue,
    salesGross: gross90,
    costOfSales: cost90,
    purchasesGross: purchasesGross90,
    days: WINDOW_DAYS,
  });
  const liquidAssets = receivablesTotal + inventoryValue;
  const quickRatio =
    liquidAssets === 0 && payablesTotal === 0 ? null : payablesTotal <= 0 ? Number.POSITIVE_INFINITY : liquidAssets / payablesTotal;
  const grossMarginPct90d = netSales90 === 0 ? null : ((netSales90 - cost90) / netSales90) * 100;
  const growthPct = netSalesPrior90 > 0 ? percentChange(netSales90, netSalesPrior90) : null;

  const health = computeHealthScore({
    quickRatio,
    grossMarginPct: cost90 > 0 ? grossMarginPct90d : null,
    growthPct,
    overdueReceivablesPct: receivablesTotal > 0 ? (overdueTotal / receivablesTotal) * 100 : null,
    dso: cycle.dso,
    dio: cycle.dio,
    stagnantInventoryPct: inventoryValue > 0 ? (stagnantValue / inventoryValue) * 100 : null,
    topCustomerSharePct: realCustomers.length >= 3 ? topSharePct : null,
    top5CustomerSharePct: realCustomers.length >= 6 ? top5SharePct : null,
  });

  // ── Calendario tributario e IVA del período que vence ─────────────────────
  const obligations = upcomingTaxObligations(now, { hasPayroll: options.hasPayroll, electronicInvoicing: true });
  const f29 = obligations.find((o) => o.id === 'f29');
  const f29DueParts = f29 ? santiagoDateParts(f29.dueDate) : santiagoDateParts(now);
  // El F29 que vence en el mes M declara el período M-1.
  const vatPeriodDate = addMonthsSantiago(new Date(Date.UTC(f29DueParts.year, f29DueParts.month - 1, 15)), -1);
  const vatPeriod = santiagoDateParts(vatPeriodDate);
  const vatKey = `${vatPeriod.year}-${String(vatPeriod.month).padStart(2, '0')}`;
  const debitVat = debitVatByMonth.get(vatKey) ?? 0;
  let creditVat = 0;
  for (const doc of purchases) {
    if (monthKey(doc.issueDate) === vatKey) creditVat += signForPurchaseDocumentType(doc.documentType as PurchaseDocumentType) * doc.ivaAmount;
  }
  const previousPeriod = santiagoDateParts(addMonthsSantiago(vatPeriodDate, -1));
  const previousTaxPeriod = await prisma.taxPeriod.findUnique({
    where: { companyId_year_month: { companyId, year: previousPeriod.year, month: previousPeriod.month } },
    select: { remanentCredit: true },
  });
  const previousRemanent = previousTaxPeriod?.remanentCredit ?? 0;
  const ppm = Math.round(((netByMonth.get(vatKey) ?? 0) * (settings?.ppmRateBasisPoints ?? 0)) / 10000);
  const vatBalance = debitVat - creditVat - previousRemanent;
  const estimatedPayment = Math.max(0, vatBalance) + Math.max(0, ppm);

  const cantLose = rfm.filter((r) => r.segment === 'CANT_LOSE').sort((a, b) => b.monetary - a.monetary);
  const lastFull = completeMonths[completeMonths.length - 1];

  const insights = generateInsights({
    dayOfMonth: todayDay,
    monthToDateNetSales: monthToDate,
    previousMonthSameDayNetSales: prevMonthSameDay,
    negativeMarginProducts: negativeMargin.map((p) => ({ name: p.name, marginPct: p.marginPct ?? 0 })),
    stagnantInventoryValue: stagnantValue,
    stagnantProductCount: stagnant.length,
    overdueReceivables: overdueTotal,
    overdue90Receivables: overdue90,
    totalReceivables: receivablesTotal,
    topCustomer: realCustomers.length >= 3 && customerRows[0] ? { name: customerRows[0].name, sharePct: customerRows[0].sharePct } : null,
    cantLoseCustomers: cantLose.map((r) => ({ name: r.name, monetary: r.monetary })),
    atRiskCustomerCount: rfm.filter((r) => r.segment === 'AT_RISK').length,
    estimatedVatToPay: debitVat === 0 && creditVat === 0 ? null : estimatedPayment,
    vatDueInDays: f29?.daysLeft ?? null,
    forecastNextMonth: forecast[0]?.value ?? null,
    lastFullMonthNetSales: lastFull && lastFull.netSales > 0 ? lastFull.netSales : null,
    lowStockCount,
    cashCycleDays: cycle.ccc,
  });

  return {
    generatedAt: now.toISOString(),
    coverage: {
      sales: sales.length > 0,
      purchases: purchases.length > 0 || payablesTotal > 0,
      inventory: inventoryValue > 0,
      receivables: receivablesTotal > 0,
      customers: realCustomers.length > 0,
    },
    health,
    kpis: {
      netSales12m,
      netSales90d: netSales90,
      growthPct,
      grossMarginPct90d: cost90 > 0 ? grossMarginPct90d : null,
      receivables: receivablesTotal,
      overdueReceivables: overdueTotal,
      payables: payablesTotal,
      inventoryValue,
      cycle,
      averageTicket: safeDivide(netSales12m, documentCount12m),
      activeCustomers: realCustomers.length,
    },
    monthly,
    forecast,
    customers: {
      rows: customerRows.slice(0, 50),
      segments: summarizeRfm(rfm),
      topSharePct,
      top5SharePct,
      hhi: shares.length > 0 ? herfindahl(shares) : null,
      abc: summarizeAbc(customerAbc),
      consumerSales,
    },
    products: {
      rows: productRows.slice(0, 50),
      quadrants,
      abc: summarizeAbc(productAbc),
      negativeMargin: negativeMargin.slice(0, 10),
      stagnant: stagnant.slice(0, 15),
      stagnantValue,
    },
    tax: {
      obligations: obligations.map((o) => ({ ...o, dueDate: o.dueDate.toISOString() })),
      vatPeriodLabel: vatPeriodDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'America/Santiago' }),
      debitVat,
      creditVat,
      previousRemanent,
      ppm,
      estimatedPayment,
    },
    insights,
    simulatorBaseline: {
      netSales: netSales12m,
      costOfSales: cost12m,
      salesGross: gross12m,
      purchasesGross: Math.round((purchasesGross90 * 365) / WINDOW_DAYS),
    },
  };
}
