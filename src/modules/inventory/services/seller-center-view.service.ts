import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { santiagoMidnightUtc } from '@/lib/chile/timezone';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { exclusiveProductIds, monthLabel, shiftMonth, summarizeSales, type SalesLine } from '@/lib/supplier-portal/accounts';
import type { StatusCounts } from '@/lib/supplier-portal/analysis';
import { roundQty } from '@/lib/supplier-portal/analysis';
import { LOSS_WHERE, reasonLabelOf } from './shrinkage.service';
import { buildSupplierInventory, type SupplierPortalRow } from './supplier-portal.service';
import type { SupplierAccount } from './seller-center-auth.service';

/**
 * Lo que ve la persona del proveedor en el Seller Center, para UN mes.
 *
 * Reglas que no se rompen (ver ADR 0008):
 * - **Ventas en $ solo de lo que es suyo.** Se informan unidades y neto cobrado (después del
 *   descuento de la línea, sin IVA) de boletas y facturas EMITIDAS, menos las notas de crédito,
 *   y SOLO de los productos que surte en exclusiva: un producto con dos proveedores comparte una
 *   sola venta y mostrarla sería mostrar la de otro productor. Esos muestran existencias.
 * - **Jamás** el costo de la tienda, su margen, clientes, documentos, otros proveedores ni las
 *   notas internas de una merma. Todo se arma campo por campo.
 * - **Mermas solo para mirar.** Las de sus productos exclusivos y las que la tienda le asignó; si
 *   la empresa usa «Mermas con responsable», quién respondió (sin nombrar a otro proveedor).
 */

export const MAX_LOSS_ROWS = 1000;
const SALE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;
const CREDIT_NOTE = 'NOTA_CREDITO_61';

export type LossResponsible = 'YOU' | 'STORE' | 'UNASSIGNED' | 'OTHER';

export interface SellerCenterSalesRow {
  sku: string;
  name: string;
  unit: string;
  units: number;
  net: number;
  averagePrice: number | null;
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
  sales: { rows: SellerCenterSalesRow[]; units: number; net: number; exclusiveProducts: number; sharedProducts: number };
  inventory: { rows: SupplierPortalRow[]; summary: StatusCounts };
  losses: { rows: SellerCenterLossRow[]; units: number; yoursUnits: number; truncated: boolean };
}

function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const [ny, nm] = shiftMonth(month, 1).split('-').map(Number) as [number, number];
  return { from: santiagoMidnightUtc(y, m, 1), to: santiagoMidnightUtc(ny, nm, 1) };
}

/** Productos del proveedor y cuántos proveedores tiene cada uno (en la empresa). */
async function supplierProducts(companyId: string, supplierId: string) {
  const links = await prisma.productSupplier.findMany({ where: { companyId, supplierId }, select: { productId: true }, take: 5000 });
  const ids = links.map((link) => link.productId);
  if (ids.length === 0) return { all: [] as string[], exclusive: new Set<string>() };
  const counts = await prisma.productSupplier.groupBy({ by: ['productId'], where: { companyId, productId: { in: ids } }, _count: { _all: true } });
  return { all: ids, exclusive: exclusiveProductIds(counts.map((row) => ({ productId: row.productId, supplierCount: row._count._all }))) };
}

async function salesLines(companyId: string, productIds: string[], from: Date, to: Date): Promise<SalesLine[]> {
  if (productIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ productId: string; units: number; net: number }>>`
    SELECT i."productId",
           SUM(CASE WHEN d."dteType"::text = ${CREDIT_NOTE} THEN -i."quantity" ELSE i."quantity" END)::float8 AS "units",
           SUM(CASE WHEN d."dteType"::text = ${CREDIT_NOTE} THEN -i."subtotal" ELSE i."subtotal" END)::float8 AS "net"
    FROM "SalesDocumentItem" i
    JOIN "SalesDocument" d ON d."id" = i."documentId"
    WHERE d."companyId" = ${companyId}
      AND i."companyId" = ${companyId}
      AND d."status" = 'ISSUED'
      AND d."dteType"::text IN (${Prisma.join([...SALE_TYPES, CREDIT_NOTE])})
      AND i."productId" IN (${Prisma.join(productIds)})
      AND d."issueDate" >= ${from}
      AND d."issueDate" < ${to}
    GROUP BY i."productId"`;
  return rows.map((row) => ({ productId: row.productId, units: Number(row.units), net: Number(row.net) }));
}

export async function getSellerCenterView(account: SupplierAccount, month: string, now: Date = new Date()): Promise<SellerCenterView> {
  const { companyId, supplierId } = account;
  const { from, to } = monthBounds(month);
  const products = await supplierProducts(companyId, supplierId);
  const exclusive = [...products.exclusive];

  const [lines, inventory, losses] = await Promise.all([
    salesLines(companyId, exclusive, from, to),
    buildSupplierInventory(companyId, supplierId, true, now),
    prisma.inventoryMovement.findMany({
      where: {
        companyId,
        createdAt: { gte: from, lt: to },
        AND: [LOSS_WHERE, { OR: [...(exclusive.length ? [{ productId: { in: exclusive } }] : []), { liability: { supplierId, companyId } }] }],
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
    }),
  ]);

  const names = new Map<string, { sku: string; name: string; unit: string }>();
  const summary = summarizeSales(lines);
  if (summary.products.length) {
    for (const product of await prisma.product.findMany({ where: { companyId, id: { in: summary.products.map((row) => row.productId) } }, select: { id: true, sku: true, name: true, unit: true } })) {
      names.set(product.id, { sku: product.sku, name: product.name, unit: product.unit });
    }
  }

  const responsibleOf = (liability: { party: string; supplierId: string | null } | null): LossResponsible | null => {
    if (!account.showsLiability) return null;
    if (!liability) return 'UNASSIGNED';
    if (liability.party === 'STORE') return 'STORE';
    return liability.supplierId === supplierId ? 'YOU' : 'OTHER';
  };
  const lossRows: SellerCenterLossRow[] = losses.slice(0, MAX_LOSS_ROWS).map((movement) => ({
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
    month,
    monthLabel: monthLabel(month),
    generatedAt: now.toISOString(),
    sales: {
      rows: summary.products.flatMap((row) => {
        const product = names.get(row.productId);
        return product ? [{ ...product, units: row.units, net: row.net, averagePrice: row.averagePrice }] : [];
      }),
      units: summary.units,
      net: summary.net,
      exclusiveProducts: exclusive.length,
      sharedProducts: products.all.length - exclusive.length,
    },
    inventory,
    losses: {
      rows: lossRows,
      units: roundQty(lossRows.reduce((sum, row) => sum + row.quantity, 0)),
      yoursUnits: roundQty(lossRows.filter((row) => row.responsible === 'YOU').reduce((sum, row) => sum + row.quantity, 0)),
      truncated: losses.length > MAX_LOSS_ROWS,
    },
  };
}
