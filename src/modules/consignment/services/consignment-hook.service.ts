import type { DteType, Prisma } from '@prisma/client';
import { signForSalesDteType } from '@/lib/chile/document-sign';
import { splitConsignmentSale, summarizeSettlementLines } from '@/lib/consignment/commission';
import { postConsignmentAccrual } from '@/modules/accounting/posting-rules/consignment-posting';
import { CONSIGNMENT_SALE_DTE_TYPES, recordConsignmentSales, type RecordedConsignment } from './consignment.service';

/**
 * Enganche de consignación con la emisión y anulación de documentos de venta.
 * Todo corre DENTRO de la transacción del documento: si algo falla aquí, la
 * venta completa hace rollback (el productor nunca queda sin devengar ni con
 * un devengo de una venta que no existió). Sin el módulo `hasConsignment`
 * activo no se toca nada más que una lectura de la bandera.
 *
 * Modelo A1 (criterio a validar por contador): la venta es de la empresa; el
 * productor le factura su parte (venta neta menos comisión).
 *
 * Decisión de diseño de las reversas (líneas `kind = REVERSAL` con montos con
 * signo y `reversesLineId`; nunca se borra rastro):
 *  - Nota de Crédito (signo -1 según `signForSalesDteType`): por cada ítem con
 *    producto en consignación se crea una línea NEGATIVA con la comisión
 *    CONGELADA de la venta original, nunca la vigente. Si la venta original
 *    está en una liquidación DRAFT, la reversa entra a ese borrador y sus
 *    totales se recalculan; si ya está CONFIRMED/PAID queda pendiente y se
 *    descuenta en la liquidación siguiente (ajuste contra la siguiente).
 *  - Anulación de un documento: contrapartida del neto vigente de cada línea
 *    (la venta más las reversas ya hechas por notas de crédito), con el mismo
 *    criterio de destino. Anular una Nota de Crédito repone lo que descontó.
 *  - Cada cambio se refleja en contabilidad con `postConsignmentAccrual`.
 */

async function hasConsignmentEnabled(tx: Prisma.TransactionClient, companyId: string): Promise<boolean> {
  const features = await tx.companyFeatures.findUnique({ where: { companyId }, select: { hasConsignment: true } });
  return features?.hasConsignment === true;
}

/**
 * Bloquea las liquidaciones indicadas y devuelve las que siguen en borrador.
 * El bloqueo serializa contra `confirmSettlement`: una reversa nunca entra a
 * una liquidación que se está confirmando.
 */
async function lockDraftSettlements(tx: Prisma.TransactionClient, companyId: string, ids: string[]): Promise<Set<string>> {
  const drafts = new Set<string>();
  for (const id of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "ConsignmentSettlement" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    if (rows[0]?.status === 'DRAFT') drafts.add(id);
  }
  return drafts;
}

/** Recalcula los totales de borradores desde sus líneas (fuente de verdad). */
async function refreshDraftTotals(tx: Prisma.TransactionClient, companyId: string, settlementIds: Iterable<string>): Promise<void> {
  for (const settlementId of settlementIds) {
    const lines = await tx.consignmentSettlementLine.findMany({
      where: { companyId, settlementId },
      select: { soldNet: true, commissionAmount: true, producerAmount: true, isExempt: true },
    });
    await tx.consignmentSettlement.updateMany({
      where: { id: settlementId, companyId, status: 'DRAFT' },
      data: summarizeSettlementLines(lines),
    });
  }
}

export interface IssuedDocumentRef {
  id: string;
  dteType: DteType;
  referenceType: DteType | null;
  referenceFolio: number | null;
}

/**
 * Se invoca tras crear un documento de venta EMITIDO, antes del commit.
 * Idempotente: no duplica líneas si se repite para el mismo documento.
 */
export async function applyConsignmentToIssuedDocument(tx: Prisma.TransactionClient, companyId: string, document: IssuedDocumentRef): Promise<void> {
  const isSale = CONSIGNMENT_SALE_DTE_TYPES.includes(document.dteType);
  const isCreditNote = !isSale && signForSalesDteType(document.dteType) === -1;
  if (!isSale && !isCreditNote) return;
  if (!(await hasConsignmentEnabled(tx, companyId))) return;

  if (isSale) {
    const recorded = await recordConsignmentSales(tx, companyId, document.id);
    if (recorded.count > 0) {
      await postConsignmentAccrual(tx, companyId, {
        sourceId: document.id,
        date: new Date(),
        producerAmount: recorded.producerAmount,
        description: `Devengo a productores por venta ${document.dteType} (consignación)`,
      });
    }
    return;
  }
  if (document.referenceType && document.referenceFolio !== null) {
    await reverseConsignmentForCreditNote(tx, companyId, document.id, document.referenceType, document.referenceFolio);
  }
}

export async function reverseConsignmentForCreditNote(
  tx: Prisma.TransactionClient,
  companyId: string,
  creditNoteId: string,
  referenceType: DteType,
  referenceFolio: number
): Promise<RecordedConsignment> {
  const none: RecordedConsignment = { count: 0, producerAmount: 0 };
  const original = await tx.salesDocument.findFirst({
    where: { companyId, dteType: referenceType, folio: referenceFolio, status: 'ISSUED' },
    select: { id: true },
  });
  if (!original) return none;

  const originalLines = await tx.consignmentSettlementLine.findMany({
    where: { companyId, kind: 'SALE', salesDocumentItem: { is: { companyId, documentId: original.id } } },
    select: { id: true, productId: true, producerId: true, commissionBps: true, settlementId: true },
  });
  if (originalLines.length === 0) return none;

  const creditNote = await tx.salesDocument.findFirst({ where: { id: creditNoteId, companyId }, select: { issueDate: true } });
  const creditItems = await tx.salesDocumentItem.findMany({
    where: { companyId, documentId: creditNoteId, productId: { not: null }, subtotal: { gt: 0 } },
    select: { id: true, productId: true, subtotal: true, iva: true, isExempt: true },
  });

  const drafts = await lockDraftSettlements(
    tx,
    companyId,
    originalLines.flatMap((line) => (line.settlementId ? [line.settlementId] : []))
  );

  const data: Prisma.ConsignmentSettlementLineCreateManyInput[] = [];
  const touched = new Set<string>();
  let producerAmount = 0;
  for (const item of creditItems) {
    const origin = originalLines.find((line) => line.productId === item.productId);
    if (!origin || !item.productId) continue;
    // Comisión CONGELADA de la venta original; base NET: la devolución se
    // reparte por el mismo porcentaje y con redondeo simétrico (venta +
    // devolución exacta suman cero).
    const split = splitConsignmentSale(-item.subtotal, origin.commissionBps);
    const settlementId = origin.settlementId && drafts.has(origin.settlementId) ? origin.settlementId : null;
    if (settlementId) touched.add(settlementId);
    producerAmount += split.producerAmount;
    data.push({
      companyId,
      producerId: origin.producerId,
      salesDocumentItemId: item.id,
      kind: 'REVERSAL',
      reversesLineId: origin.id,
      productId: item.productId,
      soldNet: split.soldNet,
      commissionBps: split.commissionBps,
      commissionAmount: split.commissionAmount,
      producerAmount: split.producerAmount,
      isExempt: item.isExempt,
      saleIva: -item.iva,
      documentDate: creditNote?.issueDate ?? new Date(),
      settlementId,
    });
  }
  if (data.length === 0) return none;
  const result = await tx.consignmentSettlementLine.createMany({ data, skipDuplicates: true });
  await refreshDraftTotals(tx, companyId, touched);
  if (result.count > 0) {
    await postConsignmentAccrual(tx, companyId, {
      sourceId: creditNoteId,
      date: new Date(),
      producerAmount,
      description: 'Reversa a productores por nota de crédito (consignación)',
    });
  }
  return { count: result.count, producerAmount };
}

/**
 * Se invoca al anular un documento de venta, dentro de su transacción y solo
 * después de ganar la transición ISSUED -> CANCELLED (eso la hace de una sola
 * pasada por documento). No hace nada si el documento no tenía líneas de
 * consignación.
 */
export async function reverseConsignmentForCancelledDocument(
  tx: Prisma.TransactionClient,
  companyId: string,
  documentId: string
): Promise<RecordedConsignment> {
  const none: RecordedConsignment = { count: 0, producerAmount: 0 };
  if (!(await hasConsignmentEnabled(tx, companyId))) return none;

  const lines = await tx.consignmentSettlementLine.findMany({
    where: { companyId, salesDocumentItem: { is: { companyId, documentId } } },
    select: {
      id: true,
      productId: true,
      producerId: true,
      commissionBps: true,
      soldNet: true,
      commissionAmount: true,
      producerAmount: true,
      isExempt: true,
      saleIva: true,
      settlementId: true,
      reversesLineId: true,
    },
  });
  if (lines.length === 0) return none;

  const saleIds = lines.filter((line) => line.reversesLineId === null).map((line) => line.id);
  const priorReversals = saleIds.length
    ? await tx.consignmentSettlementLine.findMany({
        where: { companyId, reversesLineId: { in: saleIds } },
        select: { reversesLineId: true, soldNet: true, commissionAmount: true, producerAmount: true, saleIva: true },
      })
    : [];

  const drafts = await lockDraftSettlements(
    tx,
    companyId,
    lines.flatMap((line) => (line.settlementId ? [line.settlementId] : []))
  );

  const data: Prisma.ConsignmentSettlementLineCreateManyInput[] = [];
  const touched = new Set<string>();
  let producerAmount = 0;
  const now = new Date();
  for (const line of lines) {
    let soldNet = line.soldNet;
    let commissionAmount = line.commissionAmount;
    let producerPart = line.producerAmount;
    let saleIva = line.saleIva;
    if (line.reversesLineId === null) {
      for (const reversal of priorReversals) {
        if (reversal.reversesLineId !== line.id) continue;
        soldNet += reversal.soldNet;
        commissionAmount += reversal.commissionAmount;
        producerPart += reversal.producerAmount;
        saleIva += reversal.saleIva;
      }
    }
    if (soldNet === 0 && commissionAmount === 0 && producerPart === 0) continue;
    const settlementId = line.settlementId && drafts.has(line.settlementId) ? line.settlementId : null;
    if (settlementId) touched.add(settlementId);
    producerAmount += -producerPart;
    data.push({
      companyId,
      producerId: line.producerId,
      productId: line.productId,
      kind: 'REVERSAL',
      reversesLineId: line.reversesLineId ?? line.id,
      soldNet: -soldNet,
      commissionBps: line.commissionBps,
      commissionAmount: -commissionAmount,
      producerAmount: -producerPart,
      isExempt: line.isExempt,
      saleIva: -saleIva,
      documentDate: now,
      settlementId,
    });
  }
  if (data.length === 0) return none;
  const result = await tx.consignmentSettlementLine.createMany({ data });
  await refreshDraftTotals(tx, companyId, touched);
  await postConsignmentAccrual(tx, companyId, {
    sourceId: documentId,
    date: now,
    producerAmount,
    description: 'Anulación de documento: contrapartida a productores (consignación)',
  });
  return { count: result.count, producerAmount };
}
