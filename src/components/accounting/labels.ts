import type { AccountType, JournalSourceType } from '@prisma/client';

export const SOURCE_LABELS: Record<JournalSourceType, string> = {
  SALES_DOCUMENT: 'Venta',
  PURCHASE_DOCUMENT: 'Compra',
  PAYMENT: 'Pago',
  INVENTORY_MOVEMENT: 'Inventario',
  CASH_SHIFT: 'Caja',
  MANUAL: 'Manual',
  OPENING: 'Apertura',
  CLOSING: 'Cierre',
  PAYROLL: 'Remuneraciones',
  FEE_DOCUMENT: 'Honorarios',
  EXPENSE_REPORT: 'Rendición',
};

/** Enlace al documento que originó el asiento, cuando existe una pantalla para verlo. */
export function sourceHref(sourceType: JournalSourceType, sourceId: string | null): string | null {
  if (!sourceId) return null;
  if (sourceType === 'SALES_DOCUMENT') return `/dashboard/sales/${sourceId}`;
  if (sourceType === 'PURCHASE_DOCUMENT') return `/dashboard/purchases/${sourceId}`;
  if (sourceType === 'PAYROLL') return `/dashboard/hr/payroll/${sourceId}`;
  if (sourceType === 'FEE_DOCUMENT') return `/dashboard/fees/${sourceId}`;
  if (sourceType === 'EXPENSE_REPORT') return `/dashboard/expenses`;
  return null;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  REVENUE: 'Ingresos',
  COST: 'Costos',
  EXPENSE: 'Gastos',
};
