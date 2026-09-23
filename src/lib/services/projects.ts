import { prisma } from '@/lib/prisma';

/**
 * Resumen financiero de un proyecto/evento: presupuesto vs real, cruzando
 * ventas, auspicios, compras y honorarios asociados a su `projectId`. Es una
 * función de lectura pura (no una Server Action) para poder reutilizarse
 * tanto desde `getProjectAction` como, a futuro, desde reportes o dashboards
 * que ya corran dentro de un contexto autenticado.
 */
export interface ProjectFinancialSummary {
  budgetedIncome: number;
  budgetedExpense: number;
  /** SalesDocument.totalAmount (ISSUED) + SponsorshipContract.paidAmount, ambos con projectId. */
  actualIncomeCash: number;
  /** SponsorshipContract.barterValuation de contratos de canje (isBarter true). */
  actualIncomeBarter: number;
  /** PurchaseDocument.totalAmount (ISSUED) + FeeDocument.netToPay (PAID), ambos con projectId. */
  actualExpense: number;
  marginAmount: number;
  marginPercent: number;
  budgetVsActualIncomePercent: number;
  budgetVsActualExpensePercent: number;
}

/**
 * `salesAgg`/`purchaseAgg` de abajo agregan por `SalesDocument.projectId`/
 * `PurchaseDocument.projectId` — campos que SÍ existen en el schema pero que
 * NINGÚN formulario de Ventas ni Compras todavía deja elegir (fase 2,
 * deliberadamente fuera de la primera pasada de estos módulos). Es decir:
 * este código está listo, pero hoy `actualIncomeCash`/`actualExpense`
 * siempre suman 0 de estas dos fuentes — el número real que ve el usuario es
 * solo auspicios cobrados + honorarios pagados. La UI ya lo advierte
 * explícitamente (`projects/[id]/page.tsx`); este comentario es para quien
 * toque este archivo y asuma, por el código, que ya está resuelto. No
 * "arreglar" quitando la agregación — el día que exista el selector de
 * proyecto en esos formularios, esto empieza a sumar solo, sin tocar nada
 * acá.
 */
export async function getProjectFinancialSummary(companyId: string, projectId: string): Promise<ProjectFinancialSummary> {
  const [project, salesAgg, sponsorshipCashAgg, sponsorshipBarterAgg, purchaseAgg, feeAgg] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, companyId }, select: { budgetedIncome: true, budgetedExpense: true } }),
    prisma.salesDocument.aggregate({
      where: { companyId, projectId, status: 'ISSUED' },
      _sum: { totalAmount: true },
    }),
    prisma.sponsorshipContract.aggregate({
      where: { companyId, projectId },
      _sum: { paidAmount: true },
    }),
    prisma.sponsorshipContract.aggregate({
      where: { companyId, projectId, isBarter: true },
      _sum: { barterValuation: true },
    }),
    prisma.purchaseDocument.aggregate({
      where: { companyId, projectId, status: 'ISSUED' },
      _sum: { totalAmount: true },
    }),
    prisma.feeDocument.aggregate({
      where: { companyId, projectId, paymentStatus: 'PAID' },
      _sum: { netToPay: true },
    }),
  ]);

  const budgetedIncome = project?.budgetedIncome ?? 0;
  const budgetedExpense = project?.budgetedExpense ?? 0;

  const actualIncomeCash = (salesAgg._sum.totalAmount ?? 0) + (sponsorshipCashAgg._sum.paidAmount ?? 0);
  const actualIncomeBarter = sponsorshipBarterAgg._sum.barterValuation ?? 0;
  const actualExpense = (purchaseAgg._sum.totalAmount ?? 0) + (feeAgg._sum.netToPay ?? 0);

  const marginAmount = actualIncomeCash - actualExpense;
  const marginPercent = actualIncomeCash === 0 ? 0 : Math.round((marginAmount / actualIncomeCash) * 100);
  const budgetVsActualIncomePercent = budgetedIncome === 0 ? 0 : Math.round((actualIncomeCash / budgetedIncome) * 100);
  const budgetVsActualExpensePercent = budgetedExpense === 0 ? 0 : Math.round((actualExpense / budgetedExpense) * 100);

  return {
    budgetedIncome,
    budgetedExpense,
    actualIncomeCash,
    actualIncomeBarter,
    actualExpense,
    marginAmount,
    marginPercent,
    budgetVsActualIncomePercent,
    budgetVsActualExpensePercent,
  };
}
