import 'server-only';

import { prisma } from '@/lib/prisma';
import { DEFAULT_DEAD_STOCK_SETTINGS, isDeadStockDays, type DeadStockDays } from '@/lib/retail/dead-stock';

export interface RetailSettingsValues {
  deadStockDays: DeadStockDays;
  deadStockAlerts: boolean;
}

/** Ajustes de Métricas de retail de la empresa; sin fila, los de fábrica. */
export async function getRetailSettings(companyId: string): Promise<RetailSettingsValues> {
  const row = await prisma.retailSettings.findUnique({ where: { companyId }, select: { deadStockDays: true, deadStockAlerts: true } });
  if (!row) return { ...DEFAULT_DEAD_STOCK_SETTINGS };
  return {
    // Un valor fuera de la lista (editado a mano en la base) cae al de fábrica.
    deadStockDays: isDeadStockDays(row.deadStockDays) ? row.deadStockDays : DEFAULT_DEAD_STOCK_SETTINGS.deadStockDays,
    deadStockAlerts: row.deadStockAlerts,
  };
}

export async function saveDeadStockSettings(companyId: string, values: RetailSettingsValues): Promise<RetailSettingsValues> {
  await prisma.retailSettings.upsert({
    where: { companyId },
    update: { deadStockDays: values.deadStockDays, deadStockAlerts: values.deadStockAlerts },
    create: { companyId, deadStockDays: values.deadStockDays, deadStockAlerts: values.deadStockAlerts },
  });
  return values;
}
