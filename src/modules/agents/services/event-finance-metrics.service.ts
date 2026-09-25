import 'server-only';

import { prisma } from '@/lib/prisma';
import { getProjectFinancialSummary } from '@/lib/services/projects';
import type { ProjectFinanceInput, ReceivableInput } from '@/lib/events/production-finance';

/**
 * Lecturas para los agentes financieros de la productora de eventos
 * (`roles/event-finance.ts`, `roles/event-collections.ts`). Solo lectura,
 * siempre filtrado por `companyId`, y reutilizando
 * `getProjectFinancialSummary` (la misma cifra que muestra el centro de mando
 * del certamen) en vez de recalcular ingresos y gastos por su cuenta.
 */

/** Tope de certámenes analizados por corrida (los más próximos primero). */
const MAX_PROJECTS = 12;
/** Un certamen terminado hace menos que esto aún se analiza (su cierre financiero). */
const RECENTLY_FINISHED_DAYS = 45;

function contactName(contact: { razonSocial: string; nombreFantasia: string | null }): string {
  return contact.nombreFantasia ?? contact.razonSocial;
}

export async function getEventProjectsFinance(companyId: string, now = new Date()): Promise<ProjectFinanceInput[]> {
  const recentCutoff = new Date(now.getTime() - RECENTLY_FINISHED_DAYS * 86_400_000);
  const projects = await prisma.project.findMany({
    where: {
      companyId,
      OR: [{ status: { in: ['PLANNING', 'IN_PROGRESS'] } }, { status: 'COMPLETED', startDate: { gte: recentCutoff } }],
    },
    select: { id: true, name: true, startDate: true },
    orderBy: { startDate: 'asc' },
    take: MAX_PROJECTS,
  });

  return Promise.all(
    projects.map(async (project) => {
      const where = { companyId, projectId: project.id };
      const [summary, sponsorAgg, overdueDeliverables, installments] = await Promise.all([
        getProjectFinancialSummary(companyId, project.id),
        prisma.sponsorshipContract.aggregate({
          where: { ...where, status: { in: ['CONFIRMED', 'COMPLETED'] } },
          _sum: { cashAmount: true, paidAmount: true },
        }),
        prisma.sponsorshipDeliverable.count({
          where: { companyId, isCompleted: false, dueDate: { lt: now }, contract: { projectId: project.id, status: { not: 'CANCELLED' } } },
        }),
        prisma.paymentPlanInstallment.findMany({
          where: {
            companyId,
            paymentStatus: { not: 'PAID' },
            paymentPlan: { companyId, status: 'ACTIVE', candidate: { projectId: project.id } },
          },
          select: { amount: true, paidAmount: true, dueDate: true },
        }),
      ]);

      let installmentsPending = 0;
      let installmentsOverdue = 0;
      for (const installment of installments) {
        const balance = Math.max(0, installment.amount - installment.paidAmount);
        installmentsPending += balance;
        if (installment.dueDate < now) installmentsOverdue += balance;
      }

      return {
        projectId: project.id,
        name: project.name,
        startDate: project.startDate,
        budgetedIncome: summary.budgetedIncome,
        budgetedExpense: summary.budgetedExpense,
        incomeCash: summary.actualIncomeCash,
        incomeBySource: summary.incomeBySource,
        incomeBarter: summary.actualIncomeBarter,
        expense: summary.actualExpense,
        sponsorCashCommitted: sponsorAgg._sum.cashAmount ?? 0,
        sponsorCashCollected: sponsorAgg._sum.paidAmount ?? 0,
        overdueDeliverables,
        installmentsPending,
        installmentsOverdue,
      };
    })
  );
}

/**
 * Todo lo que la productora tiene por cobrar fuera de la facturación normal:
 * cuotas de candidatas, pagarés y auspicios en efectivo. Un auspicio no tiene
 * vencimiento propio en el modelo: se toma la fecha del evento, que es cuando
 * la marca debería haber pagado.
 */
export async function getEventReceivables(companyId: string): Promise<ReceivableInput[]> {
  const [installments, notes, sponsors] = await Promise.all([
    prisma.paymentPlanInstallment.findMany({
      where: { companyId, paymentStatus: { not: 'PAID' }, paymentPlan: { companyId, status: 'ACTIVE' } },
      select: {
        amount: true,
        paidAmount: true,
        dueDate: true,
        paymentPlan: {
          select: {
            contact: { select: { id: true, razonSocial: true, nombreFantasia: true } },
            candidate: { select: { project: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.promissoryNote.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'PROTESTED'] }, paymentStatus: { not: 'PAID' } },
      select: {
        amount: true,
        paidAmount: true,
        dueDate: true,
        contact: { select: { id: true, razonSocial: true, nombreFantasia: true } },
        candidate: { select: { project: { select: { name: true } } } },
      },
    }),
    prisma.sponsorshipContract.findMany({
      where: { companyId, status: { in: ['CONFIRMED', 'COMPLETED'] }, paymentStatus: { not: 'PAID' }, cashAmount: { gt: 0 } },
      select: {
        cashAmount: true,
        paidAmount: true,
        contact: { select: { id: true, razonSocial: true, nombreFantasia: true } },
        project: { select: { name: true, startDate: true } },
      },
    }),
  ]);

  return [
    ...installments.map((i) => ({
      kind: 'INSTALLMENT' as const,
      debtorId: i.paymentPlan.contact.id,
      debtorName: contactName(i.paymentPlan.contact),
      balance: Math.max(0, i.amount - i.paidAmount),
      dueDate: i.dueDate,
      projectName: i.paymentPlan.candidate?.project.name ?? null,
    })),
    ...notes.map((n) => ({
      kind: 'PROMISSORY_NOTE' as const,
      debtorId: n.contact.id,
      debtorName: contactName(n.contact),
      balance: Math.max(0, n.amount - n.paidAmount),
      dueDate: n.dueDate,
      projectName: n.candidate?.project.name ?? null,
    })),
    ...sponsors.map((s) => ({
      kind: 'SPONSORSHIP' as const,
      debtorId: s.contact.id,
      debtorName: contactName(s.contact),
      balance: Math.max(0, s.cashAmount - s.paidAmount),
      dueDate: s.project.startDate,
      projectName: s.project.name,
    })),
  ];
}
