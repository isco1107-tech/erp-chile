import 'server-only';

import { prisma } from '@/lib/prisma';
import { can, type AuthContext } from '@/lib/auth/guards';
import { santiagoDateParts, startOfTodaySantiago } from '@/lib/chile/timezone';
import { captureException } from '@/lib/observability';

/**
 * Bandeja de pendientes: lo que alguien de la empresa tiene que hacer HOY, de
 * todos los módulos, en un solo lugar. Cada bloque exige el módulo contratado
 * y el permiso de quien mira (mismo criterio que la pantalla a la que lleva):
 * un vendedor no ve compras por aprobar, y nadie ve módulos no contratados.
 * Solo lee y cuenta; nunca cambia nada.
 */

export type InboxSeverity = 'danger' | 'warning' | 'info';

export interface InboxItem {
  id: string;
  area: string;
  title: string;
  detail: string;
  count: number;
  amount: number | null;
  severity: InboxSeverity;
  href: string;
}

const DAY_MS = 86_400_000;

export async function getInbox(ctx: AuthContext): Promise<InboxItem[]> {
  const companyId = ctx.companyId;
  const f = ctx.features;
  const today = startOfTodaySantiago();
  const inAWeek = new Date(today.getTime() + 7 * DAY_MS);
  const tasks: Array<Promise<InboxItem | null>> = [];
  const add = (condition: boolean, task: () => Promise<InboxItem | null>) => {
    if (condition) tasks.push(task());
  };

  add(f.hasPurchases && can(ctx, 'purchases:approve'), async () => {
    const agg = await prisma.purchaseDocument.aggregate({ where: { companyId, approvalStatus: 'PENDING' }, _count: { _all: true }, _sum: { totalAmount: true } });
    return agg._count._all === 0
      ? null
      : { id: 'purchases-approval', area: 'Compras', title: 'Compras esperando tu aprobación', detail: 'Superaron el monto que requiere aprobación.', count: agg._count._all, amount: agg._sum.totalAmount ?? 0, severity: 'warning', href: '/dashboard/purchases' };
  });

  add(f.hasExpenseReports && can(ctx, 'expenses:approve'), async () => {
    const agg = await prisma.expenseReport.aggregate({ where: { companyId, status: 'SUBMITTED', NOT: { submittedByUserId: ctx.id } }, _count: { _all: true }, _sum: { totalAmount: true } });
    return agg._count._all === 0
      ? null
      : { id: 'expenses-approve', area: 'Rendiciones', title: 'Rendiciones por aprobar', detail: 'Tu equipo espera la revisión de sus gastos.', count: agg._count._all, amount: agg._sum.totalAmount ?? 0, severity: 'warning', href: '/dashboard/expenses' };
  });

  add(f.hasExpenseReports && can(ctx, 'expenses:reimburse'), async () => {
    const agg = await prisma.expenseReport.aggregate({ where: { companyId, status: 'APPROVED' }, _count: { _all: true }, _sum: { totalAmount: true } });
    return agg._count._all === 0
      ? null
      : { id: 'expenses-reimburse', area: 'Rendiciones', title: 'Rendiciones aprobadas por reembolsar', detail: 'Ya fueron aprobadas: falta pagarle a quien rindió.', count: agg._count._all, amount: agg._sum.totalAmount ?? 0, severity: 'info', href: '/dashboard/expenses' };
  });

  add(f.hasPayroll && can(ctx, 'leave:approve'), async () => {
    const count = await prisma.leaveRequest.count({ where: { companyId, status: 'PENDING' } });
    return count === 0 ? null : { id: 'leave', area: 'Personas', title: 'Vacaciones y permisos por aprobar', detail: 'Solicitudes esperando respuesta.', count, amount: null, severity: 'info', href: '/dashboard/hr/leave' };
  });

  add(f.hasPayroll && can(ctx, 'payroll:read'), async () => {
    // Cotizaciones de un mes cerrado sin pago registrado. Vencen el día 13
    // del mes siguiente (Previred); pasado eso generan multas e intereses.
    const periods = await prisma.payrollPeriod.findMany({ where: { companyId, status: 'CLOSED', contributionsPaidAt: null }, select: { id: true, year: true, month: true } });
    if (periods.length === 0) return null;
    const { year, month, day } = santiagoDateParts(new Date());
    const overdue = periods.some((p) => year * 12 + month > p.year * 12 + p.month + 1 || (year * 12 + month === p.year * 12 + p.month + 1 && day > 13));
    return {
      id: 'payroll-contributions',
      area: 'Remuneraciones',
      title: 'Cotizaciones previsionales sin pago registrado',
      detail: overdue ? 'Ya pasó el día 13: revisa si se pagaron en Previred y regístralo.' : 'Se pagan en Previred hasta el día 13 del mes siguiente.',
      count: periods.length,
      amount: null,
      severity: overdue ? 'danger' : 'warning',
      href: periods.length === 1 ? `/dashboard/hr/payroll/${periods[0]!.id}` : '/dashboard/hr/payroll',
    };
  });

  add(f.hasTreasury && can(ctx, 'treasury:read'), async () => {
    const rows = await prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dueDate: { lt: today }, dteType: { notIn: ['COTIZACION', 'GUIA_DESPACHO_52', 'NOTA_CREDITO_61'] } },
      select: { totalAmount: true, paidAmount: true },
    });
    if (rows.length === 0) return null;
    return { id: 'receivables-overdue', area: 'Cobranza', title: 'Facturas vencidas por cobrar', detail: 'Envía recordatorios o links de pago desde Cuentas por Cobrar.', count: rows.length, amount: rows.reduce((s, r) => s + r.totalAmount - r.paidAmount, 0), severity: 'danger', href: '/dashboard/treasury/cxc' };
  });

  add(f.hasTreasury && can(ctx, 'treasury:read'), async () => {
    const rows = await prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dueDate: { lt: inAWeek } },
      select: { totalAmount: true, paidAmount: true, dueDate: true },
    });
    if (rows.length === 0) return null;
    const overdue = rows.some((r) => r.dueDate && r.dueDate < today);
    return { id: 'payables-due', area: 'Pagos', title: 'Facturas de proveedores por pagar esta semana', detail: overdue ? 'Algunas ya vencieron.' : 'Vencen en los próximos 7 días.', count: rows.length, amount: rows.reduce((s, r) => s + r.totalAmount - r.paidAmount, 0), severity: overdue ? 'danger' : 'warning', href: '/dashboard/treasury/cxp' };
  });

  add(f.hasDteBilling && can(ctx, 'sales:write'), async () => {
    const agg = await prisma.salesDocument.aggregate({ where: { companyId, status: 'DRAFT', dteType: { not: 'COTIZACION' } }, _count: { _all: true }, _sum: { totalAmount: true } });
    return agg._count._all === 0
      ? null
      : { id: 'sales-drafts', area: 'Ventas', title: 'Documentos en borrador por emitir', detail: 'Incluye las facturas de contratos recurrentes y de horas trabajadas.', count: agg._count._all, amount: agg._sum.totalAmount ?? 0, severity: 'info', href: '/dashboard/sales' };
  });

  add(f.hasServiceContracts && can(ctx, 'contracts:read'), async () => {
    const failed = await prisma.serviceContract.count({ where: { companyId, status: 'ACTIVE', billings: { some: { status: 'FAILED', createdAt: { gte: new Date(today.getTime() - 45 * DAY_MS) } } } } });
    return failed === 0 ? null : { id: 'contracts-failed', area: 'Contratos', title: 'Contratos con facturación fallida', detail: 'Revisa el motivo (folios, límite de crédito…) y vuelve a facturar.', count: failed, amount: null, severity: 'danger', href: '/dashboard/contracts' };
  });

  add(f.hasBankReconciliation && can(ctx, 'bank:reconcile'), async () => {
    const count = await prisma.bankStatementLine.count({ where: { companyId, status: 'UNMATCHED' } });
    return count === 0 ? null : { id: 'bank-unmatched', area: 'Bancos', title: 'Movimientos de cartola por conciliar', detail: 'Confirma a qué corresponde cada movimiento del banco.', count, amount: null, severity: 'warning', href: '/dashboard/treasury/reconciliation' };
  });

  add(f.hasInstallmentPlans && can(ctx, 'paymentplans:read'), async () => {
    const rows = await prisma.paymentPlanInstallment.findMany({ where: { companyId, paymentStatus: { not: 'PAID' }, dueDate: { lt: today }, paymentPlan: { status: 'ACTIVE' } }, select: { amount: true, paidAmount: true } });
    return rows.length === 0 ? null : { id: 'installments-overdue', area: 'Cuotas', title: 'Cuotas vencidas', detail: 'El recordatorio automático sale cada mañana; puedes compartir el portal de pago.', count: rows.length, amount: rows.reduce((s, r) => s + r.amount - r.paidAmount, 0), severity: 'warning', href: '/dashboard/payment-plans' };
  });

  add(f.hasFeeDocuments && can(ctx, 'fees:read'), async () => {
    const agg = await prisma.feeDocument.aggregate({ where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } }, _count: { _all: true }, _sum: { netToPay: true } });
    return agg._count._all === 0
      ? null
      : { id: 'fees-unpaid', area: 'Honorarios', title: 'Boletas de honorarios por pagar', detail: 'La retención se declara en el F29 del mes en que se pagan.', count: agg._count._all, amount: agg._sum.netToPay ?? 0, severity: 'info', href: '/dashboard/fees' };
  });

  add(f.hasDteBilling && can(ctx, 'dte:manage_caf'), async () => {
    const cafs = await prisma.dteCaf.findMany({ where: { companyId, status: 'ACTIVE' }, select: { dteType: true, rangeTo: true, lastAssignedFolio: true, rangeFrom: true } });
    const remainingByType = new Map<string, number>();
    for (const caf of cafs) {
      const remaining = caf.rangeTo - Math.max(caf.lastAssignedFolio, caf.rangeFrom - 1);
      remainingByType.set(caf.dteType, (remainingByType.get(caf.dteType) ?? 0) + remaining);
    }
    const low = [...remainingByType.entries()].filter(([, remaining]) => remaining < 20);
    return low.length === 0 ? null : { id: 'folios-low', area: 'SII', title: 'Folios por agotarse', detail: 'Pide un nuevo CAF en el SII antes de quedarte sin folios.', count: low.length, amount: null, severity: 'danger', href: '/dashboard/settings/folios' };
  });

  // Un bloque que falla no debe dejar la bandeja entera en blanco: se omite y
  // se reporta.
  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    if (result.status === 'rejected') captureException(result.reason, { module: 'pendientes', companyId });
  }
  const severityRank: Record<InboxSeverity, number> = { danger: 0, warning: 1, info: 2 };
  return settled
    .flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
