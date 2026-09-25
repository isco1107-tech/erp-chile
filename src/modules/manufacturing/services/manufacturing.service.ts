import type { Prisma, ProductionOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { estimateOrderCost, findShortages, finishedCost, scaleBom, validateBom, type Shortage } from '@/lib/manufacturing/production';
import { applyStockIn, applyStockOut } from '@/modules/inventory/services/stock.service';
import { createAndPostEntry, resolveMappedAccountId } from '@/modules/accounting/services/journal.service';
import { isLedgerActive } from '@/modules/accounting/posting-rules/shared';
import type { BomInput, CompleteProductionInput, ProductionOrderInput } from '../schema';

/**
 * Producción: recetas (lista de materiales) y órdenes de producción.
 *
 * Completar una orden consume los insumos (salida de kardex al PMP vigente)
 * e ingresa el producto terminado al costo de lo consumido más los costos
 * adicionales de fabricación, todo en una transacción. El traspaso entre
 * insumos y producto no genera asiento (el valor no sale de Existencias);
 * solo los costos adicionales se capitalizan: D Existencias / H Gastos.
 */

export class ManufacturingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManufacturingError';
  }
}

type Tx = Prisma.TransactionClient;

function day(value: string | undefined): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

// ─── Recetas ─────────────────────────────────────────────────────────────────

async function assertBomProducts(tx: Tx, companyId: string, input: BomInput) {
  const problem = validateBom(input.productId, input.components);
  if (problem) throw new ManufacturingError(problem);
  const ids = [input.productId, ...input.components.map((component) => component.productId)];
  const products = await tx.product.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, name: true, isTrackable: true } });
  if (products.length !== new Set(ids).size) throw new ManufacturingError('Uno de los productos no existe en tu catálogo');
  const untracked = products.find((product) => !product.isTrackable);
  if (untracked) throw new ManufacturingError(`${untracked.name} no controla stock: no puede ser parte de una receta`);
}

export async function saveBom(companyId: string, id: string | null, input: BomInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await assertBomProducts(tx, companyId, input);
    const data = { productId: input.productId, name: input.name, outputQuantity: input.outputQuantity, notes: input.notes || null, isActive: input.isActive };
    let bomId: string;
    if (id) {
      const { count } = await tx.billOfMaterials.updateMany({ where: { id, companyId }, data });
      if (count === 0) throw new ManufacturingError('Receta no encontrada');
      await tx.bomComponent.deleteMany({ where: { companyId, bomId: id } });
      bomId = id;
    } else {
      bomId = (await tx.billOfMaterials.create({ data: { companyId, ...data }, select: { id: true } })).id;
    }
    await tx.bomComponent.createMany({
      data: input.components.map((component, position) => ({ companyId, bomId, productId: component.productId, quantity: component.quantity, position })),
    });
    return { id: bomId };
  });
}

export interface BomRow {
  id: string;
  name: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  outputQuantity: number;
  isActive: boolean;
  notes: string | null;
  components: { productId: string; name: string; sku: string; unit: string; quantity: number; pmp: number }[];
  /** Costo unitario estimado con el PMP actual de los insumos. */
  estimatedUnitCost: number;
  orderCount: number;
}

export async function listBoms(companyId: string): Promise<BomRow[]> {
  const boms = await prisma.billOfMaterials.findMany({
    where: { companyId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      components: { orderBy: { position: 'asc' }, include: { product: { select: { name: true, sku: true, unit: true, costPricePMP: true } } } },
      _count: { select: { productionOrders: true } },
    },
  });
  return boms.map((bom) => {
    const components = bom.components.map((component) => ({
      productId: component.productId,
      name: component.product.name,
      sku: component.product.sku,
      unit: component.product.unit,
      quantity: component.quantity,
      pmp: component.product.costPricePMP,
    }));
    const estimate = estimateOrderCost(
      components.map((component) => ({ productId: component.productId, quantity: component.quantity })),
      Object.fromEntries(components.map((component) => [component.productId, component.pmp])),
      0,
      bom.outputQuantity
    );
    return {
      id: bom.id,
      name: bom.name,
      productId: bom.productId,
      productName: bom.product.name,
      productSku: bom.product.sku,
      unit: bom.product.unit,
      outputQuantity: bom.outputQuantity,
      isActive: bom.isActive,
      notes: bom.notes,
      components,
      estimatedUnitCost: estimate.unitCost,
      orderCount: bom._count.productionOrders,
    };
  });
}

export async function deleteBom(companyId: string, id: string): Promise<void> {
  const orders = await prisma.productionOrder.count({ where: { companyId, bomId: id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } });
  if (orders > 0) throw new ManufacturingError('La receta tiene órdenes abiertas: termínalas o anúlalas antes');
  const { count } = await prisma.billOfMaterials.deleteMany({ where: { id, companyId } });
  if (count === 0) throw new ManufacturingError('Receta no encontrada');
}

// ─── Órdenes de producción ───────────────────────────────────────────────────

export async function createProductionOrder(companyId: string, input: ProductionOrderInput): Promise<{ id: string; folio: number }> {
  return prisma.$transaction(async (tx) => {
    const bom = await tx.billOfMaterials.findFirst({ where: { id: input.bomId, companyId }, include: { components: { orderBy: { position: 'asc' } } } });
    if (!bom) throw new ManufacturingError('Receta no encontrada');
    if (!bom.isActive) throw new ManufacturingError('La receta está desactivada');
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
    if (!warehouse) throw new ManufacturingError('Bodega no encontrada');
    const scaled = scaleBom(bom.components, bom.outputQuantity, input.quantity);
    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'PRODUCTION_ORDER' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'PRODUCTION_ORDER', currentFolio: 1 },
    });
    return tx.productionOrder.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        bomId: bom.id,
        productId: bom.productId,
        quantity: input.quantity,
        warehouseId: input.warehouseId,
        plannedDate: day(input.plannedDate),
        notes: input.notes || null,
        components: { create: scaled.map((line, position) => ({ companyId, productId: line.productId, plannedQuantity: line.quantity, position })) },
      },
      select: { id: true, folio: true },
    });
  }, LOCKING_TX_OPTIONS);
}

export interface ProductionOrderRow {
  id: string;
  folio: number;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  status: ProductionOrderStatus;
  plannedDate: Date | null;
  completedAt: Date | null;
  warehouseName: string;
  bomName: string | null;
  totalCost: number | null;
  unitCost: number | null;
}

export async function listProductionOrders(companyId: string, filter: ProductionOrderStatus | 'OPEN' | 'ALL' = 'OPEN'): Promise<ProductionOrderRow[]> {
  const where: Prisma.ProductionOrderWhereInput = { companyId };
  if (filter === 'OPEN') where.status = { in: ['PLANNED', 'IN_PROGRESS'] };
  else if (filter !== 'ALL') where.status = filter;
  const orders = await prisma.productionOrder.findMany({
    where,
    orderBy: { folio: 'desc' },
    take: 200,
    include: { product: { select: { name: true, sku: true, unit: true } }, warehouse: { select: { name: true } }, bom: { select: { name: true } } },
  });
  return orders.map((order) => ({
    id: order.id,
    folio: order.folio,
    productName: order.product.name,
    productSku: order.product.sku,
    unit: order.product.unit,
    quantity: order.quantity,
    status: order.status,
    plannedDate: order.plannedDate,
    completedAt: order.completedAt,
    warehouseName: order.warehouse.name,
    bomName: order.bom?.name ?? null,
    totalCost: order.totalCost,
    unitCost: order.unitCost,
  }));
}

export interface ProductionOrderDetail extends ProductionOrderRow {
  warehouseId: string;
  notes: string | null;
  startedAt: Date | null;
  additionalCost: number;
  additionalCostNote: string | null;
  components: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    unit: string;
    plannedQuantity: number;
    consumedQuantity: number | null;
    totalCost: number | null;
    available: number;
    pmp: number;
  }[];
  shortages: Shortage[];
  estimate: { materials: number; total: number; unitCost: number };
}

export async function getProductionOrder(companyId: string, id: string): Promise<ProductionOrderDetail | null> {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId },
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      warehouse: { select: { name: true } },
      bom: { select: { name: true } },
      components: { orderBy: { position: 'asc' }, include: { product: { select: { name: true, sku: true, unit: true, costPricePMP: true } } } },
    },
  });
  if (!order) return null;
  const productIds = order.components.map((component) => component.productId);
  const stocks = await prisma.stock.findMany({ where: { companyId, warehouseId: order.warehouseId, productId: { in: productIds } }, select: { productId: true, quantity: true } });
  const available: Record<string, number> = {};
  for (const stock of stocks) available[stock.productId] = (available[stock.productId] ?? 0) + stock.quantity;
  const required = order.components.map((component) => ({ productId: component.productId, quantity: component.plannedQuantity }));
  const pmp = Object.fromEntries(order.components.map((component) => [component.productId, component.product.costPricePMP]));

  return {
    id: order.id,
    folio: order.folio,
    productName: order.product.name,
    productSku: order.product.sku,
    unit: order.product.unit,
    quantity: order.quantity,
    status: order.status,
    plannedDate: order.plannedDate,
    completedAt: order.completedAt,
    warehouseName: order.warehouse.name,
    warehouseId: order.warehouseId,
    bomName: order.bom?.name ?? null,
    totalCost: order.totalCost,
    unitCost: order.unitCost,
    notes: order.notes,
    startedAt: order.startedAt,
    additionalCost: order.additionalCost,
    additionalCostNote: order.additionalCostNote,
    components: order.components.map((component) => ({
      id: component.id,
      productId: component.productId,
      name: component.product.name,
      sku: component.product.sku,
      unit: component.product.unit,
      plannedQuantity: component.plannedQuantity,
      consumedQuantity: component.consumedQuantity,
      totalCost: component.totalCost,
      available: available[component.productId] ?? 0,
      pmp: component.product.costPricePMP,
    })),
    shortages: order.status === 'PLANNED' || order.status === 'IN_PROGRESS' ? findShortages(required, available) : [],
    estimate: estimateOrderCost(required, pmp, order.additionalCost, order.quantity),
  };
}

export async function startProductionOrder(companyId: string, id: string): Promise<void> {
  const { count } = await prisma.productionOrder.updateMany({ where: { id, companyId, status: 'PLANNED' }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  if (count === 0) throw new ManufacturingError('Solo se inicia una orden planificada');
}

export async function cancelProductionOrder(companyId: string, id: string): Promise<void> {
  const { count } = await prisma.productionOrder.updateMany({ where: { id, companyId, status: { in: ['PLANNED', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED' } });
  if (count === 0) throw new ManufacturingError('Una orden terminada no se anula');
}

/**
 * Completa la orden: consume los insumos (lo real, o lo planificado si no se
 * informa) y deja el producto terminado a su costo. Falla completa si falta
 * stock de algún insumo (salvo que la empresa permita stock negativo).
 */
export async function completeProductionOrder(
  companyId: string,
  userId: string,
  id: string,
  input: CompleteProductionInput
): Promise<{ totalCost: number; unitCost: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.productionOrder.findFirst({
      where: { id, companyId },
      include: { components: { orderBy: { position: 'asc' }, include: { product: { select: { name: true } } } } },
    });
    if (!order) throw new ManufacturingError('Orden no encontrada');
    if (order.status !== 'PLANNED' && order.status !== 'IN_PROGRESS') throw new ManufacturingError('La orden ya está terminada o anulada');
    const reference = `Orden de producción N° ${order.folio}`;

    let materials = 0;
    for (const component of order.components) {
      const quantity = input.consumed[component.id] ?? component.plannedQuantity;
      let totalCost = 0;
      if (quantity > 0) {
        try {
          const movement = await applyStockOut(tx, companyId, {
            productId: component.productId,
            warehouseId: order.warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity,
            reference,
            notes: 'Consumo de producción',
          });
          totalCost = movement.totalCost;
        } catch (error) {
          // "Stock insuficiente en Bodega X" no dice de qué insumo: se agrega.
          if (error instanceof Error && /Stock insuficiente/.test(error.message)) {
            throw new ManufacturingError(`${component.product.name}: ${error.message}`);
          }
          throw error;
        }
      }
      materials += totalCost;
      await tx.productionOrderComponent.updateMany({ where: { id: component.id, companyId }, data: { consumedQuantity: quantity, totalCost } });
    }

    const cost = finishedCost(materials, input.additionalCost, input.producedQuantity);
    await applyStockIn(tx, companyId, {
      productId: order.productId,
      warehouseId: order.warehouseId,
      type: 'ADJUSTMENT_IN',
      quantity: input.producedQuantity,
      unitCost: cost.unitCost,
      reference,
      notes: 'Producto terminado',
    });

    const now = new Date();
    await tx.productionOrder.updateMany({
      where: { id, companyId },
      data: {
        status: 'COMPLETED',
        quantity: input.producedQuantity,
        startedAt: order.startedAt ?? now,
        completedAt: now,
        completedById: userId,
        additionalCost: Math.round(input.additionalCost),
        additionalCostNote: input.additionalCostNote || null,
        totalCost: cost.total,
        unitCost: cost.unitCost,
      },
    });

    if (input.additionalCost > 0 && (await isLedgerActive(tx, companyId))) {
      const [existencias, gastos] = await Promise.all([resolveMappedAccountId(tx, companyId, 'EXISTENCIAS'), resolveMappedAccountId(tx, companyId, 'GASTOS_OPERACIONALES')]);
      await createAndPostEntry(tx, {
        companyId,
        date: now,
        description: `Costos de fabricación capitalizados · ${reference}`,
        sourceType: 'MANUAL',
        sourceId: `production:${id}`,
        createdByUserId: userId,
        lines: [
          { accountId: existencias, debit: Math.round(input.additionalCost), credit: 0 },
          { accountId: gastos, debit: 0, credit: Math.round(input.additionalCost) },
        ],
      });
    }
    return { totalCost: cost.total, unitCost: cost.unitCost };
  }, LOCKING_TX_OPTIONS);
}
