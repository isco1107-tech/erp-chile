import { prisma } from '@/lib/prisma';
import { signForSalesDteType, signForPurchaseDocumentType, TAXABLE_SALES_DTE_TYPES, TAXABLE_PURCHASE_DOCUMENT_TYPES } from './document-sign';

export interface F29Result {
  year: number;
  month: number;
  debitVat: number;
  creditVat: number;
  previousRemanent: number;
  remanentCredit: number;
  ppmAmount: number;
  determinedTax: number;
  netSales: number;
  /** Retención de honorarios (2ª categoría) del período. Obligación aparte del IVA/PPM, NO forma parte de `determinedTax`. */
  honorariumRetentionAmount: number;
  /**
   * Impuesto Único de 2ª categoría retenido en las liquidaciones del mes
   * (código 48). Solo de períodos de remuneraciones CERRADOS: un borrador
   * todavía puede recalcularse. Tampoco forma parte de `determinedTax`.
   */
  employeeIncomeTaxAmount: number;
}

function periodBounds(year: number, month: number): { from: Date; to: Date } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Período F29 inválido');
  }
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

export async function calculateAndStoreF29(companyId: string, year: number, month: number): Promise<F29Result> {
  const { from, to } = periodBounds(year, month);
  const previousPeriod = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  const [settings, previous, sales, purchases, feeDocuments, payroll] = await Promise.all([
    prisma.companySettings.findUnique({ where: { companyId } }),
    prisma.taxPeriod.findUnique({ where: { companyId_year_month: { companyId, ...previousPeriod } } }),
    prisma.salesDocument.findMany({
      where: {
        companyId,
        status: 'ISSUED',
        dteType: { in: TAXABLE_SALES_DTE_TYPES },
        issueDate: { gte: from, lt: to },
      },
      select: { dteType: true, netAmount: true, exemptAmount: true, ivaAmount: true },
    }),
    prisma.purchaseDocument.findMany({
      where: {
        companyId,
        status: 'ISSUED',
        documentType: { in: TAXABLE_PURCHASE_DOCUMENT_TYPES },
        issueDate: { gte: from, lt: to },
      },
      select: { documentType: true, ivaAmount: true },
    }),
    // La obligación de retener nace al PAGAR el honorario (Art. 74 N°2 LIR),
    // no al registrar la boleta — por eso el filtro es paymentDate/PAID, no
    // issueDate/ISSUED como en ventas/compras (que sí devengan al emitir).
    prisma.feeDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: 'PAID', paymentDate: { gte: from, lt: to } },
      select: { retentionAmount: true },
    }),
    // El impuesto único se retiene en la liquidación del mes que se paga:
    // período de remuneraciones del mismo año/mes, ya cerrado.
    prisma.payslip.aggregate({
      where: { companyId, period: { year, month, status: 'CLOSED' } },
      _sum: { incomeTax: true },
    }),
  ]);

  const debitVat = sales.reduce((sum, document) => sum + signForSalesDteType(document.dteType) * document.ivaAmount, 0);
  const netSales = sales.reduce(
    (sum, document) => sum + signForSalesDteType(document.dteType) * (document.netAmount + document.exemptAmount),
    0
  );
  const creditVat = purchases.reduce(
    (sum, document) => sum + signForPurchaseDocumentType(document.documentType) * document.ivaAmount,
    0
  );
  const previousRemanent = previous?.remanentCredit ?? 0;
  const taxableBeforePpm = debitVat - creditVat - previousRemanent;
  const remanentCredit = Math.max(0, -taxableBeforePpm);
  const ppmRateBasisPoints = settings?.ppmRateBasisPoints ?? 100;
  const ppmAmount = Math.round((netSales * ppmRateBasisPoints) / 10000);
  const determinedTax = Math.max(0, taxableBeforePpm) + ppmAmount;
  // Obligación de 2ª categoría, separada del IVA/PPM: NO se suma a `determinedTax`.
  const honorariumRetentionAmount = feeDocuments.reduce((sum, d) => sum + d.retentionAmount, 0);
  const employeeIncomeTaxAmount = payroll._sum.incomeTax ?? 0;

  const result: F29Result = {
    year,
    month,
    debitVat,
    creditVat,
    previousRemanent,
    remanentCredit,
    ppmAmount,
    determinedTax,
    netSales,
    honorariumRetentionAmount,
    employeeIncomeTaxAmount,
  };

  const persisted = {
    year,
    month,
    debitVat,
    creditVat,
    previousRemanent,
    remanentCredit,
    ppmAmount,
    determinedTax,
    honorariumRetentionAmount,
    employeeIncomeTaxAmount,
  };

  await prisma.taxPeriod.upsert({
    where: { companyId_year_month: { companyId, year, month } },
    update: persisted,
    create: { companyId, ...persisted },
  });

  return result;
}