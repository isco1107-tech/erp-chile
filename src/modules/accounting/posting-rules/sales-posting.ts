import type { DteType, SalesDocument } from '@prisma/client';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { createAndPostEntry, resolveMappedAccountId, type JournalLineInput, type TxClient } from '../services/journal.service';
import { invertLines, reverseDocumentEntries } from './shared';

/**
 * Reglas de asiento del ciclo de ventas (`PROMPT_ERP_V2.md`, Fase C.1).
 *
 * Un hecho económico, un punto de emisión: `postSalesDocumentIssued` es el
 * único lugar del sistema que postea la venta y su costo, llamado desde
 * `sales.service.ts::createSalesDocument` dentro de la misma `$transaction`
 * que ya persiste el documento. La Guía de Despacho (`GUIA_DESPACHO_52`) y la
 * Cotización no generan asiento propio — no son hechos de venta formalizados;
 * la Factura que referencia la guía es la que postea, exactamente el mismo
 * criterio que ya usa `sales.service.ts` para no descontar stock dos veces.
 */

/** Tipos de DTE que representan una venta real (o su corrección vía Nota de Débito) y generan asiento de ingreso. */
const REVENUE_DTE_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56'];

/**
 * Líneas de ingreso de una venta, separando neto afecto/exento y IVA por sus
 * montos reales del documento — no por el `dteType` — porque una misma
 * Factura 33 puede mezclar líneas afectas y exentas (`Product.isExempt` es
 * por producto) y los tres montos deben coexistir en el mismo asiento.
 */
export function buildSalesRevenueLines(input: {
  totalAmount: number;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  debitAccountId: string;
  ventasAfectasAccountId: string;
  ventasExentasAccountId: string;
  ivaDebitoAccountId: string | null;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [{ accountId: input.debitAccountId, debit: input.totalAmount, credit: 0 }];
  if (input.netAmount > 0) lines.push({ accountId: input.ventasAfectasAccountId, debit: 0, credit: input.netAmount });
  if (input.exemptAmount > 0) lines.push({ accountId: input.ventasExentasAccountId, debit: 0, credit: input.exemptAmount });
  if (input.ivaAmount > 0) {
    if (!input.ivaDebitoAccountId) throw new Error('Falta cuenta IVA_DEBITO mapeada para esta empresa');
    lines.push({ accountId: input.ivaDebitoAccountId, debit: 0, credit: input.ivaAmount });
  }
  return lines;
}

/** `D COSTO_VENTAS / H EXISTENCIAS` por el snapshot `unitCostPMP` de cada línea vendida. */
export function buildCostOfSalesLines(input: {
  totalCost: number;
  costoVentasAccountId: string;
  existenciasAccountId: string;
}): JournalLineInput[] {
  if (input.totalCost <= 0) return [];
  return [
    { accountId: input.costoVentasAccountId, debit: input.totalCost, credit: 0 },
    { accountId: input.existenciasAccountId, debit: 0, credit: input.totalCost },
  ];
}

/** Solo debe recibir ítems que realmente movieron Kardex (`isTrackable`) — nunca líneas de servicio o producto no trackeable. */
export function sumUnitCostPmp(items: { unitCostPMP: number; quantity: number }[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.unitCostPMP * item.quantity, 0));
}

interface SalesAccountKeys {
  debitAccountId: string;
  ventasAfectasAccountId: string;
  ventasExentasAccountId: string;
  ivaDebitoAccountId: string | null;
}

async function resolveSalesAccounts(tx: TxClient, companyId: string, ivaAmount: number, cashOrCredit: 'CAJA' | 'CLIENTES'): Promise<SalesAccountKeys> {
  const [debitAccountId, ventasAfectasAccountId, ventasExentasAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, cashOrCredit),
    resolveMappedAccountId(tx, companyId, 'VENTAS_AFECTAS'),
    resolveMappedAccountId(tx, companyId, 'VENTAS_EXENTAS'),
  ]);
  const ivaDebitoAccountId = ivaAmount > 0 ? await resolveMappedAccountId(tx, companyId, 'IVA_DEBITO') : null;
  return { debitAccountId, ventasAfectasAccountId, ventasExentasAccountId, ivaDebitoAccountId };
}

/**
 * Postea la venta emitida y, si corresponde, su costo. Se llama desde
 * `createSalesDocument` inmediatamente después de crear el `SalesDocument` (y
 * tras aplicar el efecto de una Nota de Crédito, que usa `postCreditNoteIssued`
 * en su lugar) — dentro del mismo `tx`.
 */
export async function postSalesDocumentIssued(
  tx: TxClient,
  companyId: string,
  doc: Pick<SalesDocument, 'id' | 'dteType' | 'folio' | 'issueDate' | 'totalAmount' | 'netAmount' | 'exemptAmount' | 'ivaAmount'>,
  /** Solo las líneas que efectivamente descontaron Kardex (`applyStockOut`) — nunca todas las líneas del documento. */
  costedItems: { unitCostPMP: number; quantity: number }[],
  opts: { isImmediatePayment: boolean; affectsStock: boolean; createdByUserId?: string }
): Promise<void> {
  if (!REVENUE_DTE_TYPES.includes(doc.dteType)) return;

  const accounts = await resolveSalesAccounts(tx, companyId, doc.ivaAmount, opts.isImmediatePayment ? 'CAJA' : 'CLIENTES');
  const label = DTE_TYPE_LABELS[doc.dteType];

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Venta ${label} Folio #${doc.folio ?? '-'}`,
    sourceType: 'SALES_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: buildSalesRevenueLines({
      totalAmount: doc.totalAmount,
      netAmount: doc.netAmount,
      exemptAmount: doc.exemptAmount,
      ivaAmount: doc.ivaAmount,
      ...accounts,
    }),
  });

  if (!opts.affectsStock) return;
  const totalCost = sumUnitCostPmp(costedItems);
  if (totalCost <= 0) return;

  const [costoVentasAccountId, existenciasAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'COSTO_VENTAS'),
    resolveMappedAccountId(tx, companyId, 'EXISTENCIAS'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Costo de venta ${label} Folio #${doc.folio ?? '-'}`,
    sourceType: 'SALES_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: buildCostOfSalesLines({ totalCost, costoVentasAccountId, existenciasAccountId }),
  });
}

/**
 * Postea una Nota de Crédito como el espejo exacto de `postSalesDocumentIssued`
 * (débitos y créditos invertidos): reduce lo que el cliente debía y reversa el
 * costo de venta de las unidades que efectivamente volvieron a bodega. Nunca
 * contra CAJA — igual que el resto del sistema, una NC se aplica contra la
 * cuenta por cobrar del documento original, nunca es un reembolso en efectivo
 * directo desde este asiento.
 */
export async function postCreditNoteIssued(
  tx: TxClient,
  companyId: string,
  doc: Pick<SalesDocument, 'id' | 'dteType' | 'folio' | 'issueDate' | 'totalAmount' | 'netAmount' | 'exemptAmount' | 'ivaAmount'>,
  restockedItems: { unitCostPMP: number; quantity: number }[],
  opts: { createdByUserId?: string }
): Promise<void> {
  const accounts = await resolveSalesAccounts(tx, companyId, doc.ivaAmount, 'CLIENTES');
  const label = DTE_TYPE_LABELS[doc.dteType];

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Nota de Crédito ${label} Folio #${doc.folio ?? '-'}`,
    sourceType: 'SALES_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: invertLines(
      buildSalesRevenueLines({
        totalAmount: doc.totalAmount,
        netAmount: doc.netAmount,
        exemptAmount: doc.exemptAmount,
        ivaAmount: doc.ivaAmount,
        ...accounts,
      })
    ),
  });

  const totalCost = sumUnitCostPmp(restockedItems);
  if (totalCost <= 0) return;

  const [costoVentasAccountId, existenciasAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'COSTO_VENTAS'),
    resolveMappedAccountId(tx, companyId, 'EXISTENCIAS'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: doc.issueDate,
    description: `Reverso de costo — Nota de Crédito ${label} Folio #${doc.folio ?? '-'}`,
    sourceType: 'SALES_DOCUMENT',
    sourceId: doc.id,
    createdByUserId: opts.createdByUserId,
    lines: invertLines(buildCostOfSalesLines({ totalCost, costoVentasAccountId, existenciasAccountId })),
  });
}

/** Anulación de cualquier `SalesDocument`: reversa todos los asientos POSTED que haya generado. */
export async function reverseSalesDocumentPosting(
  tx: TxClient,
  companyId: string,
  documentId: string,
  reason: string,
  createdByUserId?: string
): Promise<void> {
  await reverseDocumentEntries(tx, companyId, 'SALES_DOCUMENT', documentId, reason, createdByUserId);
}
