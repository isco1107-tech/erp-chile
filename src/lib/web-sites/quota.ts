import { DEFAULT_MAX_WEB_SITES } from './constants';

/**
 * Cupo de sitios de una empresa. Cuentan los sitios que no están archivados:
 * archivar libera un lugar y restaurar lo vuelve a ocupar (por eso restaurar
 * también pasa por el cupo).
 */
export interface SiteQuota {
  used: number;
  max: number;
  remaining: number;
  reached: boolean;
}

export function siteQuota(used: number, max: number | null | undefined): SiteQuota {
  const limit = typeof max === 'number' && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : DEFAULT_MAX_WEB_SITES;
  const count = Math.max(0, used);
  return { used: count, max: limit, remaining: Math.max(0, limit - count), reached: count >= limit };
}

/** Mensaje para quien llegó al tope, con la salida que tiene (archivar, eliminar o pedir más cupo). */
export function quotaReachedMessage(quota: Pick<SiteQuota, 'max'>): string {
  return `Llegaste al máximo de ${quota.max} ${quota.max === 1 ? 'sitio activo' : 'sitios activos'} que incluye tu cuenta. Archiva o elimina alguno, o solicita ampliar el límite.`;
}
