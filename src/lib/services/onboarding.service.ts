import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Elegibilidad del wizard de onboarding, sin campo nuevo en el schema (ver
 * plan): una empresa "recién creada" es la que todavía no tiene más que la
 * bodega default que `createTenant` ya provisiona, ni productos, ni
 * invitaciones enviadas. Es una heurística, no un estado persistido — una
 * empresa que ya cargó su catálogo o invitó a alguien deja de calificar sola,
 * sin necesitar que nadie la marque "completada".
 */
export interface OnboardingStatus {
  eligible: boolean;
  warehouseCount: number;
  productCount: number;
  invitationCount: number;
}

export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatus> {
  const [warehouseCount, productCount, invitationCount] = await Promise.all([
    prisma.warehouse.count({ where: { companyId } }),
    prisma.product.count({ where: { companyId } }),
    prisma.invitation.count({ where: { companyId } }),
  ]);

  return {
    warehouseCount,
    productCount,
    invitationCount,
    eligible: warehouseCount <= 1 && productCount === 0 && invitationCount === 0,
  };
}
