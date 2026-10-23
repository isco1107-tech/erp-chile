import { prisma } from '@/lib/prisma';

/**
 * Consignación: sellers que ponen productos a la venta sin dejar de ser dueños de la mercadería.
 * Aquí vive lo que los lee y los mueve; el cálculo de lo que se les debe es puro y está en
 * `src/lib/consignment/`.
 */

export interface ConsignorOption {
  id: string;
  name: string;
  /** Comisión por defecto del seller, en puntos base. */
  commissionBps: number | null;
}

/** Sellers de la empresa, para elegir el dueño de un producto. */
export async function listConsignorOptions(companyId: string): Promise<ConsignorOption[]> {
  const sellers = await prisma.contact.findMany({
    where: { companyId, isConsignor: true },
    select: { id: true, razonSocial: true, nombreFantasia: true, consignmentCommissionBps: true },
    orderBy: { razonSocial: 'asc' },
    take: 500,
  });
  return sellers.map((seller) => ({
    id: seller.id,
    name: seller.nombreFantasia?.trim() || seller.razonSocial,
    commissionBps: seller.consignmentCommissionBps,
  }));
}
