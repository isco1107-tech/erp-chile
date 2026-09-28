import { prisma } from '@/lib/prisma';

/**
 * Datos que la pantalla "Modo sin conexión" guarda en el equipo para poder
 * registrar movimientos de stock, compras y recepciones de OC sin red
 * (docs/adr/0002). Solo lo necesario para elegir en los formularios: nunca
 * costos (dependen de `products:costs`) ni datos de contacto de proveedores.
 */

export interface ContingencyWarehouse {
  id: string;
  name: string;
}

export interface ContingencyProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isTrackable: boolean;
  tracksLots: boolean;
}

export interface ContingencySupplier {
  id: string;
  rut: string;
  name: string;
}

export interface ContingencyOrderLine {
  id: string;
  description: string;
  productId: string | null;
  tracksLots: boolean;
  /** Lo que falta recibir según el servidor (pedido − recibido). */
  pending: number;
}

export interface ContingencyOrder {
  id: string;
  folio: number;
  supplierName: string;
  lines: ContingencyOrderLine[];
}

export async function listContingencyWarehouses(companyId: string): Promise<ContingencyWarehouse[]> {
  return prisma.warehouse.findMany({
    where: { companyId },
    select: { id: true, name: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function listContingencyProducts(companyId: string): Promise<ContingencyProduct[]> {
  return prisma.product.findMany({
    where: { companyId },
    select: { id: true, sku: true, name: true, unit: true, isTrackable: true, tracksLots: true },
    orderBy: { name: 'asc' },
  });
}

export async function listContingencySuppliers(companyId: string): Promise<ContingencySupplier[]> {
  const suppliers = await prisma.contact.findMany({
    where: { companyId, isSupplier: true },
    select: { id: true, rut: true, razonSocial: true, nombreFantasia: true },
    orderBy: { razonSocial: 'asc' },
  });
  return suppliers.map((s) => ({ id: s.id, rut: s.rut, name: s.nombreFantasia?.trim() || s.razonSocial }));
}

/** Órdenes enviadas o recibidas en parte, con lo que falta recibir de cada línea. */
export async function listReceivableOrders(companyId: string): Promise<ContingencyOrder[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } },
    select: {
      id: true,
      folio: true,
      contact: { select: { razonSocial: true, nombreFantasia: true } },
      items: {
        where: { companyId },
        select: { id: true, description: true, productId: true, quantity: true, receivedQuantity: true, product: { select: { tracksLots: true } } },
      },
    },
    orderBy: { folio: 'desc' },
  });
  return orders
    .map((order) => ({
      id: order.id,
      folio: order.folio,
      supplierName: order.contact.nombreFantasia?.trim() || order.contact.razonSocial,
      lines: order.items
        .map((item) => ({
          id: item.id,
          description: item.description,
          productId: item.productId,
          tracksLots: item.product?.tracksLots ?? false,
          pending: Math.max(0, item.quantity - item.receivedQuantity),
        }))
        .filter((line) => line.pending > 0),
    }))
    .filter((order) => order.lines.length > 0);
}
