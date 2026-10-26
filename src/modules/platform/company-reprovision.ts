import type { Tx } from '@/lib/company-erasure/core';
import { seedChartOfAccounts } from '@/modules/accounting/chart-of-accounts';

/**
 * Lo mínimo que tiene una empresa recién creada y que un reinicio de datos vuelve a dejar:
 * la «Bodega Principal» (igual que `createTenant`) y, si tiene Contabilidad, el plan de cuentas
 * base. La empresa conserva su `CompanySettings`, de donde sale el giro del plan de cuentas.
 *
 * Lo usan el script `scripts/reset-company-data.ts` y la orden `empresa.reiniciar.confirmar`,
 * dentro de la misma transacción del borrado.
 */
export async function reprovisionCompany(tx: Tx, companyId: string): Promise<{ chartOfAccounts: boolean }> {
  await tx.warehouse.create({ data: { companyId, name: 'Bodega Principal', code: 'PRINCIPAL', isDefault: true } });
  const features = await tx.companyFeatures.findUnique({ where: { companyId }, select: { hasAccounting: true } });
  if (!features?.hasAccounting) return { chartOfAccounts: false };
  const settings = await tx.companySettings.findUnique({ where: { companyId }, select: { industryType: true } });
  await seedChartOfAccounts(tx, companyId, settings?.industryType ?? 'COMMERCE');
  return { chartOfAccounts: true };
}
