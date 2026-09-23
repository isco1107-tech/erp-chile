import 'server-only';

import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { allKnownNavItemIds, sanitizeDisabledNavItems } from '@/lib/navigation/workspace-nav';

/**
 * Configuración del espacio de trabajo de la empresa: qué ítems del menú
 * lateral están apagados. Vive en `CompanySettings` (1:1 con Company).
 *
 * Memoizado por request con `cache()`: el layout, la paleta y la puerta de
 * rutas lo leen en el mismo render y no tiene sentido pegarle tres veces a la
 * base por una lista de strings.
 */
export const getDisabledNavItems = cache(async (companyId: string): Promise<string[]> => {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { disabledNavItems: true },
  });
  return settings?.disabledNavItems ?? [];
});

/**
 * Reemplaza la lista completa. Se sanea contra el registro real de
 * navegación: un id inventado desde el cliente, o un intento de apagar
 * "Inicio"/"Configuración", se descarta en silencio en vez de persistirse.
 */
export async function setDisabledNavItems(companyId: string, requested: readonly string[]): Promise<string[]> {
  const disabledNavItems = sanitizeDisabledNavItems(requested, allKnownNavItemIds());
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { disabledNavItems },
    create: { companyId, disabledNavItems },
  });
  return disabledNavItems;
}
