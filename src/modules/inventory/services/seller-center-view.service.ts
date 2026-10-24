import 'server-only';

import { prisma } from '@/lib/prisma';
import { santiagoMidnightUtc } from '@/lib/chile/timezone';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { SETTLEMENT_DTE_TYPES, currentContribution } from '@/lib/consignment/settlement';
import { monthLabel, shiftMonth } from '@/lib/supplier-portal/accounts';
import { roundQty } from '@/lib/supplier-portal/analysis';
import { LOSS_WHERE, reasonLabelOf } from './shrinkage.service';
import { buildPortalView, type SupplierPortalView } from './supplier-portal.service';
import type { SupplierAccount } from './seller-center-auth.service';

/**
 * Lo que ve la persona de un seller en el Seller Center, para UN mes (ADR 0010).
 *
 * Reglas que no se rompen:
 * - **Las ventas salen de SUS líneas de venta** (`SalesDocumentItem.consignorId`, la foto del seller
 *   y de la comisión al vender), con la misma regla de la liquidación (`currentContribution`):
 *   boletas y facturas emitidas suman, las notas de crédito restan lo que se le acreditó. Así lo que
 *   ve el seller cuadra con lo que se le liquida. Si un producto cambió de dueño, no ve ventas ajenas.
 * - **Su mercadería, lo pendiente y sus liquidaciones** son la misma vista del portal con código
 *   (`buildPortalView`), armada campo por campo.
 * - **Mermas solo para mirar:** las que la tienda le asignó y las de sus productos desde su primera
 *   recepción (antes eran de otro dueño). Nunca costos, notas internas ni otros sellers.
 */

export const MAX_LOSS_ROWS = 1000;

export type LossResponsible = 'YOU' | 'STORE' | 'UNASSIGNED' | 'OTHER';

export interface SellerCenterSalesRow {
  key: string;
  sku: string | null;
  name: string;
  units: number;
  /** Neto vendido (sin IVA, después de descuentos). */
  net: number;
  /** Lo que se queda la empresa. */
  commission: number;
  /** Lo que le corresponde al seller. */
  payout: number;
}

export interface SellerCenterLossRow {
  id: string;
  createdAt: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  reason: string;
  evidenceUrl: string | null;
  /** `null` si la empresa no usa «Mermas con responsable». */
  responsible: LossResponsible | null;
}

export interface SellerCenterView {
  month: string;
  monthLabel: string;
  generatedAt: string;
  sales: { rows: SellerCenterSalesRow[]; units: number; net: number; commission: number; payout: number };
  portal: SupplierPortalView;
  losses: { rows: SellerCenterLossRow[]; units: number; yoursUnits: number; truncated: boolean };
}

function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const [ny, nm] = shiftMonth(month, 1).split('-').map(Number) as [number, number];
  return { from: santiagoMidnightUtc(y, m, 1), to: santiagoMidnightUtc(ny, nm, 1) };
}

/** Ventas del mes por producto, con la regla de la liquidación. */
async function monthSales(companyId: string, consignorId: string, from: Date, to: Date): Promise<SellerCenterView['sales']> {
  const items = await prisma.salesDocumentItem.findMany({
    where: { companyId, consignorId, document: { status: 'ISSUED', dteType: { in: [...SETTLEMENT_DTE_TYPES] }, issueDate: { gte: from, lt: to } } },
    select: {
      id: true,
      productId: true,
      sku: true,
      description: true,
      quantity: true,
      subtotal: true,
      consignorCommissionBps: true,
      consignorBaseNet: true,
      document: { select: { dteType: true, status: true } },
    },
    take: 20_000,
  });
  const byProduct = new Map<string, SellerCenterSalesRow>();
  for (const item of items) {
    const amounts = currentContribution({
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
    const key = item.productId ?? `${item.sku ?? ''}|${item.description}`;
    const row = byProduct.get(key) ?? { key, sku: item.sku, name: item.description, units: 0, net: 0, commission: 0, payout: 0 };
    row.units = roundQty(row.units + amounts.quantity);
    row.net += amounts.netAmount;
    row.commission += amounts.commissionAmount;
    row.payout += amounts.payoutAmount;
    byProduct.set(key, row);
  }
  const rows = [...byProduct.values()].filter((row) => row.units !== 0 || row.net !== 0).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, 'es'));
  return {
    rows,
    units: roundQty(rows.reduce((sum, row) => sum + row.units, 0)),
    net: rows.reduce((sum, row) => sum + row.net, 0),
    commission: rows.reduce((sum, row) => sum + row.commission, 0),
    payout: rows.reduce((sum, row) => sum + row.payout, 0),
  };
}

/** Mermas del mes: las asignadas al seller y las de sus productos desde que los recibió por primera vez. */
async function monthLosses(account: SupplierAccount, from: Date, to: Date): Promise<SellerCenterView['losses']> {
  const { companyId, supplierId: consignorId } = account;
  const owned = await prisma.product.findMany({ where: { companyId, consignorId }, select: { id: true }, take: 5000 });
  const ownedIds = owned.map((product) => product.id);
  // Cuándo empezó a ser suyo: su primera recepción en consignación (lleva al seller como `supplierId`).
  const firstReceipts = ownedIds.length
    ? await prisma.inventoryMovement.groupBy({ by: ['productId'], where: { companyId, supplierId: consignorId, productId: { in: ownedIds }, type: 'PURCHASE_IN' }, _min: { createdAt: true } })
    : [];
  const ownedSince = firstReceipts.flatMap((row) => (row._min.createdAt ? [{ productId: row.productId, createdAt: { gte: row._min.createdAt } }] : []));

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      companyId,
      createdAt: { gte: from, lt: to },
      AND: [LOSS_WHERE, { OR: [...ownedSince, { liability: { supplierId: consignorId, companyId } }] }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_LOSS_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      quantity: true,
      reasonCode: true,
      reference: true,
      evidenceUrl: true,
      product: { select: { sku: true, name: true, unit: true } },
      liability: { select: { party: true, supplierId: true } },
    },
  });

  const responsibleOf = (liability: { party: string; supplierId: string | null } | null): LossResponsible | null => {
    if (!account.showsLiability) return null;
    if (!liability) return 'UNASSIGNED';
    if (liability.party === 'STORE') return 'STORE';
    return liability.supplierId === consignorId ? 'YOU' : 'OTHER';
  };
  const rows: SellerCenterLossRow[] = movements.slice(0, MAX_LOSS_ROWS).map((movement) => ({
    id: movement.id,
    createdAt: movement.createdAt.toISOString(),
    sku: movement.product.sku,
    name: movement.product.name,
    unit: movement.product.unit,
    quantity: roundQty(movement.quantity),
    reason: reasonLabelOf(movement.reasonCode, movement.reference),
    evidenceUrl: movement.evidenceUrl && isAllowedBlobUrl(movement.evidenceUrl) ? movement.evidenceUrl : null,
    responsible: responsibleOf(movement.liability),
  }));
  return {
    rows,
    units: roundQty(rows.reduce((sum, row) => sum + row.quantity, 0)),
    yoursUnits: roundQty(rows.filter((row) => row.responsible === 'YOU').reduce((sum, row) => sum + row.quantity, 0)),
    truncated: movements.length > MAX_LOSS_ROWS,
  };
}

export async function getSellerCenterView(account: SupplierAccount, month: string, now: Date = new Date()): Promise<SellerCenterView> {
  const { from, to } = monthBounds(month);
  const [sales, portal, losses] = await Promise.all([
    monthSales(account.companyId, account.supplierId, from, to),
    buildPortalView(
      {
        companyId: account.companyId,
        contactId: account.supplierId,
        showMovement: true,
        contact: account.contact,
        company: { businessName: account.company.name, rut: account.company.rut, logoUrl: account.company.logoUrl, phone: account.company.phone, email: account.company.email },
      },
      now
    ),
    monthLosses(account, from, to),
  ]);
  return { month, monthLabel: monthLabel(month), generatedAt: now.toISOString(), sales, portal, losses };
}
