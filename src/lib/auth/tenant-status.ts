import type { TenantStatus } from '@prisma/client';

/** Estados de empresa que pueden operar. Fuera de estos, ninguna vía de acceso
 * (sesión, webhook entrante, feed público) debe actuar a nombre de la empresa. */
export const OPERATIONAL_STATUSES: readonly TenantStatus[] = ['ACTIVE', 'TRIAL'];

export function isOperationalTenant(status: TenantStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status);
}
