import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { normalizeLotNumber, parseExpiryDate } from '@/lib/inventory/lots';
import { documentSign } from '@/lib/consignment/settlement';
import { effectiveCommissionBps } from '@/lib/consignment/commission';
import { snapshotForProduct, snapshotsFromReferencedItems, type ConsignmentSnapshot } from '@/lib/consignment/snapshot';
import type { ConsignmentReceiveInput, ConsignmentReturnInput } from '../schema';
import { applyStockIn, applyStockOut } from './stock.service';

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

/**
 * La foto del seller y de su comisión para las líneas de una venta, por producto. Solo hay entrada
 * para los productos en consignación; un producto propio no aparece.
 *
 * - Venta (factura o boleta): el dueño actual del producto y la comisión vigente. Si un producto de
 *   seller no tiene comisión, la venta se rechaza antes de emitirse.
 * - Nota de Crédito: la foto de la línea que se devuelve (`referencedItems`), no la de hoy.
 * - Guías, cotizaciones y notas de débito no son una venta del seller: sin foto.
 *
 * Se llama dentro de la misma transacción que crea el documento.
 */
export async function resolveSaleConsignment(
  tx: Pick<Prisma.TransactionClient, 'product' | 'contact'>,
  companyId: string,
  params: {
    dteType: string;
    productIds: ReadonlyArray<string | null | undefined>;
    /** Líneas del documento que referencia una Nota de Crédito. */
    referencedItems?: ReadonlyArray<{ productId: string | null; consignorId: string | null; consignorCommissionBps: number | null }>;
  }
): Promise<Map<string, ConsignmentSnapshot>> {
  const sign = documentSign(params.dteType);
  if (sign === 0) return new Map();
  if (sign === -1) return snapshotsFromReferencedItems(params.referencedItems ?? []);

  const productIds = [...new Set(params.productIds.filter((id): id is string => Boolean(id)))];
  if (productIds.length === 0) return new Map();
  const products = await tx.product.findMany({
    where: { companyId, id: { in: productIds }, consignorId: { not: null } },
    select: { id: true, name: true, consignorId: true, consignmentCommissionBps: true },
  });
  if (products.length === 0) return new Map();

  const sellerIds = [...new Set(products.map((product) => product.consignorId).filter((id): id is string => id !== null))];
  const sellers = await tx.contact.findMany({
    where: { companyId, id: { in: sellerIds } },
    select: { id: true, consignmentCommissionBps: true },
  });
  const sellerBps = new Map(sellers.map((seller) => [seller.id, seller.consignmentCommissionBps]));

  const snapshots = new Map<string, ConsignmentSnapshot>();
  for (const product of products) {
    if (product.consignorId === null) continue;
    snapshots.set(
      product.id,
      snapshotForProduct({ name: product.name, consignorId: product.consignorId, consignmentCommissionBps: product.consignmentCommissionBps }, sellerBps.get(product.consignorId))
    );
  }
  return snapshots;
}

async function requireConsignedProduct(
  tx: Pick<Prisma.TransactionClient, 'product'>,
  companyId: string,
  productId: string
): Promise<{ id: string; name: string; consignorId: string }> {
  const product = await tx.product.findFirst({ where: { id: productId, companyId }, select: { id: true, name: true, consignorId: true } });
  if (!product) throw new Error('Producto no encontrado');
  if (!product.consignorId) throw new Error(`"${product.name}" no es un producto de seller: asígnale su seller en el catálogo antes de moverlo en consignación`);
  return { id: product.id, name: product.name, consignorId: product.consignorId };
}

/**
 * Entrada de mercadería de un seller. El stock sube pero no hay compra, ni costo, ni asiento: es
 * del seller hasta que se vende. Queda anotada a su nombre en el kardex.
 */
export async function receiveConsignedStock(companyId: string, userId: string, input: ConsignmentReceiveInput) {
  return prisma.$transaction(async (tx) => {
    const product = await requireConsignedProduct(tx, companyId, input.productId);
    const lots = input.lotNumber || input.expiryDate
      ? [{ lotNumber: normalizeLotNumber(input.lotNumber), expiryDate: parseExpiryDate(input.expiryDate), quantity: input.quantity }]
      : undefined;
    return applyStockIn(tx, companyId, {
      productId: product.id,
      warehouseId: input.warehouseId,
      type: 'PURCHASE_IN',
      quantity: input.quantity,
      unitCost: 0,
      consignment: true,
      supplierId: product.consignorId,
      userId,
      reference: input.reference || 'Recepción en consignación',
      notes: input.notes || undefined,
      lots,
    });
  }, LOCKING_TX_OPTIONS);
}

/** Devolución de mercadería al seller: sale de la bodega sin venderse, sin asiento ni liquidación. */
export async function returnConsignedStock(companyId: string, userId: string, input: ConsignmentReturnInput) {
  return prisma.$transaction(async (tx) => {
    const product = await requireConsignedProduct(tx, companyId, input.productId);
    return applyStockOut(tx, companyId, {
      productId: product.id,
      warehouseId: input.warehouseId,
      type: 'ADJUSTMENT_OUT',
      quantity: input.quantity,
      supplierId: product.consignorId,
      userId,
      reference: input.reference || 'Devolución al seller',
      notes: input.notes || undefined,
    });
  }, LOCKING_TX_OPTIONS);
}

export interface ConsignedProductRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minStock: number;
  totalStock: number;
  /** Existencias por bodega, para que no se mezclen cuando hay más de una. */
  byWarehouse: Array<{ warehouse: string; quantity: number }>;
  /** La comisión que regiría hoy en una venta (la del producto o, si no tiene, la del seller). */
  commissionBps: number | null;
}

export interface ConsignedStockGroup {
  consignorId: string;
  name: string;
  rut: string;
  /** Comisión por defecto del seller, en puntos base. */
  commissionBps: number | null;
  totalUnits: number;
  products: ConsignedProductRow[];
}

const roundQty = (value: number) => Math.round(value * 1000) / 1000;

/** Existencias de la mercadería de cada seller (productos activos), por producto y por bodega. */
export async function listConsignedStock(companyId: string): Promise<ConsignedStockGroup[]> {
  const [sellers, products] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, isConsignor: true },
      select: { id: true, razonSocial: true, nombreFantasia: true, rut: true, consignmentCommissionBps: true },
      orderBy: { razonSocial: 'asc' },
      take: 500,
    }),
    prisma.product.findMany({
      where: { companyId, consignorId: { not: null }, isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        minStock: true,
        consignorId: true,
        consignmentCommissionBps: true,
        stocks: { select: { quantity: true, warehouse: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
      take: 3000,
    }),
  ]);

  const sellerBps = new Map(sellers.map((seller) => [seller.id, seller.consignmentCommissionBps]));
  const bySeller = new Map<string, ConsignedProductRow[]>();
  for (const product of products) {
    if (!product.consignorId) continue;
    const totalStock = roundQty(product.stocks.reduce((sum, stock) => sum + stock.quantity, 0));
    const rows = bySeller.get(product.consignorId) ?? [];
    rows.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      minStock: product.minStock,
      totalStock,
      byWarehouse: product.stocks
        .map((stock) => ({ warehouse: stock.warehouse.name, quantity: roundQty(stock.quantity) }))
        .sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'es')),
      commissionBps: effectiveCommissionBps(product.consignmentCommissionBps, sellerBps.get(product.consignorId)),
    });
    bySeller.set(product.consignorId, rows);
  }

  return sellers.map((seller) => {
    const rows = bySeller.get(seller.id) ?? [];
    return {
      consignorId: seller.id,
      name: seller.nombreFantasia?.trim() || seller.razonSocial,
      rut: seller.rut,
      commissionBps: seller.consignmentCommissionBps,
      totalUnits: roundQty(rows.reduce((sum, row) => sum + row.totalStock, 0)),
      products: rows,
    };
  });
}
