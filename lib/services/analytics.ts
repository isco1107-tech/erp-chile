import { PrismaClient } from '@prisma/client';
import { get } from 'lodash';

const prisma = new PrismaClient();

interface DashboardMetrics {
  netSales: number;
  grossMargin: number;
  grossMarginPercentage: number;
  accumulatedTax: number;
  totalInventoryValue: number;
  documentsIssued: number;
  averageTicket: number;
  criticalStockAlerts: Array<{ productId: string; productName: string; currentStock: number; minStock: number });
  salesTrend: Array<{ month: string; netSales: number; costOfSales: number });
}

interface SalesBook {
  type: string;
  folioNumber: string;
  issueDate: string;
  recipientRut: string;
  recipientName: string;
  exemptAmount: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
}

interface TaxSummary {
  electronicInvoices: number;
  electronicBills: number;
  creditDebitNotes: number;
  netTaxableBase: number;
  totalVat: number;
  exemptSales: number;
}

export async function getDashboardMetrics(companyId: string, month?: number, year?: number): Promise<DashboardMetrics> {
  // Implementar la lógica para obtener las métricas
  const netSales = await prisma.salesDocument.aggregate({
    where: { companyId, ...(month && { issueDate: { month } }), ...(year && { issueDate: { year } }) },
    _sum: { netAmount: true },
  })._sum.netAmount;

  const grossMargin = await prisma.saleItem.aggregate({
    where: { companyId, ...(month && { saleDocument: { issueDate: { month } } }), ...(year && { saleDocument: { issueDate: { year } } }) },
    _sum: { subtotal: true, quantity: true, unitCostPMP: true },
  })._sum;

  const totalInventoryValue = await prisma.stock.aggregate({
    where: { companyId },
    _sum: { quantity: true, product: { costPricePMP: true } },
  })._sum;

  const documentsIssued = await prisma.salesDocument.count({
    where: { companyId, ...(month && { issueDate: { month } }), ...(year && { issueDate: { year } }) },
  });

  const averageTicket = netSales / documentsIssued;

  const criticalStockAlerts = await prisma.stock.findMany({
    where: { companyId, quantity: { lte: minStock } },
    include: { product: true },
  });

  const salesTrend = await prisma.salesDocument.groupBy({
    by: ['issueDate'],
    _sum: { netAmount: true, saleItems: { unitCostPMP: true, quantity: true } },
    orderBy: { issueDate: 'asc' },
  });

  return {
    netSales: netSales || 0,
    grossMargin: (grossMargin?.subtotal - grossMargin?.quantity * grossMargin?.unitCostPMP) || 0,
    grossMarginPercentage: ((grossMargin?.subtotal - grossMargin?.quantity * grossMargin?.unitCostPMP) / grossMargin?.subtotal) * 100 || 0,
    accumulatedTax: 0, // Implementar la lógica
    totalInventoryValue: totalInventoryValue?.quantity * totalInventoryValue?.product?.costPricePMP || 0,
    documentsIssued: documentsIssued || 0,
    averageTicket: averageTicket || 0,
    criticalStockAlerts: criticalStockAlerts.map(({ product, ...rest }) => ({ ...rest, productName: product.name, minStock: product.minStock })),
    salesTrend: salesTrend.map(({ issueDate, _sum }) => ({ month: issueDate, netSales: _sum.netAmount, costOfSales: _sum.saleItems?.quantity * _sum.saleItems?.unitCostPMP })),
  };
}

export async function getSalesBook(companyId: string, month: number, year: number): Promise<Array<SalesBook>> {
  const sales = await prisma.salesDocument.findMany({
    where: { companyId, issueDate: { month, year } },
    include: { saleItems: true },
  });

  return sales.map(({ type, folioNumber, issueDate, recipientRut, recipientName, exemptAmount, netAmount, vatAmount, totalAmount, status }) => ({
    type,
    folioNumber,
    issueDate,
    recipientRut,
    recipientName,
    exemptAmount,
    netAmount,
    vatAmount,
    totalAmount,
    status,
  }));
}

export async function getTaxSummaryF29(companyId: string, month: number, year: number): Promise<TaxSummary> {
  const electronicInvoices = await prisma.salesDocument.aggregate({
    where: { companyId, type: 'ELECTRONIC_INVOICE', issueDate: { month, year } },
    _sum: { vatAmount: true },
  })._sum.vatAmount;

  const electronicBills = await prisma.salesDocument.aggregate({
    where: { companyId, type: 'ELECTRONIC_BILL', issueDate: { month, year } },
    _sum: { vatAmount: true },
  })._sum.vatAmount;

  const creditDebitNotes = await prisma.salesDocument.aggregate({
    where: { companyId, type: ['CREDIT_NOTE', 'DEBIT_NOTE'], issueDate: { month, year } },
    _sum: { vatAmount: true },
  })._sum.vatAmount;

  const netTaxableBase = (await prisma.salesDocument.aggregate({
    where: { companyId, issueDate: { month, year } },
    _sum: { netAmount: true },
  })._sum.netAmount) || 0;

  const totalVat = (await prisma.salesDocument.aggregate({
    where: { companyId, issueDate: { month, year } },
    _sum: { vatAmount: true },
  })._sum.vatAmount) || 0;

  const exemptSales = (await prisma.salesDocument.aggregate({
    where: { companyId, issueDate: { month, year } },
    _sum: { exemptAmount: true },
  })._sum.exemptAmount) || 0;

  return {
    electronicInvoices: electronicInvoices || 0,
    electronicBills: electronicBills || 0,
    creditDebitNotes: creditDebitNotes || 0,
    netTaxableBase,
    totalVat,
    exemptSales,
  };
}