import 'server-only';

import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { findDeadStockMilestones } from './dead-stock.service';
import { getRetailSettings } from './retail-settings.service';

/**
 * Aviso diario de stock muerto (lo llama la alerta operativa): una campanita
 * por empresa con lo que HOY cumplió un hito, y un `DEAD_STOCK_DETECTED` por
 * producto para las automatizaciones. Sin hitos hoy, no avisa nada. Corre
 * fuera de toda transacción y no lanza por un aviso que no salió.
 */
export async function alertDeadStock(companyId: string, now: Date = new Date()): Promise<number> {
  const settings = await getRetailSettings(companyId);
  if (!settings.deadStockAlerts) return 0;
  const milestones = await findDeadStockMilestones(companyId, settings.deadStockDays, now);
  if (milestones.length === 0) return 0;

  for (const item of milestones) {
    void emitWorkflowEvent(companyId, 'DEAD_STOCK_DETECTED', {
      sku: item.sku,
      productName: item.productName,
      warehouseName: item.warehouseName,
      stock: item.stock,
      daysStopped: item.daysStopped,
      neverSold: item.neverSold,
    });
  }

  const names = milestones.slice(0, 3).map((item) => item.productName);
  const more = milestones.length - names.length;
  const onlyWarehouse = new Set(milestones.map((item) => item.warehouseId)).size === 1 ? milestones[0]!.warehouseId : null;
  await notifyCompany(companyId, {
    severity: 'WARNING',
    title: milestones.length === 1 ? 'Un producto sin venderse' : `${milestones.length} productos sin venderse`,
    message: `${names.join(', ')}${more > 0 ? ` y ${more} más` : ''} ${milestones.length === 1 ? 'cumplió' : 'cumplieron'} ${settings.deadStockDays} días o más sin rotar. Revisa la sugerencia de cada uno en Stock muerto.`,
    href: onlyWarehouse ? `/dashboard/retail/stock-muerto?bodega=${onlyWarehouse}` : '/dashboard/retail/stock-muerto',
  });
  return milestones.length;
}
