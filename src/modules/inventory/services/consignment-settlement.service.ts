import type { SellerSettlementStatus, DteType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { formatCurrency } from '@/lib/chile/tax';
import {
  SETTLEMENT_DTE_TYPES,
  pendingLines,
  settlementTotals,
  sumSettledByItem,
  type ConsignedSaleLine,
  type PendingLine,
  type SettlementTotals,
} from '@/lib/consignment/settlement';
import type { SettlementGenerateInput, SettlementPayInput, SettlementVoidInput } from '../schema';

/**
 * Liquidaciones a sellers de consignación: lo vendido de su mercadería, la comisión de la empresa y
 * lo que se le debe. El cálculo es puro (`src/lib/consignment/settlement.ts`); aquí se leen las
 * líneas de venta y se guarda la liquidación.
 *
 * Reglas que no se rompen:
 * - **Una liquidación queda congelada.** Lo que cambie después (un documento anulado, una nota de
 *   crédito) aparece como ajuste en la siguiente, nunca reescribe la anterior.
 * - **Sin doble liquidación.** Generar bloquea la fila del seller y recalcula lo pendiente dentro
 *   de la misma transacción: dos clics seguidos dejan una sola liquidación.
 * - **No hay asientos ni documentos tributarios.** Esto es el estado de cuenta del seller. Cómo se
 *   documenta lo que se le paga (factura del seller, IVA crédito) se define aparte.
 */

type Db = Pick<Prisma.TransactionClient, 'salesDocumentItem' | 'sellerSettlementLine'>;

const MAX_AMOUNT = 2_147_483_647;

/** Una línea pendiente con el documento del que viene, para mostrarla. */
export interface PendingSettlementLine extends PendingLine {
  dteType: DteType;
  folio: number | null;
  issueDate: Date;
}

/**
 * Lo pendiente de liquidar, por seller (o solo el de `consignorId`). Toma las líneas de venta
 * emitidas (y las de documentos anulados, que pueden restar lo ya liquidado) y les descuenta lo que
 * ya entró en una liquidación vigente.
 */
export async function loadPendingBySeller(db: Db, companyId: string, consignorId?: string): Promise<Map<string, PendingSettlementLine[]>> {
  const [items, settledRows] = await Promise.all([
    db.salesDocumentItem.findMany({
      where: {
        companyId,
        consignorId: consignorId ?? { not: null },
        document: { dteType: { in: [...SETTLEMENT_DTE_TYPES] }, status: { in: ['ISSUED', 'CANCELLED'] } },
      },
      select: {
        id: true,
        consignorId: true,
        productId: true,
        sku: true,
        description: true,
        quantity: true,
        subtotal: true,
        consignorCommissionBps: true,
        consignorBaseNet: true,
        document: { select: { dteType: true, status: true, folio: true, issueDate: true } },
      },
      orderBy: [{ document: { issueDate: 'asc' } }, { id: 'asc' }],
    }),
    db.sellerSettlementLine.findMany({
      where: { companyId, settlement: { status: { not: 'VOIDED' }, ...(consignorId ? { consignorId } : {}) } },
      select: { salesDocumentItemId: true, quantity: true, netAmount: true, commissionAmount: true, payoutAmount: true },
    }),
  ]);

  const settled = sumSettledByItem(settledRows);
  const bySeller = new Map<string, ConsignedSaleLine[]>();
  const documentOf = new Map<string, { dteType: DteType; folio: number | null; issueDate: Date }>();
  for (const item of items) {
    if (!item.consignorId) continue;
    documentOf.set(item.id, { dteType: item.document.dteType, folio: item.document.folio, issueDate: item.document.issueDate });
    const lines = bySeller.get(item.consignorId) ?? [];
    lines.push({
      salesDocumentItemId: item.id,
      productId: item.productId,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      subtotal: item.subtotal,
      commissionBps: item.consignorCommissionBps,
      baseNet: item.consignorBaseNet,
      dteType: item.document.dteType,
      status: item.document.status,
    });
    bySeller.set(item.consignorId, lines);
  }

  const result = new Map<string, PendingSettlementLine[]>();
  for (const [sellerId, lines] of bySeller) {
    const pending = pendingLines(lines, settled).flatMap((line) => {
      const document = documentOf.get(line.salesDocumentItemId);
      return document ? [{ ...line, ...document }] : [];
    });
    if (pending.length > 0) result.set(sellerId, pending);
  }
  return result;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export interface PendingSettlement {
  consignor: { id: string; name: string; rut: string; commissionBps: number | null };
  lines: PendingSettlementLine[];
  totals: SettlementTotals;
}

async function requireConsignor(db: Pick<Prisma.TransactionClient, 'contact'>, companyId: string, consignorId: string) {
  const seller = await db.contact.findFirst({
    where: { id: consignorId, companyId, isConsignor: true },
    select: { id: true, razonSocial: true, nombreFantasia: true, rut: true, consignmentCommissionBps: true },
  });
  if (!seller) throw new Error('Seller no encontrado');
  return { id: seller.id, name: seller.nombreFantasia?.trim() || seller.razonSocial, rut: seller.rut, commissionBps: seller.consignmentCommissionBps };
}

/** Lo que se le debería liquidar hoy a un seller, línea por línea. No guarda nada. */
export async function getPendingSettlement(companyId: string, consignorId: string): Promise<PendingSettlement> {
  const consignor = await requireConsignor(prisma, companyId, consignorId);
  const lines = (await loadPendingBySeller(prisma, companyId, consignorId)).get(consignorId) ?? [];
  return { consignor, lines, totals: settlementTotals(lines) };
}

export interface SettlementOverviewRow {
  consignorId: string;
  name: string;
  rut: string;
  commissionBps: number | null;
  /** Lo que hoy se liquidaría (ventas emitidas menos devoluciones, sin lo ya liquidado). */
  pendingUnits: number;
  pendingNet: number;
  pendingCommission: number;
  pendingPayout: number;
  /** Liquidaciones generadas y todavía sin pagar. */
  unpaidCount: number;
  unpaidPayout: number;
}

/** Una fila por seller: lo pendiente de liquidar y lo liquidado sin pagar. */
export async function listSettlementOverview(companyId: string): Promise<SettlementOverviewRow[]> {
  const [sellers, pendingBySeller, unpaid] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, isConsignor: true },
      select: { id: true, razonSocial: true, nombreFantasia: true, rut: true, consignmentCommissionBps: true },
      orderBy: { razonSocial: 'asc' },
      take: 500,
    }),
    loadPendingBySeller(prisma, companyId),
    prisma.sellerSettlement.groupBy({
      by: ['consignorId'],
      where: { companyId, status: 'CONFIRMED' },
      _sum: { payoutAmount: true },
      _count: { _all: true },
    }),
  ]);
  const unpaidBySeller = new Map(unpaid.map((row) => [row.consignorId, { count: row._count._all, payout: row._sum.payoutAmount ?? 0 }]));

  return sellers.map((seller) => {
    const totals = settlementTotals(pendingBySeller.get(seller.id) ?? []);
    const open = unpaidBySeller.get(seller.id);
    return {
      consignorId: seller.id,
      name: seller.nombreFantasia?.trim() || seller.razonSocial,
      rut: seller.rut,
      commissionBps: seller.consignmentCommissionBps,
      pendingUnits: totals.units,
      pendingNet: totals.netSales,
      pendingCommission: totals.commissionAmount,
      pendingPayout: totals.linesPayout,
      unpaidCount: open?.count ?? 0,
      unpaidPayout: open?.payout ?? 0,
    };
  });
}

export interface SettlementListItem {
  id: string;
  number: number;
  consignorId: string;
  consignorName: string;
  status: SellerSettlementStatus;
  units: number;
  netSales: number;
  commissionAmount: number;
  adjustmentAmount: number;
  payoutAmount: number;
  createdAt: Date;
  paidAt: Date | null;
  paymentReference: string | null;
}

export async function listSettlements(
  companyId: string,
  options: { consignorId?: string; status?: SellerSettlementStatus } = {}
): Promise<SettlementListItem[]> {
  const rows = await prisma.sellerSettlement.findMany({
    where: { companyId, ...(options.consignorId ? { consignorId: options.consignorId } : {}), ...(options.status ? { status: options.status } : {}) },
    select: {
      id: true,
      number: true,
      consignorId: true,
      status: true,
      units: true,
      netSales: true,
      commissionAmount: true,
      adjustmentAmount: true,
      payoutAmount: true,
      createdAt: true,
      paidAt: true,
      paymentReference: true,
      consignor: { select: { razonSocial: true, nombreFantasia: true } },
    },
    orderBy: { number: 'desc' },
    take: 200,
  });
  return rows.map(({ consignor, ...row }) => ({ ...row, consignorName: consignor.nombreFantasia?.trim() || consignor.razonSocial }));
}

export interface SettlementDetail extends SettlementListItem {
  adjustmentNote: string | null;
  note: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  consignorRut: string;
  lines: Array<{ id: string; sku: string | null; description: string; quantity: number; netAmount: number; commissionAmount: number; payoutAmount: number }>;
}

export async function getSettlement(companyId: string, id: string): Promise<SettlementDetail | null> {
  const row = await prisma.sellerSettlement.findFirst({
    where: { id, companyId },
    include: {
      consignor: { select: { razonSocial: true, nombreFantasia: true, rut: true } },
      lines: {
        select: { id: true, sku: true, description: true, quantity: true, netAmount: true, commissionAmount: true, payoutAmount: true },
        orderBy: { description: 'asc' },
      },
    },
  });
  if (!row) return null;
  const { consignor, lines, ...rest } = row;
  return {
    id: rest.id,
    number: rest.number,
    consignorId: rest.consignorId,
    consignorName: consignor.nombreFantasia?.trim() || consignor.razonSocial,
    consignorRut: consignor.rut,
    status: rest.status,
    units: rest.units,
    netSales: rest.netSales,
    commissionAmount: rest.commissionAmount,
    adjustmentAmount: rest.adjustmentAmount,
    adjustmentNote: rest.adjustmentNote,
    payoutAmount: rest.payoutAmount,
    note: rest.note,
    createdAt: rest.createdAt,
    paidAt: rest.paidAt,
    paymentReference: rest.paymentReference,
    voidedAt: rest.voidedAt,
    voidReason: rest.voidReason,
    lines,
  };
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/**
 * Genera la liquidación de todo lo pendiente de un seller. Bloquea la fila del seller para que dos
 * generaciones simultáneas no cuenten las mismas ventas dos veces. Si las devoluciones superan lo
 * vendido el saldo no se liquida: queda pendiente para cuando haya más ventas.
 */
export async function generateSettlement(companyId: string, userId: string, input: SettlementGenerateInput) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Contact" WHERE id = ${input.consignorId} AND "companyId" = ${companyId} AND "isConsignor" = true FOR UPDATE`;
    if (locked.length === 0) throw new Error('Seller no encontrado');

    // Un reintento de la misma generación (doble clic, pestaña repetida, respuesta perdida) devuelve la
    // liquidación ya creada. Es lo único que protege un ajuste manual solo, que no tiene ventas que repartir.
    if (input.idempotencyKey) {
      const existing = await tx.sellerSettlement.findFirst({
        where: { companyId, idempotencyKey: input.idempotencyKey },
        select: { id: true, number: true, consignorId: true, payoutAmount: true, units: true },
      });
      if (existing) return existing;
    }

    const pending = (await loadPendingBySeller(tx, companyId, input.consignorId)).get(input.consignorId) ?? [];
    const adjustmentAmount = input.adjustmentAmount ?? 0;
    if (pending.length === 0 && adjustmentAmount === 0) throw new Error('No hay ventas pendientes de liquidar para este seller');

    const totals = settlementTotals(pending, adjustmentAmount);
    if (Math.abs(totals.netSales) > MAX_AMOUNT || Math.abs(totals.payoutAmount) > MAX_AMOUNT) {
      throw new Error('El monto de la liquidación es demasiado grande (máximo $2.147.483.647)');
    }
    if (input.expectedPayoutAmount !== undefined && input.expectedPayoutAmount !== totals.payoutAmount) {
      throw new Error(`Las ventas cambiaron desde que abriste la vista previa (ahora se le pagaría ${formatCurrency(totals.payoutAmount)}). Revísala y confirma de nuevo`);
    }
    if (totals.payoutAmount < 0) {
      throw new Error(
        totals.linesPayout < 0
          ? 'Las devoluciones superan lo vendido: no hay nada que pagarle todavía. Ese saldo queda pendiente y se descuenta en la próxima liquidación'
          : 'El ajuste manual deja el total en negativo: corrígelo para que la liquidación no sea menor a cero'
      );
    }

    const sequence = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'SELLER_SETTLEMENT' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'SELLER_SETTLEMENT', currentFolio: 1 },
    });

    return tx.sellerSettlement.create({
      data: {
        companyId,
        consignorId: input.consignorId,
        number: sequence.currentFolio,
        units: totals.units,
        netSales: totals.netSales,
        commissionAmount: totals.commissionAmount,
        adjustmentAmount,
        adjustmentNote: adjustmentAmount === 0 ? null : input.adjustmentNote || null,
        payoutAmount: totals.payoutAmount,
        note: input.note || null,
        createdById: userId,
        idempotencyKey: input.idempotencyKey || null,
        lines: {
          create: pending.map((line) => ({
            companyId,
            salesDocumentItemId: line.salesDocumentItemId,
            productId: line.productId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            netAmount: line.netAmount,
            commissionAmount: line.commissionAmount,
            payoutAmount: line.payoutAmount,
          })),
        },
      },
      select: { id: true, number: true, consignorId: true, payoutAmount: true, units: true },
    });
  }, LOCKING_TX_OPTIONS);
}

/** Por qué no se pudo cambiar el estado de una liquidación (no existe, ya pagada o anulada). */
async function describeBlockedTransition(companyId: string, id: string, verb: 'pagar' | 'anular'): Promise<string> {
  const current = await prisma.sellerSettlement.findFirst({ where: { id, companyId }, select: { status: true, number: true } });
  if (!current) return 'Liquidación no encontrada';
  if (current.status === 'PAID') return verb === 'anular' ? `La liquidación N° ${current.number} ya está pagada y no se puede anular` : `La liquidación N° ${current.number} ya está pagada`;
  if (current.status === 'VOIDED') return `La liquidación N° ${current.number} está anulada`;
  return 'No se pudo actualizar la liquidación. Recarga la pantalla e intenta de nuevo';
}

/** Marca la liquidación como pagada. El `updateMany` condicionado al estado evita pagarla dos veces. */
export async function markSettlementPaid(companyId: string, input: SettlementPayInput): Promise<void> {
  const { count } = await prisma.sellerSettlement.updateMany({
    where: { id: input.id, companyId, status: 'CONFIRMED' },
    data: { status: 'PAID', paidAt: new Date(`${input.paidAt}T12:00:00Z`), paymentReference: input.reference || null },
  });
  if (count === 0) throw new Error(await describeBlockedTransition(companyId, input.id, 'pagar'));
}

/**
 * Anula una liquidación que aún no se pagó: sus ventas vuelven a quedar pendientes. Una pagada no
 * se anula (el dinero ya salió); se corrige con un ajuste en la siguiente.
 */
export async function voidSettlement(companyId: string, input: SettlementVoidInput): Promise<void> {
  const { count } = await prisma.sellerSettlement.updateMany({
    where: { id: input.id, companyId, status: 'CONFIRMED' },
    data: { status: 'VOIDED', voidedAt: new Date(), voidReason: input.reason },
  });
  if (count === 0) throw new Error(await describeBlockedTransition(companyId, input.id, 'anular'));
}
