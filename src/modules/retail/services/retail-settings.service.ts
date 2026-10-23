import 'server-only';

import { prisma } from '@/lib/prisma';
import { DEFAULT_DEAD_STOCK_SETTINGS, isDeadStockDays, type DeadStockDays } from '@/lib/retail/dead-stock';
import { DEFAULT_REORDER_SETTINGS } from '@/lib/retail/reorder';
import { supplierLeadDaysSchema } from '../schema';

export interface RetailSettingsValues {
  deadStockDays: DeadStockDays;
  deadStockAlerts: boolean;
  reorderLeadDays: number;
  reorderCoverDays: number;
  /** Tiempo de entrega configurado por proveedor (`contactId` → días). */
  supplierLeadDays: Record<string, number>;
}

const DEFAULTS: RetailSettingsValues = { ...DEFAULT_DEAD_STOCK_SETTINGS, ...DEFAULT_REORDER_SETTINGS, supplierLeadDays: {} };

/** Ajustes de Métricas de retail de la empresa; sin fila, los de fábrica. */
export async function getRetailSettings(companyId: string): Promise<RetailSettingsValues> {
  const row = await prisma.retailSettings.findUnique({ where: { companyId } });
  if (!row) return { ...DEFAULTS, supplierLeadDays: {} };
  const leadMap = supplierLeadDaysSchema.safeParse(row.supplierLeadDays ?? {});
  return {
    // Un valor fuera de la lista (editado a mano en la base) cae al de fábrica.
    deadStockDays: isDeadStockDays(row.deadStockDays) ? row.deadStockDays : DEFAULTS.deadStockDays,
    deadStockAlerts: row.deadStockAlerts,
    reorderLeadDays: row.reorderLeadDays > 0 ? row.reorderLeadDays : DEFAULTS.reorderLeadDays,
    reorderCoverDays: row.reorderCoverDays > 0 ? row.reorderCoverDays : DEFAULTS.reorderCoverDays,
    supplierLeadDays: leadMap.success ? leadMap.data : {},
  };
}

export async function saveDeadStockSettings(companyId: string, values: Pick<RetailSettingsValues, 'deadStockDays' | 'deadStockAlerts'>): Promise<void> {
  await prisma.retailSettings.upsert({
    where: { companyId },
    update: { deadStockDays: values.deadStockDays, deadStockAlerts: values.deadStockAlerts },
    create: { companyId, deadStockDays: values.deadStockDays, deadStockAlerts: values.deadStockAlerts },
  });
}

/**
 * Tiempos de entrega de la reposición. Solo se guardan proveedores que sean
 * contactos proveedores DE ESTA empresa: un id ajeno o inventado se descarta.
 */
export async function saveReorderSettings(
  companyId: string,
  values: Pick<RetailSettingsValues, 'reorderLeadDays' | 'reorderCoverDays' | 'supplierLeadDays'>
): Promise<Record<string, number>> {
  const ids = Object.keys(values.supplierLeadDays);
  const owned = ids.length
    ? await prisma.contact.findMany({ where: { companyId, isSupplier: true, id: { in: ids } }, select: { id: true } })
    : [];
  const ownedIds = new Set(owned.map((contact) => contact.id));
  const supplierLeadDays = Object.fromEntries(Object.entries(values.supplierLeadDays).filter(([id]) => ownedIds.has(id)));
  await prisma.retailSettings.upsert({
    where: { companyId },
    update: { reorderLeadDays: values.reorderLeadDays, reorderCoverDays: values.reorderCoverDays, supplierLeadDays },
    create: { companyId, reorderLeadDays: values.reorderLeadDays, reorderCoverDays: values.reorderCoverDays, supplierLeadDays },
  });
  return supplierLeadDays;
}
