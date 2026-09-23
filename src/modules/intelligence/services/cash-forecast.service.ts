import 'server-only';

import type { DteType, PurchaseDocumentType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TAXABLE_PURCHASE_DOCUMENT_TYPES, TAXABLE_SALES_DTE_TYPES, signForPurchaseDocumentType, signForSalesDteType } from '@/lib/chile/document-sign';
import { addMonthsSantiago, santiagoDateParts, santiagoMidnightUtc, startOfTodaySantiago } from '@/lib/chile/timezone';
import { bucketByWeek, type ForecastFlow, type ForecastFlowKind, type WeeklyForecast } from '@/lib/intelligence/cash-forecast';

/**
 * Compromisos de caja con fecha, de todos los módulos que la empresa use.
 * Cada fuente se consulta solo si su módulo está contratado; ninguna se
 * inventa: si no hay liquidaciones calculadas, no se proyectan sueldos.
 */

const RECEIVABLE_DTE_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56'];
const DTE_SHORT: Partial<Record<DteType, string>> = {
  FACTURA_33: 'Factura',
  FACTURA_EXENTA_34: 'Factura exenta',
  BOLETA_39: 'Boleta',
  BOLETA_EXENTA_41: 'Boleta exenta',
  NOTA_DEBITO_56: 'Nota de débito',
};

export interface CashForecastFeatures {
  hasInstallmentPlans: boolean;
  hasPromissoryNotes: boolean;
  hasPayroll: boolean;
  hasExpenseReports: boolean;
}

export interface SerializedFlow {
  date: string;
  amount: number;
  kind: ForecastFlowKind;
  label: string;
}

export interface CashForecastData {
  startDate: string;
  weeks: Array<{ index: number; start: string; end: string; inflows: number; outflows: number; net: number; byKind: Record<ForecastFlowKind, number> }>;
  overdueInflows: number;
  overdueOutflows: number;
  /** Los compromisos más grandes del horizonte, para explicar cada semana. */
  topFlows: SerializedFlow[];
  notes: string[];
}

function serialize(forecast: WeeklyForecast) {
  return forecast.weeks.map((week) => ({ ...week, start: week.start.toISOString(), end: week.end.toISOString() }));
}

/** IVA + PPM estimado de un mes, sobre documentos emitidos (sin remanentes de meses sin calcular). */
async function estimateMonthlyTax(companyId: string, year: number, month: number, ppmBps: number): Promise<number> {
  const from = santiagoMidnightUtc(year, month, 1);
  const to = addMonthsSantiago(from, 1);
  const [sales, purchases] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', dteType: { in: TAXABLE_SALES_DTE_TYPES }, issueDate: { gte: from, lt: to } },
      select: { dteType: true, ivaAmount: true, netAmount: true },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', documentType: { in: TAXABLE_PURCHASE_DOCUMENT_TYPES }, issueDate: { gte: from, lt: to } },
      select: { documentType: true, ivaAmount: true },
    }),
  ]);
  const debit = sales.reduce((sum, doc) => sum + signForSalesDteType(doc.dteType) * doc.ivaAmount, 0);
  const net = sales.reduce((sum, doc) => sum + signForSalesDteType(doc.dteType) * doc.netAmount, 0);
  const credit = purchases.reduce((sum, doc) => sum + signForPurchaseDocumentType(doc.documentType as PurchaseDocumentType) * doc.ivaAmount, 0);
  return Math.max(0, debit - credit) + Math.max(0, Math.round((net * ppmBps) / 10000));
}

function nextBusinessDayUtc(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  const shifted = new Date(Date.UTC(year, month - 1, day + shift));
  return santiagoMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function lastBusinessDayUtc(year: number, month: number): Date {
  const last = new Date(Date.UTC(year, month, 0));
  const weekday = last.getUTCDay();
  const shift = weekday === 6 ? 1 : weekday === 0 ? 2 : 0;
  const adjusted = new Date(Date.UTC(year, month - 1, last.getUTCDate() - shift));
  return santiagoMidnightUtc(adjusted.getUTCFullYear(), adjusted.getUTCMonth() + 1, adjusted.getUTCDate());
}

export async function getCashForecast(companyId: string, features: CashForecastFeatures): Promise<CashForecastData> {
  const now = new Date();
  const start = startOfTodaySantiago(now);
  const flows: ForecastFlow[] = [];
  const notes: string[] = [];

  const [receivables, payables, settings] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { in: RECEIVABLE_DTE_TYPES } },
      select: { dteType: true, folio: true, totalAmount: true, paidAmount: true, dueDate: true, issueDate: true, contact: { select: { razonSocial: true } } },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
      select: { folio: true, totalAmount: true, paidAmount: true, dueDate: true, issueDate: true, contact: { select: { razonSocial: true } } },
    }),
    prisma.companySettings.findUnique({ where: { companyId }, select: { ppmRateBasisPoints: true } }),
  ]);

  for (const doc of receivables) {
    const amount = doc.totalAmount - doc.paidAmount;
    if (amount <= 0) continue;
    flows.push({
      date: doc.dueDate ?? doc.issueDate,
      amount,
      kind: 'receivable',
      label: `${DTE_SHORT[doc.dteType] ?? 'Documento'} ${doc.folio ?? ''} · ${doc.contact.razonSocial}`.replace(/\s+/g, ' '),
    });
  }
  for (const doc of payables) {
    const amount = doc.totalAmount - doc.paidAmount;
    if (amount <= 0) continue;
    flows.push({ date: doc.dueDate ?? doc.issueDate, amount, kind: 'payable', label: `Factura ${doc.folio ?? ''} · ${doc.contact.razonSocial}`.replace(/\s+/g, ' ') });
  }

  if (features.hasInstallmentPlans) {
    const installments = await prisma.paymentPlanInstallment.findMany({
      where: { companyId, paymentStatus: { not: 'PAID' }, paymentPlan: { status: 'ACTIVE' } },
      select: { dueDate: true, amount: true, paidAmount: true, installmentNumber: true, paymentPlan: { select: { contact: { select: { razonSocial: true } } } } },
    });
    for (const item of installments) {
      const amount = item.amount - item.paidAmount;
      if (amount > 0) flows.push({ date: item.dueDate, amount, kind: 'installment', label: `Cuota ${item.installmentNumber} · ${item.paymentPlan.contact.razonSocial}` });
    }
  }

  if (features.hasPromissoryNotes) {
    const notesDue = await prisma.promissoryNote.findMany({
      where: { companyId, status: 'ACTIVE', paymentStatus: { not: 'PAID' } },
      select: { dueDate: true, amount: true, paidAmount: true, contact: { select: { razonSocial: true } } },
    });
    for (const note of notesDue) {
      const amount = note.amount - note.paidAmount;
      if (amount > 0) flows.push({ date: note.dueDate, amount, kind: 'promissory', label: `Pagaré · ${note.contact.razonSocial}` });
    }
  }

  // F29: el del mes anterior (si todavía no vence) y el del mes en curso.
  const today = santiagoDateParts(now);
  const ppmBps = settings?.ppmRateBasisPoints ?? 0;
  const previous = santiagoDateParts(addMonthsSantiago(now, -1));
  const previousDue = nextBusinessDayUtc(today.year, today.month, 20);
  if (previousDue >= start) {
    const amount = await estimateMonthlyTax(companyId, previous.year, previous.month, ppmBps);
    if (amount > 0) flows.push({ date: previousDue, amount, kind: 'tax', label: 'F29 del mes anterior (estimado)' });
  }
  const next = santiagoDateParts(addMonthsSantiago(now, 1));
  const currentAmount = await estimateMonthlyTax(companyId, today.year, today.month, ppmBps);
  if (currentAmount > 0) {
    flows.push({ date: nextBusinessDayUtc(next.year, next.month, 20), amount: currentAmount, kind: 'tax', label: 'F29 del mes en curso (estimado a la fecha)' });
    notes.push('El F29 del mes en curso se estima con lo emitido hasta hoy: crecerá a medida que emitas más ventas.');
  }

  if (features.hasPayroll) {
    const lastPeriod = await prisma.payrollPeriod.findFirst({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true, payslips: { select: { netPay: true, employerCost: true } } },
    });
    if (lastPeriod && lastPeriod.payslips.length > 0) {
      const netPay = lastPeriod.payslips.reduce((sum, p) => sum + p.netPay, 0);
      // Lo que no es líquido del trabajador (cotizaciones, impuesto retenido y
      // aportes del empleador) sale de la caja igual, pero en otra fecha.
      const contributions = lastPeriod.payslips.reduce((sum, p) => sum + p.employerCost - p.netPay, 0);
      for (let offset = 0; offset < 4; offset += 1) {
        const month = santiagoDateParts(addMonthsSantiago(now, offset));
        flows.push({ date: lastBusinessDayUtc(month.year, month.month), amount: netPay, kind: 'payroll', label: `Sueldos líquidos de ${month.month}/${month.year}` });
        const following = santiagoDateParts(addMonthsSantiago(now, offset + 1));
        flows.push({
          date: nextBusinessDayUtc(following.year, following.month, 13),
          amount: contributions,
          kind: 'payroll',
          label: `Cotizaciones e impuesto único de ${month.month}/${month.year}`,
        });
      }
      notes.push(`Remuneraciones proyectadas con la última nómina calculada (${lastPeriod.month}/${lastPeriod.year}).`);
    } else {
      notes.push('Aún no hay liquidaciones calculadas: los sueldos no están en la proyección.');
    }
  }

  if (features.hasExpenseReports) {
    const approved = await prisma.expenseReport.aggregate({ where: { companyId, status: 'APPROVED' }, _sum: { totalAmount: true } });
    const amount = approved._sum.totalAmount ?? 0;
    if (amount > 0) flows.push({ date: start, amount, kind: 'expense', label: 'Rendiciones aprobadas pendientes de reembolso' });
  }

  const forecast = bucketByWeek(flows, start, 13);
  const horizonEnd = forecast.weeks[forecast.weeks.length - 1].end;
  const topFlows = flows
    .filter((flow) => flow.date >= start && flow.date < horizonEnd)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12)
    .map((flow) => ({ ...flow, date: flow.date.toISOString() }));

  return {
    startDate: start.toISOString(),
    weeks: serialize(forecast),
    overdueInflows: forecast.overdueInflows,
    overdueOutflows: forecast.overdueOutflows,
    topFlows,
    notes,
  };
}
