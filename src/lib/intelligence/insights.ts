import { formatCurrency } from '@/lib/chile/tax';
import { percentChange } from './stats';

/**
 * Señales automáticas: reglas explícitas y auditables sobre los números
 * reales de la empresa (no un modelo de caja negra). Cada señal dice qué pasa,
 * por qué importa y a dónde ir a resolverlo.
 */

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  href?: string;
}

export interface InsightInput {
  dayOfMonth: number;
  monthToDateNetSales: number;
  previousMonthSameDayNetSales: number;
  negativeMarginProducts: Array<{ name: string; marginPct: number }>;
  stagnantInventoryValue: number;
  stagnantProductCount: number;
  overdueReceivables: number;
  overdue90Receivables: number;
  totalReceivables: number;
  topCustomer: { name: string; sharePct: number } | null;
  cantLoseCustomers: Array<{ name: string; monetary: number }>;
  atRiskCustomerCount: number;
  estimatedVatToPay: number | null;
  vatDueInDays: number | null;
  forecastNextMonth: number | null;
  lastFullMonthNetSales: number | null;
  lowStockCount: number;
  cashCycleDays: number | null;
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };

export function generateInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // Ritmo del mes contra el mismo punto del mes anterior: comparar el mes en
  // curso contra el mes anterior COMPLETO siempre da una caída falsa.
  if (input.dayOfMonth >= 5 && input.previousMonthSameDayNetSales > 0) {
    const change = percentChange(input.monthToDateNetSales, input.previousMonthSameDayNetSales);
    if (change !== null && change <= -15) {
      insights.push({
        id: 'sales-pace-down',
        severity: change <= -30 ? 'critical' : 'warning',
        title: `Las ventas del mes van ${Math.abs(change).toFixed(0)}% bajo el mes pasado`,
        detail: `Al día ${input.dayOfMonth} llevas ${formatCurrency(input.monthToDateNetSales)} netos contra ${formatCurrency(input.previousMonthSameDayNetSales)} al mismo punto del mes anterior.`,
        href: '/dashboard/sales',
      });
    } else if (change !== null && change >= 15) {
      insights.push({
        id: 'sales-pace-up',
        severity: 'positive',
        title: `Las ventas del mes van ${change.toFixed(0)}% sobre el mes pasado`,
        detail: `Al día ${input.dayOfMonth} llevas ${formatCurrency(input.monthToDateNetSales)} netos. Asegura stock de tus productos A para sostener el ritmo.`,
      });
    }
  }

  if (input.overdue90Receivables > 0) {
    insights.push({
      id: 'overdue-90',
      severity: 'critical',
      title: `${formatCurrency(input.overdue90Receivables)} por cobrar con más de 90 días de atraso`,
      detail: 'Pasados los 90 días la probabilidad de recuperar cae fuerte. Evalúa cobranza prejudicial o protesto.',
      href: '/dashboard/treasury/cxc',
    });
  } else if (input.totalReceivables > 0 && input.overdueReceivables / input.totalReceivables >= 0.25) {
    insights.push({
      id: 'overdue-share',
      severity: 'warning',
      title: `${Math.round((input.overdueReceivables / input.totalReceivables) * 100)}% de tu cartera está vencida`,
      detail: `${formatCurrency(input.overdueReceivables)} ya debieron haberse pagado. Activa recordatorios automáticos de cobranza.`,
      href: '/dashboard/treasury/cxc',
    });
  }

  if (input.cantLoseCustomers.length > 0) {
    const names = input.cantLoseCustomers.slice(0, 3).map((c) => c.name).join(', ');
    const value = input.cantLoseCustomers.reduce((sum, c) => sum + c.monetary, 0);
    insights.push({
      id: 'cant-lose',
      severity: 'critical',
      title: `${input.cantLoseCustomers.length} cliente(s) de alto valor dejaron de comprar`,
      detail: `${names}${input.cantLoseCustomers.length > 3 ? ' y otros' : ''} suman ${formatCurrency(value)} en los últimos 12 meses y no compran hace tiempo.`,
      href: '/dashboard/intelligence#clientes',
    });
  } else if (input.atRiskCustomerCount > 0) {
    insights.push({
      id: 'at-risk',
      severity: 'warning',
      title: `${input.atRiskCustomerCount} cliente(s) frecuentes están en riesgo`,
      detail: 'Compraban seguido y no han vuelto. Un llamado a tiempo es más barato que conseguir un cliente nuevo.',
      href: '/dashboard/intelligence#clientes',
    });
  }

  if (input.negativeMarginProducts.length > 0) {
    const worst = input.negativeMarginProducts[0];
    insights.push({
      id: 'negative-margin',
      severity: 'warning',
      title: `${input.negativeMarginProducts.length} producto(s) se vendieron bajo su costo`,
      detail: `El peor caso es "${worst.name}" con margen de ${worst.marginPct.toFixed(1)}%. Revisa el precio o el costo de compra.`,
      href: '/dashboard/intelligence#productos',
    });
  }

  if (input.stagnantInventoryValue > 0 && input.stagnantProductCount > 0) {
    insights.push({
      id: 'stagnant-inventory',
      severity: input.stagnantInventoryValue >= 5_000_000 ? 'warning' : 'info',
      title: `${formatCurrency(input.stagnantInventoryValue)} inmovilizados en inventario sin rotación`,
      detail: `${input.stagnantProductCount} producto(s) con stock no se han vendido en 90 días. Es caja detenida en bodega.`,
      href: '/dashboard/intelligence#productos',
    });
  }

  if (input.topCustomer && input.topCustomer.sharePct >= 30) {
    insights.push({
      id: 'concentration',
      severity: input.topCustomer.sharePct >= 50 ? 'critical' : 'warning',
      title: `${input.topCustomer.name} concentra el ${input.topCustomer.sharePct.toFixed(0)}% de tus ventas`,
      detail: 'Una dependencia así pone en riesgo el negocio ante un atraso o una pérdida. Diversifica la cartera.',
      href: '/dashboard/intelligence#clientes',
    });
  }

  if (input.estimatedVatToPay !== null && input.estimatedVatToPay > 0 && input.vatDueInDays !== null && input.vatDueInDays <= 10) {
    insights.push({
      id: 'vat-due',
      severity: input.vatDueInDays <= 3 ? 'warning' : 'info',
      title: `IVA estimado a pagar: ${formatCurrency(input.estimatedVatToPay)}`,
      detail: `Vence en ${input.vatDueInDays} día(s). Es una estimación sobre documentos emitidos; confírmala en el F29.`,
      href: '/dashboard/reports/f29',
    });
  }

  if (input.lowStockCount > 0) {
    insights.push({
      id: 'low-stock',
      severity: 'info',
      title: `${input.lowStockCount} producto(s) en o bajo su stock mínimo`,
      detail: 'Reponer a tiempo evita perder ventas de tus productos que más rotan.',
      href: '/dashboard/inventory',
    });
  }

  if (input.forecastNextMonth !== null && input.lastFullMonthNetSales !== null && input.lastFullMonthNetSales > 0) {
    const change = percentChange(input.forecastNextMonth, input.lastFullMonthNetSales);
    if (change !== null && Math.abs(change) >= 10) {
      insights.push({
        id: 'forecast',
        severity: change < 0 ? 'info' : 'positive',
        title: `La tendencia proyecta ${change > 0 ? 'un alza' : 'una baja'} de ${Math.abs(change).toFixed(0)}% el próximo mes`,
        detail: `Proyección estadística de ${formatCurrency(input.forecastNextMonth)} netos según los últimos 12 meses. Úsala para planificar compras y caja.`,
      });
    }
  }

  if (input.cashCycleDays !== null && input.cashCycleDays > 60) {
    insights.push({
      id: 'cash-cycle',
      severity: 'warning',
      title: `Tu caja tarda ${input.cashCycleDays} días en volver`,
      detail: 'Entre que pagas a proveedores y cobras a clientes pasan más de dos meses. Usa el simulador para ver cuánta caja liberas acortándolo.',
      href: '/dashboard/intelligence#simulador',
    });
  }

  return insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
