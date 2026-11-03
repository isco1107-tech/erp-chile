import 'server-only';

import { nextAutoSku } from '@/lib/warehouse-mobile/sku';
import type { TxClient } from './stock.service';

/**
 * Siguiente SKU automático (`PRD-000123`) de la empresa, dentro de la transacción que crea el
 * producto. Lo usan la bodega móvil y la ficha de producto del ERP con el MISMO candado: dos
 * productos nuevos a la vez (uno desde el celular, otro desde el escritorio) no pueden tomar
 * el mismo número.
 */
export async function nextSkuFor(tx: TxClient, companyId: string): Promise<string> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`warehouse-sku:${companyId}`}))::text AS locked`;
  const rows = await tx.product.findMany({ where: { companyId, sku: { startsWith: 'PRD-' } }, orderBy: { sku: 'desc' }, take: 200, select: { sku: true } });
  return nextAutoSku(rows.map((row) => row.sku));
}
