import { prisma } from '@/lib/prisma';
import type { PriceList, PriceListItem, Product } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { applyPercentAdjustment, type PriceTier } from '../pricing';
import type { PriceListInput, PriceListItemsInput } from '../schema';

/**
 * Listas de precios por empresa. Una lista se asigna a clientes
 * (`Contact.priceListId`) y propone el precio de cada línea en Ventas y en
 * las notas de venta; el precio de la línea siempre se puede corregir a mano.
 */

export type PriceListRow = PriceList & { _count: { items: number; contacts: number } };
export type PriceListDetail = PriceList & {
  items: (PriceListItem & { product: Pick<Product, 'id' | 'sku' | 'name' | 'netPrice'> })[];
  _count: { contacts: number };
};

export async function listPriceLists(companyId: string): Promise<PriceListRow[]> {
  return prisma.priceList.findMany({
    where: { companyId },
    include: { _count: { select: { items: true, contacts: true } } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function getPriceList(companyId: string, id: string): Promise<PriceListDetail | null> {
  return prisma.priceList.findFirst({
    where: { id, companyId },
    include: {
      items: { include: { product: { select: { id: true, sku: true, name: true, netPrice: true } } }, orderBy: [{ product: { name: 'asc' } }, { minQuantity: 'asc' }] },
      _count: { select: { contacts: true } },
    },
  });
}

export async function createPriceList(companyId: string, input: PriceListInput): Promise<PriceList> {
  return prisma.priceList.create({ data: { companyId, name: input.name, description: input.description, isActive: input.isActive } });
}

export async function updatePriceList(companyId: string, id: string, input: PriceListInput): Promise<void> {
  const result = await prisma.priceList.updateMany({
    where: { id, companyId },
    data: { name: input.name, description: input.description ?? null, isActive: input.isActive },
  });
  if (result.count === 0) throw new Error('Lista de precios no encontrada');
}

export async function deletePriceList(companyId: string, id: string): Promise<void> {
  // Clientes y notas de venta que la usaban quedan sin lista (FK SetNull).
  await prisma.$transaction([
    prisma.priceListItem.deleteMany({ where: { companyId, priceListId: id } }),
    prisma.priceList.deleteMany({ where: { id, companyId } }),
  ]);
}

/** Reemplaza todos los precios de la lista por los enviados (edición en tabla). */
export async function setPriceListItems(companyId: string, id: string, rows: PriceListItemsInput): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const list = await tx.priceList.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!list) throw new Error('Lista de precios no encontrada');
    const productIds = [...new Set(rows.map((row) => row.productId))];
    if (productIds.length > 0) {
      const found = await tx.product.count({ where: { companyId, id: { in: productIds } } });
      if (found !== productIds.length) throw new Error('Uno o más productos no pertenecen a esta empresa');
    }
    await tx.priceListItem.deleteMany({ where: { companyId, priceListId: id } });
    if (rows.length > 0) {
      await tx.priceListItem.createMany({
        data: rows.map((row) => ({ companyId, priceListId: id, productId: row.productId, minQuantity: row.minQuantity, netPrice: row.netPrice })),
      });
    }
    return rows.length;
  }, LOCKING_TX_OPTIONS);
}

/**
 * Arma la lista completa (o una categoría) desde el precio base del catálogo
 * con un ajuste porcentual. Pisa solo el precio desde 1 unidad de cada
 * producto afectado; los tramos por volumen que ya existan se conservan.
 */
export async function fillPriceListFromCatalog(companyId: string, id: string, percent: number, categoryId?: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const list = await tx.priceList.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!list) throw new Error('Lista de precios no encontrada');
    const products = await tx.product.findMany({
      where: { companyId, ...(categoryId ? { categoryId } : {}) },
      select: { id: true, netPrice: true },
    });
    for (const product of products) {
      const netPrice = applyPercentAdjustment(product.netPrice, percent);
      await tx.priceListItem.upsert({
        where: { priceListId_productId_minQuantity: { priceListId: id, productId: product.id, minQuantity: 1 } },
        update: { netPrice },
        create: { companyId, priceListId: id, productId: product.id, minQuantity: 1, netPrice },
      });
    }
    return products.length;
  }, LOCKING_TX_OPTIONS);
}

export interface ContactPricing {
  priceListId: string | null;
  priceListName: string | null;
  /** Tramos por producto; productos sin fila usan el precio base. */
  tiers: Record<string, PriceTier[]>;
}

/** Precios que corresponden a un cliente según su lista asignada (activa). */
export async function getContactPricing(companyId: string, contactId: string): Promise<ContactPricing> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId },
    select: { priceList: { select: { id: true, name: true, isActive: true } } },
  });
  const list = contact?.priceList;
  if (!list || !list.isActive) return { priceListId: null, priceListName: null, tiers: {} };
  const items = await prisma.priceListItem.findMany({
    where: { companyId, priceListId: list.id },
    select: { productId: true, minQuantity: true, netPrice: true },
  });
  const tiers: Record<string, PriceTier[]> = {};
  for (const item of items) (tiers[item.productId] ??= []).push({ minQuantity: item.minQuantity, netPrice: item.netPrice });
  return { priceListId: list.id, priceListName: list.name, tiers };
}

export async function assignPriceListToContact(companyId: string, contactId: string, priceListId: string | null): Promise<void> {
  if (priceListId) {
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, companyId }, select: { id: true } });
    if (!list) throw new Error('Lista de precios no encontrada');
  }
  const result = await prisma.contact.updateMany({ where: { id: contactId, companyId }, data: { priceListId } });
  if (result.count === 0) throw new Error('Cliente no encontrado');
}
