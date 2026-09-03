import type { PurchaseDocument, PurchaseDocumentItem } from '@prisma/client';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { createAndPostEntry, resolveMappedAccountId, type JournalLineInput, type TxClient } from '../services/journal.service';
import { invertLines, reverseDocumentEntries } from './shared';

/**
 * Reglas de asiento del ciclo de compras (`PROMPT_ERP_V2.md`, Fase C.1).
 *
 * Simplificación deliberada (documentada en `docs/INTEGRACION_CONTABLE.md`):
 * un documento de compra postea contra UNA sola cuenta de destino —
 * `EXISTENCIAS` si alguna línea movió inventario (`PURCHASE_STOCK_DIRECTION`
 * del tipo de documento es `IN`), o `GASTOS_OPERACIONALES` si no. El modelo
 * actual no separa neto por línea entre inventario y gasto dentro del mismo
 * documento; si una empresa necesita esa granularidad, se resuelve más
 * adelante con líneas contables por ítem, no en esta fase.
 *
 * La recepción de mercadería (`createGoodsReceipt`) NO postea: solo mueve
 * stock/PMP. El hecho contable de la compra nace cuando la Factura que la
 * formaliza se emite — igual criterio que ya usa el código para no duplicar
 * el movimiento de stock entre Recepción y Factura referenciada a una OC.
 */

export function buildPurchaseExpenseLines(input: {
  totalAmount: number;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  creditAccountId: string;
  debitAccountId: string;
  ivaCreditoAccountId: string | null;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [{ accountId: input.creditAccountId, debit: 0, credit: input.totalAmount }];
  const neto = input.netAmount + input.exemptAmount;
  if (neto > 0) lines.push({ accountId: input.debitAccountId, debit: neto, credit: 0 });
  if (input.ivaAmount > 0) {
    if (!input.ivaCreditoAccountId) throw new Error('Falta cuenta IVA_CREDITO mapeada para esta empresa');
    lines.push({ accountId: input.ivaCreditoAccountId, debit: input.ivaAmount, credit: 0 });
  }
  return lines;
}

type PurchaseDocForPosting = Pick<
  PurchaseDocument,
  'id' | 'documentType' | 'folio' | 'issueDate' | 'totalAmount' | 'netAmount' | 'exemptAmount' | 'ivaAmount'
>;

async function resolvePurchaseAccounts(tx: TxClient, companyId: string, movesInventory: boolean, ivaAmount: number) {
  const [creditAccountId, debitAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'PROVEEDORES'),
    resolveMappedAccountId(tx, companyId, movesInventory ? 'EXISTENCIAS' : 'GASTOS_OPERACIONALES'),
  ]);
  const ivaCreditoAccountId = ivaAmount > 0 ? await resolveMappedAccountId(tx, companyId, 'IVA_CREDITO') : null;
  return { creditAccountId, debitAccountId, ivaCreditoAccountId };
}

/**
 * Determina si el documento carga a `EXISTENCIAS` (mueve inventario) o a
 * `GASTOS_OPERACIONALES` (gasto/servicio). Basta con mirar si alguna línea
 * está enlazada a un producto: tanto una compra (`IN`) como su devolución
 * (`OUT`, Nota de Crédito) usan la misma cuenta de destino que el hecho
 * económico original — la dirección del movimiento de stock no cambia contra
 * qué cuenta se contabiliza, solo si `applyStockIn` o `applyStockOut` se
 * invoca.
 */
function movesInventory(items: Pick<PurchaseDocumentItem, 'productId'>[]): boolean {
  return items.some((item) => item.productId);
}

/**
 * Postea una Factura/Boleta de compra emitida. Se llama desde los cuatro
 * puntos donde `purchases.service.ts` mueve stock/ISSUED:
 * `createPurchaseDocument` (directo, sin OC), `enrichPurchaseDocumentWithItems`,
 * `issuePurchaseDocument` y `approvePurchaseDocument`.
 */
export async function postPurchaseDocumentIssued(
  tx: TxClient,
  companyId: string,
  doc: PurchaseDocForPosting,
  items: PurchaseDocumentItem[],
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  const inventory = movesInventory(items);
  const accounts = await resolvePurchaseAccounts(tx, companyId, inventory, doc.ivaAmount);
  const label = PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType];

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Compra ${label} Folio ${doc.folio}`,
    sourceType: 'PURCHASE_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: buildPurchaseExpenseLines({
      totalAmount: doc.totalAmount,
      netAmount: doc.netAmount,
      exemptAmount: doc.exemptAmount,
      ivaAmount: doc.ivaAmount,
      ...accounts,
    }),
  });
}

/** Nota de Crédito de proveedor: espejo exacto del asiento de compra, nunca contra caja. */
export async function postPurchaseCreditNoteIssued(
  tx: TxClient,
  companyId: string,
  doc: PurchaseDocForPosting,
  originalItems: PurchaseDocumentItem[],
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  const inventory = movesInventory(originalItems);
  const accounts = await resolvePurchaseAccounts(tx, companyId, inventory, doc.ivaAmount);
  const label = PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType];

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Nota de Crédito ${label} Folio ${doc.folio}`,
    sourceType: 'PURCHASE_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: invertLines(
      buildPurchaseExpenseLines({
        totalAmount: doc.totalAmount,
        netAmount: doc.netAmount,
        exemptAmount: doc.exemptAmount,
        ivaAmount: doc.ivaAmount,
        ...accounts,
      })
    ),
  });
}

/** Anulación de un `PurchaseDocument`: reversa todos los asientos POSTED que haya generado. */
export async function reversePurchaseDocumentPosting(
  tx: TxClient,
  companyId: string,
  documentId: string,
  reason: string,
  createdByUserId?: string
): Promise<void> {
  await reverseDocumentEntries(tx, companyId, 'PURCHASE_DOCUMENT', documentId, reason, createdByUserId);
}
