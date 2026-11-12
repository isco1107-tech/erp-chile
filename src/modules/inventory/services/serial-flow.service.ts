import { addMonths, serialCountProblem, SERIAL_STATUS_LABELS } from '@/lib/inventory/traceability';
import type { Prisma } from '@prisma/client';

/**
 * Series dentro de las transacciones de otros flujos (recepción, venta, anulación).
 * Todas reciben el `tx` de quien llama: la serie y el movimiento de stock se
 * guardan juntos o no se guarda ninguno. Solo lecturas planas dentro del `tx`.
 */

type Tx = Prisma.TransactionClient;

export class SerialFlowError extends Error {}

/** Da de alta las series de una recepción de mercadería, una por unidad recibida. */
export async function registerReceiptSerialsTx(
  tx: Tx,
  companyId: string,
  userId: string | null,
  params: {
    productId: string;
    productName: string;
    warehouseId: string;
    quantity: number;
    serials: string[];
    goodsReceiptId: string;
    supplierId: string | null;
    lotNumber: string | null;
    reference: string;
  }
): Promise<void> {
  const problem = serialCountProblem(params.quantity, params.serials, params.productName);
  if (problem) throw new SerialFlowError(problem);
  const existing = await tx.productSerial.findMany({
    where: { companyId, productId: params.productId, serial: { in: params.serials } },
    select: { serial: true, status: true },
  });
  if (existing.length > 0) {
    const first = existing[0]!;
    throw new SerialFlowError(`La serie ${first.serial} de «${params.productName}» ya existe (${SERIAL_STATUS_LABELS[first.status].toLowerCase()})`);
  }
  await tx.productSerial.createMany({
    data: params.serials.map((serial) => ({
      companyId,
      productId: params.productId,
      serial,
      status: 'IN_STOCK' as const,
      warehouseId: params.warehouseId,
      lotNumber: params.lotNumber,
      supplierId: params.supplierId,
      goodsReceiptId: params.goodsReceiptId,
      createdById: userId,
    })),
  });
  const created = await tx.productSerial.findMany({
    where: { companyId, productId: params.productId, goodsReceiptId: params.goodsReceiptId, serial: { in: params.serials } },
    select: { id: true },
  });
  await tx.productSerialEvent.createMany({
    data: created.map((row) => ({
      companyId,
      serialId: row.id,
      kind: 'REGISTERED' as const,
      toStatus: 'IN_STOCK' as const,
      warehouseId: params.warehouseId,
      userId,
      reference: params.reference,
    })),
  });
}

/** Al anular una recepción: sus series se borran si siguen en bodega; si alguna ya salió, no se puede anular. */
export async function removeReceiptSerialsTx(tx: Tx, companyId: string, goodsReceiptId: string): Promise<void> {
  const serials = await tx.productSerial.findMany({ where: { companyId, goodsReceiptId }, select: { id: true, serial: true, status: true } });
  const gone = serials.find((serial) => serial.status !== 'IN_STOCK');
  if (gone) throw new SerialFlowError(`No se puede anular: la serie ${gone.serial} ya no está en bodega (${SERIAL_STATUS_LABELS[gone.status].toLowerCase()})`);
  if (serials.length === 0) return;
  await tx.productSerial.deleteMany({ where: { companyId, goodsReceiptId, status: 'IN_STOCK' } });
}

/** Marca como vendidas las series de una línea de venta y fija el fin de su garantía. */
export async function sellSerialsTx(
  tx: Tx,
  companyId: string,
  userId: string | null,
  params: {
    productId: string;
    productName: string;
    warehouseId: string;
    quantity: number;
    serials: string[];
    salesDocumentId: string;
    warrantyMonths: number | null;
    at: Date;
    reference: string;
  }
): Promise<void> {
  const problem = serialCountProblem(params.quantity, params.serials, params.productName);
  if (problem) throw new SerialFlowError(problem);
  const rows = await tx.productSerial.findMany({
    where: { companyId, productId: params.productId, serial: { in: params.serials } },
    select: { id: true, serial: true, status: true, warehouseId: true },
  });
  const bySerial = new Map(rows.map((row) => [row.serial, row]));
  for (const serial of params.serials) {
    const row = bySerial.get(serial);
    if (!row) throw new SerialFlowError(`La serie ${serial} de «${params.productName}» no está registrada. Regístrala en Trazabilidad antes de venderla`);
    if (row.status !== 'IN_STOCK') throw new SerialFlowError(`La serie ${serial} de «${params.productName}» no está disponible (${SERIAL_STATUS_LABELS[row.status].toLowerCase()})`);
    if (row.warehouseId !== params.warehouseId) throw new SerialFlowError(`La serie ${serial} de «${params.productName}» está en otra bodega`);
  }
  const ids = rows.map((row) => row.id);
  const updated = await tx.productSerial.updateMany({
    where: { id: { in: ids }, companyId, status: 'IN_STOCK', warehouseId: params.warehouseId },
    data: {
      status: 'SOLD',
      warehouseId: null,
      soldAt: params.at,
      salesDocumentId: params.salesDocumentId,
      warrantyUntil: params.warrantyMonths ? addMonths(params.at, params.warrantyMonths) : null,
    },
  });
  if (updated.count !== ids.length) throw new SerialFlowError('Alguna serie cambió mientras se emitía el documento. Inténtalo de nuevo');
  await tx.productSerialEvent.createMany({
    data: ids.map((serialId) => ({
      companyId,
      serialId,
      kind: 'SOLD' as const,
      fromStatus: 'IN_STOCK' as const,
      toStatus: 'SOLD' as const,
      warehouseId: params.warehouseId,
      userId,
      reference: params.reference,
    })),
  });
}

/** Al anular un documento de venta: las series que vendió vuelven a la bodega del documento. */
export async function releaseSoldSerialsTx(tx: Tx, companyId: string, userId: string | null, params: { salesDocumentId: string; warehouseId: string; reference: string }): Promise<number> {
  const sold = await tx.productSerial.findMany({ where: { companyId, salesDocumentId: params.salesDocumentId, status: 'SOLD' }, select: { id: true } });
  if (sold.length === 0) return 0;
  const ids = sold.map((row) => row.id);
  await tx.productSerial.updateMany({
    where: { id: { in: ids }, companyId, status: 'SOLD' },
    data: { status: 'IN_STOCK', warehouseId: params.warehouseId, soldAt: null, salesDocumentId: null, warrantyUntil: null },
  });
  await tx.productSerialEvent.createMany({
    data: ids.map((serialId) => ({
      companyId,
      serialId,
      kind: 'REOPENED' as const,
      fromStatus: 'SOLD' as const,
      toStatus: 'IN_STOCK' as const,
      warehouseId: params.warehouseId,
      userId,
      reference: params.reference,
    })),
  });
  return ids.length;
}
