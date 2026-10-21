import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type WarehouseOperation as SavedOperation } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { canonicalJson, operationOutcomeSchema, roundQuantity, warehouseOperationSchema, type OperationOutcome, type WarehouseOperation } from '@/lib/warehouse/contracts';
import { applyStockIn, applyStockOut } from './stock.service';
import { applyGoodsReceipt } from '@/modules/purchases/services/goods-receipt.service';
import { postInventoryAdjustmentEntry } from '@/modules/accounting/posting-rules/inventory-posting';
import { createAuditLog } from '@/lib/auth/audit';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type { LotAllocation } from '@/lib/inventory/lots';

export interface WarehouseActor { companyId: string; id: string; email: string; canReceive: boolean }
export class WarehouseConflict extends Error {}
const hash = (operation: WarehouseOperation) => createHash('sha256').update(canonicalJson(operation)).digest('hex');
const json = (operation: WarehouseOperation): Prisma.InputJsonValue => JSON.parse(JSON.stringify(operation));
const key = (companyId: string, operationId: string) => ({ companyId_operationId: { companyId, operationId } });

export function operationOutcome(row: SavedOperation): OperationOutcome {
  return operationOutcomeSchema.parse({ id: row.operationId, status: row.status, message: row.message, confirmedAt: row.appliedAt?.toISOString() ?? null });
}
async function lockOperation(tx: Prisma.TransactionClient, companyId: string, operationId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${companyId}:${operationId}`}, 0))::text`;
}
function assertSameIntent(row: SavedOperation, operation: WarehouseOperation, userId: string): void {
  if (row.payloadHash !== hash(operation) || row.createdById !== userId) throw new WarehouseConflict('Este identificador ya pertenece a otra operación. Conserva el registro original y vuelve a capturar.');
}
function expectedConflict(error: unknown): error is Error {
  return error instanceof WarehouseConflict || (error instanceof Error && /^(Stock insuficiente|El lote .* ya tiene otro vencimiento|Las existencias del lote|No se puede recibir|Esta orden|Orden de compra no encontrada|Una de las líneas no pertenece|Envíe la orden|Producto no encontrado|Este producto no|Bodega no encontrada|La cantidad de cada lote|La suma de los lotes|La selección de lotes)/.test(error.message));
}
async function validateOperation(tx: Prisma.TransactionClient, companyId: string, operation: WarehouseOperation): Promise<{ pmp: number; stock: number; lotStock: number }> {
  const { productId, warehouseId, lotNumber } = operation;
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} AND "companyId" = ${companyId} FOR UPDATE`;
  const product = await tx.product.findFirst({ where: { companyId, id: productId }, select: { isTrackable: true, tracksLots: true, unit: true, costPricePMP: true } });
  if (!product?.isTrackable) throw new WarehouseConflict('El producto ya no está disponible para movimientos de bodega');
  const warehouse = await tx.warehouse.findFirst({ where: { companyId, id: warehouseId }, select: { id: true } });
  if (!warehouse) throw new WarehouseConflict('La bodega ya no está disponible');
  if (product.tracksLots !== Boolean(lotNumber)) throw new WarehouseConflict(product.tracksLots ? 'Indica el lote físico que estás moviendo' : 'Este producto no tiene seguimiento por lote');
  if (product.unit === 'UN' && !Number.isInteger(operation.quantity)) throw new WarehouseConflict('El producto se registra en unidades enteras');
  if (new Date(operation.capturedAt).getTime() > Date.now() + 300_000) throw new WarehouseConflict('Revisa la fecha y hora del teléfono antes de volver a registrar');
  const stock = await tx.stock.findFirst({ where: { companyId, productId, warehouseId }, select: { quantity: true, updatedAt: true } });
  const lot = lotNumber ? await tx.inventoryLot.findFirst({ where: { companyId, productId, warehouseId, lotNumber }, select: { quantity: true, updatedAt: true, expiryDate: true } }) : null;
  if (lot?.expiryDate && operation.expiryDate && lot.expiryDate.toISOString().slice(0, 10) !== operation.expiryDate) throw new WarehouseConflict('El vencimiento no coincide con el lote registrado. Revisa la etiqueta.');
  if (['OUT', 'TRANSFER'].includes(operation.kind)) {
    // La bodega móvil nunca anticipa stock negativo, aunque otro flujo del ERP lo permita.
    if ((stock?.quantity ?? 0) + 1e-9 < operation.quantity || (product.tracksLots && (lot?.quantity ?? 0) + 1e-9 < operation.quantity)) throw new WarehouseConflict('Las existencias cambiaron y no alcanzan para esta salida. Revisa el producto y lote.');
    if (lot?.expiryDate && lot.expiryDate.toISOString().slice(0, 10) < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) && !(operation.kind === 'OUT' && operation.note === 'Merma o daño')) throw new WarehouseConflict('Este lote está vencido. Elige «Merma o daño» para solicitar un retiro revisado por supervisión.');
  }
  if (operation.kind === 'COUNT') {
    if (!operation.baseline || (product.tracksLots ? (operation.baseline.lotUpdatedAt ?? null) !== (lot?.updatedAt.toISOString() ?? null) : operation.baseline.stockUpdatedAt !== (stock?.updatedAt.toISOString() ?? null))) throw new WarehouseConflict('Hubo movimientos desde la última actualización. Actualiza y vuelve a contar antes de ajustar.');
  }
  return { pmp: product.costPricePMP, stock: stock?.quantity ?? 0, lotStock: lot?.quantity ?? 0 };
}

async function applyOperation(tx: Prisma.TransactionClient, actor: WarehouseActor, operation: WarehouseOperation, approvedUnitCost?: number): Promise<{ movementIds: string[]; receiptId?: string; receiptEvent?: { receiptId: string; folio: number; orderId: string; itemCount: number; fullyReceived: boolean } }> {
  // Recepción: lock de OC antes de producto, igual que el camino existente de Compras.
  if (operation.kind === 'RECEIPT') {
    if (!actor.canReceive) throw new WarehouseConflict('No tienes permiso para recibir órdenes de compra');
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${operation.orderId!} AND "companyId" = ${actor.companyId} FOR UPDATE`;
    const line = await tx.purchaseOrderItem.findFirst({ where: { companyId: actor.companyId, id: operation.orderItemId!, orderId: operation.orderId!, productId: operation.productId }, select: { id: true, unitCost: true } });
    if (!line) throw new WarehouseConflict('El producto no pertenece a la orden seleccionada');
    if (Math.round(operation.quantity * line.unitCost) > 2_147_483_647) throw new WarehouseConflict('El movimiento supera el monto permitido. Divide la recepción en cantidades menores.');
    await validateOperation(tx, actor.companyId, operation);
    const { receipt, fullyReceived } = await applyGoodsReceipt(tx, actor.companyId, { orderId: operation.orderId!, warehouseId: operation.warehouseId, notes: operation.note, items: [{ orderItemId: line.id, quantity: operation.quantity, lotNumber: operation.lotNumber, expiryDate: operation.expiryDate }] });
    return { movementIds: [], receiptId: receipt.id, receiptEvent: { receiptId: receipt.id, folio: receipt.folio, orderId: receipt.orderId, itemCount: receipt.items.length, fullyReceived } };
  }
  const current = await validateOperation(tx, actor.companyId, operation);
  const common = { productId: operation.productId, warehouseId: operation.warehouseId, reference: `Bodega móvil ${operation.id}`, notes: operation.note };
  const quantity = operation.kind === 'COUNT' ? roundQuantity(operation.quantity - (operation.lotNumber ? current.lotStock : current.stock)) : operation.quantity;
  if (operation.kind === 'COUNT' && Math.abs(quantity) < 1e-6) return { movementIds: [] };
  const amount = Math.abs(quantity);
  if (Math.round(amount * (operation.kind === 'IN' ? approvedUnitCost ?? current.pmp : current.pmp)) > 2_147_483_647) throw new WarehouseConflict('El movimiento supera el monto permitido. Regístralo en cantidades menores.');
  const inLots = operation.lotNumber ? [{ lotNumber: operation.lotNumber, expiryDate: operation.expiryDate ? new Date(`${operation.expiryDate}T12:00:00Z`) : null, quantity: amount }] : undefined;
  const outLots = operation.lotNumber ? [{ lotNumber: operation.lotNumber, quantity: amount }] : undefined;
  if (operation.kind === 'IN' || (operation.kind === 'COUNT' && quantity > 0)) {
    const unitCost = operation.kind === 'IN' ? approvedUnitCost ?? current.pmp : current.pmp;
    if (operation.kind === 'IN' && unitCost === 0 && approvedUnitCost === undefined) throw new WarehouseConflict('El producto aún no tiene costo. Supervisión debe confirmar el costo del ingreso.');
    const movement = await applyStockIn(tx, actor.companyId, { ...common, type: 'ADJUSTMENT_IN', quantity: amount, unitCost, lots: inLots });
    await postInventoryAdjustmentEntry(tx, actor.companyId, movement, true, { createdByUserId: actor.id });
    return { movementIds: [movement.id] };
  }
  const out = await applyStockOut(tx, actor.companyId, { ...common, type: operation.kind === 'TRANSFER' ? 'TRANSFER' : 'ADJUSTMENT_OUT', quantity: amount, lots: outLots });
  if (operation.kind === 'TRANSFER') {
    const carried = (out.lotAllocations as LotAllocation[] | null)?.map((lot) => ({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ? new Date(lot.expiryDate) : null, quantity: lot.quantity }));
    const incoming = await applyStockIn(tx, actor.companyId, { ...common, warehouseId: operation.targetWarehouseId!, type: 'TRANSFER', quantity: amount, unitCost: out.unitCost, lots: carried });
    return { movementIds: [out.id, incoming.id] };
  }
  await postInventoryAdjustmentEntry(tx, actor.companyId, out, false, { createdByUserId: actor.id });
  return { movementIds: [out.id] };
}

export async function submitWarehouseOperation(actor: WarehouseActor, operation: WarehouseOperation): Promise<OperationOutcome> {
  let receiptEvent: Awaited<ReturnType<typeof applyOperation>>['receiptEvent'];
  let fresh = false;
  let result: SavedOperation;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockOperation(tx, actor.companyId, operation.id);
      const previous = await tx.warehouseOperation.findUnique({ where: key(actor.companyId, operation.id) });
      if (previous) { assertSameIntent(previous, operation, actor.id); return previous; }
      const review = operation.kind === 'IN' || operation.kind === 'COUNT' || (operation.kind === 'OUT' && operation.note === 'Merma o daño');
      if (review) await validateOperation(tx, actor.companyId, operation);
      const applied = review ? { movementIds: [] } : await applyOperation(tx, actor, operation);
      receiptEvent = 'receiptEvent' in applied ? applied.receiptEvent : undefined;
      fresh = true;
      return tx.warehouseOperation.create({ data: {
        companyId: actor.companyId, operationId: operation.id, deviceId: operation.deviceId, createdById: actor.id,
        payload: json(operation), payloadHash: hash(operation), capturedAt: new Date(operation.capturedAt),
        status: review ? 'REVIEW' : 'APPLIED', message: review ? 'Recibido en Aether; pendiente de aprobación' : 'Confirmado en Aether',
        appliedAt: review ? null : new Date(), movementIds: applied.movementIds, receiptId: 'receiptId' in applied ? applied.receiptId : undefined,
      } });
    }, LOCKING_TX_OPTIONS);
  } catch (error) {
    if (!expectedConflict(error)) throw error;
    result = await prisma.$transaction(async (tx) => {
      await lockOperation(tx, actor.companyId, operation.id);
      const previous = await tx.warehouseOperation.findUnique({ where: key(actor.companyId, operation.id) });
      if (previous) { assertSameIntent(previous, operation, actor.id); return previous; }
      fresh = true;
      return tx.warehouseOperation.create({ data: { companyId: actor.companyId, operationId: operation.id, deviceId: operation.deviceId, createdById: actor.id, payload: json(operation), payloadHash: hash(operation), capturedAt: new Date(operation.capturedAt), status: 'CONFLICT', message: error.message } });
    }, LOCKING_TX_OPTIONS);
  }
  if (fresh) await createAuditLog({ companyId: actor.companyId, userId: actor.id, userEmail: actor.email, action: 'STOCK_ADJUSTMENT', entity: 'WarehouseOperation', entityId: result.id, metadata: { kind: operation.kind, status: result.status, operationId: operation.id } });
  if (fresh && result.status === 'APPLIED' && receiptEvent) void emitWorkflowEvent(actor.companyId, 'GOODS_RECEIPT_CREATED', receiptEvent);
  return operationOutcome(result);
}

export async function reviewWarehouseOperation(actor: WarehouseActor, operationId: string, decision: { decision: 'APPROVE' | 'REJECT'; reason: string; unitCost?: number }): Promise<OperationOutcome> {
  const row = await prisma.$transaction(async (tx) => {
    await lockOperation(tx, actor.companyId, operationId);
    const saved = await tx.warehouseOperation.findFirst({ where: { companyId: actor.companyId, operationId } });
    if (!saved) throw new WarehouseConflict('Registro no encontrado');
    if (!['REVIEW', 'CONFLICT'].includes(saved.status)) throw new WarehouseConflict('Este registro ya fue revisado');
    if (saved.status === 'CONFLICT' && decision.decision === 'APPROVE') throw new WarehouseConflict('Este registro necesita una nueva captura, no se puede aprobar');
    const operation = warehouseOperationSchema.parse(saved.payload);
    if (decision.decision === 'APPROVE' && !(['IN', 'COUNT'].includes(operation.kind) || (operation.kind === 'OUT' && operation.note === 'Merma o daño'))) throw new WarehouseConflict('Este tipo de movimiento no admite aprobación de ajuste');
    const applied = decision.decision === 'APPROVE' ? await applyOperation(tx, actor, operation, decision.unitCost) : { movementIds: [] };
    await tx.warehouseOperation.updateMany({ where: { companyId: actor.companyId, operationId, status: saved.status }, data: {
      status: decision.decision === 'APPROVE' ? 'APPLIED' : 'REJECTED', message: decision.decision === 'APPROVE' ? 'Aprobado y confirmado en Aether' : `No aprobado: ${decision.reason}`,
      reviewedById: actor.id, reviewReason: decision.reason, appliedAt: decision.decision === 'APPROVE' ? new Date() : null, movementIds: applied.movementIds,
    } });
    return tx.warehouseOperation.findFirstOrThrow({ where: { companyId: actor.companyId, operationId } });
  }, LOCKING_TX_OPTIONS);
  await createAuditLog({ companyId: actor.companyId, userId: actor.id, userEmail: actor.email, action: 'STOCK_ADJUSTMENT', entity: 'WarehouseOperation', entityId: row.id, metadata: { decision: decision.decision, operationId } });
  return operationOutcome(row);
}
