import 'server-only';

import type { DteType, IndustryType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { getCxCSummary, getCxPSummary, getCashFlow, listReceivables } from '@/modules/treasury/services/treasury.service';
import { getCompanySettings } from '@/lib/services/company.service';
import type { AgentDataScope } from '../constants';

export const INDUSTRY_LABELS: Record<IndustryType, string> = {
  SERVICES: 'Servicios',
  COMMERCE: 'Comercio',
  DISTRIBUTION: 'Distribución',
  RETAIL: 'Retail',
  LIGHT_MANUFACTURING: 'Manufactura liviana',
};

/**
 * Snapshot financiero para el agente CFO. Reutiliza fuentes y fórmulas ya
 * existentes en el resto del sistema en vez de inventar cálculos nuevos:
 *  - Ventas netas del mes / margen PMP / IVA débito: misma lógica que
 *    src/app/(dashboard)/dashboard/page.tsx (signo por tipo de documento —
 *    una Nota de Crédito resta —, ventana de mes calendario en UTC, margen =
 *    ingreso neto+exento menos costo PMP de las líneas). Replicada acá (no
 *    extraída a un helper compartido con ese Server Component) para no
 *    arriesgar una regresión visual en el Dashboard ya en producción; ambos
 *    leen las mismas tablas con la misma fórmula, así que no deberían
 *    desalinearse.
 *  - Cuentas por cobrar y por pagar, y flujo de caja de los últimos 30 días:
 *    `getCxCSummary`/`listReceivables`/`getCxPSummary`/`getCashFlow` de
 *    src/modules/treasury/services/treasury.service.ts, sin duplicar esa
 *    lógica. Se llaman directo al servicio (no a través de su Server Action):
 *    el agente lee datos internos de su propia empresa por cron, no hay un
 *    usuario en sesión cuyo permiso `treasury:read` verificar acá.
 *  - Deliberadamente NO se invoca `calculateAndStoreF29`
 *    (src/lib/chile/f29.ts): esa función persiste un `TaxPeriod` real — es el
 *    cálculo oficial del mes, con dueño propio (el módulo de Tesorería/F29).
 *    Disparar una escritura tributaria como efecto secundario de una
 *    recomendación informativa del CFO virtual sería un acoplamiento
 *    peligroso; este snapshot es de solo lectura.
 */

const SALES_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'];
const SOON_DUE_DAYS = 7;

function documentSign(type: DteType): number {
  return type === 'NOTA_CREDITO_61' ? -1 : 1;
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export interface FinancialSnapshot {
  industryType: IndustryType;
  monthNetSales: number;
  prevMonthNetSales: number;
  monthVat: number;
  monthMarginAmount: number;
  monthMarginPercent: number;
  receivablesTotal: number;
  receivablesOverdue: number;
  receivablesDueSoon: number;
  topDebtors: Array<{ razonSocial: string; balance: number }>;
  /** % de las cuentas por cobrar totales que concentran los principales deudores (top 3). */
  receivablesConcentrationPercent: number;
  payablesTotal: number;
  payablesDueThisWeekCount: number;
  payablesDueThisWeekAmount: number;
  cashFlow30dIncome: number;
  cashFlow30dExpense: number;
  cashFlow30dNet: number;
}

export async function getFinancialSnapshot(companyId: string): Promise<FinancialSnapshot> {
  const now = new Date();
  const currentMonthStart = startOfMonthUtc(now);
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const soonDueEnd = new Date(now.getTime() + SOON_DUE_DAYS * 24 * 60 * 60 * 1000);
  const last30dStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [monthDocuments, cxc, receivables, cxp, cashFlow30d, settings] = await Promise.all([
    prisma.salesDocument.findMany({
      where: {
        companyId,
        status: 'ISSUED',
        dteType: { in: SALES_TYPES },
        issueDate: { gte: prevMonthStart, lt: nextMonthStart },
      },
      include: { items: true },
    }),
    getCxCSummary(companyId),
    listReceivables(companyId),
    getCxPSummary(companyId),
    getCashFlow(companyId, last30dStart, now),
    getCompanySettings(companyId),
  ]);

  let monthNetSales = 0;
  let monthVat = 0;
  let monthRevenue = 0;
  let monthCost = 0;
  let prevMonthNetSales = 0;

  for (const document of monthDocuments) {
    const sign = documentSign(document.dteType);
    const revenue = sign * (document.netAmount + document.exemptAmount);
    const cost = sign * document.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
    if (document.issueDate >= currentMonthStart && document.issueDate < nextMonthStart) {
      monthNetSales += sign * document.netAmount;
      monthVat += sign * document.ivaAmount;
      monthRevenue += revenue;
      monthCost += cost;
    } else {
      prevMonthNetSales += sign * document.netAmount;
    }
  }

  const monthMarginAmount = monthRevenue - monthCost;
  const monthMarginPercent = monthRevenue === 0 ? 0 : (monthMarginAmount / monthRevenue) * 100;

  const receivablesDueSoon = receivables
    .filter((doc) => doc.dueDate && doc.dueDate >= now && doc.dueDate <= soonDueEnd)
    .reduce((sum, doc) => sum + (doc.totalAmount - doc.paidAmount), 0);

  const topDebtors = cxc.topDebtors.slice(0, 3).map((d) => ({ razonSocial: d.razonSocial, balance: d.balance }));
  const topDebtorsBalance = topDebtors.reduce((sum, d) => sum + d.balance, 0);
  const receivablesConcentrationPercent = cxc.totalReceivable === 0 ? 0 : (topDebtorsBalance / cxc.totalReceivable) * 100;

  return {
    industryType: settings.industryType,
    monthNetSales,
    prevMonthNetSales,
    monthVat,
    monthMarginAmount,
    monthMarginPercent,
    receivablesTotal: cxc.totalReceivable,
    receivablesOverdue: cxc.overdueAmount,
    receivablesDueSoon,
    topDebtors,
    receivablesConcentrationPercent,
    payablesTotal: cxp.totalPayable,
    payablesDueThisWeekCount: cxp.dueThisWeekCount,
    payablesDueThisWeekAmount: cxp.dueThisWeekAmount,
    cashFlow30dIncome: cashFlow30d.totalIncome,
    cashFlow30dExpense: cashFlow30d.totalExpense,
    cashFlow30dNet: cashFlow30d.netAmount,
  };
}

/** Texto plano en español para pasarle a Gemini — nunca se le pide al modelo que invente ningún número de esta lista. */
export function formatFinancialSnapshotForPrompt(
  snapshot: FinancialSnapshot,
  scope: Pick<AgentDataScope, 'sales' | 'margins' | 'treasury'> = { sales: true, margins: true, treasury: true }
): string {
  const lines: string[] = [];
  lines.push(`Rubro declarado de la empresa: ${INDUSTRY_LABELS[snapshot.industryType]}`);
  // Solo secciones de módulos activos: sin Tesorería no hay CxC/CxP ni flujo
  // de caja que analizar, y sin costeo PMP el margen no significa nada.
  if (scope.sales) {
    lines.push(`Ventas netas del mes en curso: ${formatCurrency(snapshot.monthNetSales)}`);
    lines.push(`Ventas netas del mes anterior: ${formatCurrency(snapshot.prevMonthNetSales)}`);
    lines.push(`IVA débito del mes: ${formatCurrency(snapshot.monthVat)}`);
  }
  if (scope.margins) {
    lines.push(`Margen PMP del mes: ${formatCurrency(snapshot.monthMarginAmount)} (${snapshot.monthMarginPercent.toFixed(1)}%)`);
  }
  if (!scope.treasury) return lines.join('\n');
  lines.push(`Cuentas por cobrar totales: ${formatCurrency(snapshot.receivablesTotal)}`);
  lines.push(`Cuentas por cobrar vencidas: ${formatCurrency(snapshot.receivablesOverdue)}`);
  lines.push(`Cuentas por cobrar que vencen en los próximos ${SOON_DUE_DAYS} días: ${formatCurrency(snapshot.receivablesDueSoon)}`);
  if (snapshot.topDebtors.length > 0) {
    lines.push(
      `Principales deudores: ${snapshot.topDebtors.map((d) => `${d.razonSocial} (${formatCurrency(d.balance)})`).join(', ')} — concentran el ${snapshot.receivablesConcentrationPercent.toFixed(1)}% de las cuentas por cobrar totales`
    );
  }
  lines.push(`Cuentas por pagar totales: ${formatCurrency(snapshot.payablesTotal)}`);
  lines.push(
    `Cuentas por pagar que vencen en los próximos ${SOON_DUE_DAYS} días: ${snapshot.payablesDueThisWeekCount} documento(s) por ${formatCurrency(snapshot.payablesDueThisWeekAmount)}`
  );
  lines.push(
    `Flujo de caja registrado en Tesorería en los últimos 30 días: ingresos ${formatCurrency(snapshot.cashFlow30dIncome)}, egresos ${formatCurrency(snapshot.cashFlow30dExpense)}, neto ${formatCurrency(snapshot.cashFlow30dNet)}`
  );
  return lines.join('\n');
}
