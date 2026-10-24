import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toFeatureFlags } from '@/lib/auth/modules';
import { MOVEMENT_WINDOW_DAYS, countStatuses, coverageDays, roundQty, stockStatus, type StatusCounts, type StockStatus } from '@/lib/supplier-portal/analysis';
import { formatSupplierCode, hashSupplierCode, newSupplierCode, normalizeSupplierCode, supplierCodeHint } from '@/lib/supplier-portal/code';
import { effectiveCommissionBps } from '@/lib/consignment/commission';
import { settlementTotals } from '@/lib/consignment/settlement';
import { loadPendingBySeller } from './consignment-settlement.service';

/**
 * Portal de inventario del proveedor (`/proveedor`): cada proveedor entra con SU código y ve
 * cuánto le queda en la bodega de los productos que surte, para analizar y reponer.
 *
 * Un seller de consignación entra por el mismo portal y con el mismo tipo de código: además ve su
 * mercadería (la que sigue siendo suya), lo vendido sin liquidar y sus liquidaciones. Ve sus propios
 * montos (neto, comisión, lo que se le paga) pero jamás clientes, documentos, costos ni a otros sellers.
 *
 * Reglas que no se rompen:
 * - **Solo sus productos.** La lista sale de `ProductSupplier` del proveedor dueño del código;
 *   el navegador nunca manda un id de empresa, de proveedor ni de producto.
 * - **Solo cantidades.** Jamás costos, precios, márgenes, clientes, documentos ni otros
 *   proveedores. Todo se arma campo por campo (nunca con `include` completo).
 * - **Solo lectura.** Aquí no hay nada que se pueda cambiar.
 * - **El código se guarda hasheado.** Generar uno nuevo invalida el anterior; revocar el acceso
 *   lo deja sin efecto al instante.
 * - **Una métrica sin datos se omite.** La cobertura exige ventas reales en la ventana; sin
 *   ellas no se muestra un número inventado.
 */

export class SupplierPortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierPortalError';
  }
}

// ─── Administración (la empresa) ─────────────────────────────────────────────

export interface SupplierPortalAdmin {
  access: { hint: string; createdAt: Date; lastUsedAt: Date | null; showMovement: boolean } | null;
  isSupplier: boolean;
  products: Array<{ id: string; sku: string; name: string; unit: string; stock: number; lastReceivedAt: Date | null }>;
  /** Solo si es seller: sus productos en consignación (se asignan en el Catálogo, no aquí). */
  consignment: { products: Array<{ id: string; sku: string; name: string; unit: string; stock: number }> } | null;
}

/** Proveedor o seller de la empresa: los dos pueden tener portal. */
async function requireSupplier(companyId: string, contactId: string): Promise<{ id: string; razonSocial: string }> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, OR: [{ isSupplier: true }, { isConsignor: true }] },
    select: { id: true, razonSocial: true },
  });
  if (!contact) throw new SupplierPortalError('El contacto no existe o no está marcado como proveedor ni como seller');
  return contact;
}

export async function getSupplierPortalAdmin(companyId: string, contactId: string): Promise<SupplierPortalAdmin> {
  const [access, contact, links] = await Promise.all([
    prisma.supplierPortalAccess.findFirst({ where: { companyId, contactId }, select: { codeHint: true, createdAt: true, lastUsedAt: true, showMovement: true } }),
    prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { isSupplier: true, isConsignor: true } }),
    prisma.productSupplier.findMany({
      where: { companyId, supplierId: contactId },
      orderBy: { product: { name: 'asc' } },
      take: 500,
      select: { lastReceivedAt: true, product: { select: { id: true, sku: true, name: true, unit: true, stocks: { select: { quantity: true } } } } },
    }),
  ]);
  const consigned = contact?.isConsignor
    ? await prisma.product.findMany({
        where: { companyId, consignorId: contactId, isActive: true },
        orderBy: { name: 'asc' },
        take: 500,
        select: { id: true, sku: true, name: true, unit: true, stocks: { select: { quantity: true } } },
      })
    : null;
  return {
    access: access ? { hint: access.codeHint, createdAt: access.createdAt, lastUsedAt: access.lastUsedAt, showMovement: access.showMovement } : null,
    isSupplier: contact?.isSupplier ?? false,
    consignment: consigned
      ? { products: consigned.map((product) => ({ id: product.id, sku: product.sku, name: product.name, unit: product.unit, stock: roundQty(product.stocks.reduce((sum, stock) => sum + stock.quantity, 0)) })) }
      : null,
    products: links.map((link) => ({
      id: link.product.id,
      sku: link.product.sku,
      name: link.product.name,
      unit: link.product.unit,
      stock: roundQty(link.product.stocks.reduce((sum, stock) => sum + stock.quantity, 0)),
      lastReceivedAt: link.lastReceivedAt,
    })),
  };
}

/**
 * Código nuevo para el proveedor. Reemplaza al anterior (que deja de funcionar al instante).
 * El código en claro se devuelve UNA vez: después solo queda su huella.
 */
export async function generateSupplierPortalCode(companyId: string, contactId: string, userId: string): Promise<{ code: string }> {
  await requireSupplier(companyId, contactId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newSupplierCode();
    try {
      await prisma.supplierPortalAccess.upsert({
        where: { contactId },
        create: { companyId, contactId, codeHash: hashSupplierCode(code), codeHint: supplierCodeHint(code), createdById: userId },
        update: { companyId, codeHash: hashSupplierCode(code), codeHint: supplierCodeHint(code), createdById: userId, createdAt: new Date(), lastUsedAt: null },
      });
      return { code: formatSupplierCode(code) };
    } catch (error) {
      // Dos códigos con la misma huella es inverosímil (80 bits), pero un choque no debe ser un error para la persona.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw new SupplierPortalError('No se pudo generar el código. Intenta de nuevo.');
}

export async function revokeSupplierPortalAccess(companyId: string, contactId: string): Promise<void> {
  await requireSupplier(companyId, contactId);
  await prisma.supplierPortalAccess.deleteMany({ where: { companyId, contactId } });
}

export async function setSupplierPortalMovement(companyId: string, contactId: string, showMovement: boolean): Promise<void> {
  const { count } = await prisma.supplierPortalAccess.updateMany({ where: { companyId, contactId }, data: { showMovement } });
  if (count === 0) throw new SupplierPortalError('Este proveedor todavía no tiene acceso. Genera su código primero.');
}

export async function linkSupplierProduct(companyId: string, contactId: string, productId: string): Promise<void> {
  // Solo un proveedor surte productos «a mano»: lo de un seller es lo que tiene su nombre como dueño en el catálogo.
  const supplier = await prisma.contact.findFirst({ where: { id: contactId, companyId, isSupplier: true }, select: { id: true } });
  if (!supplier) throw new SupplierPortalError('El contacto no existe o no está marcado como proveedor');
  const product = await prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
  if (!product) throw new SupplierPortalError('Producto no encontrado');
  await prisma.productSupplier.upsert({
    where: { productId_supplierId: { productId, supplierId: contactId } },
    create: { companyId, productId, supplierId: contactId },
    update: {},
  });
}

export async function unlinkSupplierProduct(companyId: string, contactId: string, productId: string): Promise<void> {
  await prisma.productSupplier.deleteMany({ where: { companyId, supplierId: contactId, productId } });
}

/** Productos activos que se pueden agregar a la lista del proveedor (los que aún no tiene). */
export async function searchLinkableProducts(companyId: string, contactId: string, query: string): Promise<Array<{ id: string; sku: string; name: string }>> {
  const text = query.trim();
  if (text.length < 2) return [];
  return prisma.product.findMany({
    where: {
      companyId,
      isActive: true,
      suppliers: { none: { supplierId: contactId } },
      OR: [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { brand: { contains: text, mode: 'insensitive' } }],
    },
    select: { id: true, sku: true, name: true },
    orderBy: { name: 'asc' },
    take: 8,
  });
}

// ─── Vista pública (el proveedor) ────────────────────────────────────────────

export interface SupplierPortalRow {
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  imageUrl: string | null;
  minStock: number;
  total: number;
  status: StockStatus;
  /** Existencias por bodega, para que no se mezclen cuando hay más de una. */
  byWarehouse: Array<{ warehouse: string; quantity: number }>;
  lastReceivedAt: Date | null;
  lastReceivedQty: number | null;
  /** Salidas por venta de los últimos 30 días. `null` si el acceso no muestra movimiento. */
  sold30: number | null;
  /** Bajas (merma, daño, degustación…) de los últimos 30 días. */
  written30: number | null;
  /** Días que alcanza el stock al ritmo de venta; `null` si no hubo ventas. */
  coverageDays: number | null;
}

/** Un producto en consignación del seller: lo mismo que ve un proveedor, más la comisión que rige. */
export interface ConsignmentPortalRow extends SupplierPortalRow {
  /** Comisión de la empresa sobre este producto (la propia o la del seller), en puntos base. */
  commissionBps: number | null;
}

export interface ConsignmentPortalSettlement {
  number: number;
  createdAt: Date;
  status: 'CONFIRMED' | 'PAID';
  units: number;
  netSales: number;
  commissionAmount: number;
  adjustmentAmount: number;
  /** Lo que la empresa le paga al seller por esa liquidación. */
  payoutAmount: number;
  paidAt: Date | null;
}

/** La parte de seller del portal: su mercadería, lo vendido sin liquidar y sus liquidaciones. */
export interface ConsignmentPortalView {
  /** Comisión por defecto que se le aplica, en puntos base. */
  commissionBps: number | null;
  summary: StatusCounts;
  rows: ConsignmentPortalRow[];
  /** Vendido y todavía sin liquidar (solo totales: nunca el detalle de los documentos). */
  pending: { units: number; netSales: number; commissionAmount: number; payoutAmount: number };
  /** Liquidaciones generadas, las más recientes primero (las anuladas no se muestran). */
  settlements: ConsignmentPortalSettlement[];
}

export interface SupplierPortalView {
  company: { name: string; rut: string; logoUrl: string | null; phone: string | null; email: string | null };
  supplier: { name: string; rut: string };
  generatedAt: Date;
  showMovement: boolean;
  windowDays: number;
  summary: StatusCounts;
  rows: SupplierPortalRow[];
  /** Solo si el contacto es seller de consignación. */
  consignment: ConsignmentPortalView | null;
}

/** Cada cuánto como máximo se anota el último uso del código (no una escritura por cada vista). */
const LAST_USED_EVERY_MS = 5 * 60_000;

/** Cuántas liquidaciones se muestran al seller. */
const PORTAL_SETTLEMENTS = 24;

async function accessForCode(rawCode: string) {
  const normalized = normalizeSupplierCode(rawCode);
  if (!normalized) return null;
  const access = await prisma.supplierPortalAccess.findUnique({
    where: { codeHash: hashSupplierCode(normalized) },
    select: {
      id: true,
      companyId: true,
      contactId: true,
      showMovement: true,
      lastUsedAt: true,
      contact: { select: { razonSocial: true, nombreFantasia: true, rut: true, isConsignor: true, consignmentCommissionBps: true } },
      company: { select: { businessName: true, rut: true, logoUrl: true, phone: true, email: true, status: true, features: true } },
    },
  });
  // Empresa suspendida o cancelada (solo ACTIVE y TRIAL operan) o sin el módulo de inventario: el portal no existe para el proveedor.
  // Una empresa sin fila de módulos se trata con los valores predeterminados, igual que en el resto de la app.
  if (!access || !(access.company.status === 'ACTIVE' || access.company.status === 'TRIAL') || !toFeatureFlags(access.company.features).hasInventory) return null;
  return access;
}

interface PortalProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  imageUrl: string | null;
  minStock: number;
  stocks: Array<{ quantity: number; warehouse: { name: string } }>;
}

const PORTAL_PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  brand: true,
  unit: true,
  imageUrl: true,
  minStock: true,
  stocks: { select: { quantity: true, warehouse: { select: { name: true } } } },
} as const;

export async function getSupplierPortalView(rawCode: string, now: Date = new Date()): Promise<SupplierPortalView | null> {
  const access = await accessForCode(rawCode);
  if (!access) return null;
  if (!access.lastUsedAt || now.getTime() - access.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    // Anotar el uso nunca debe impedir ver el inventario.
    void prisma.supplierPortalAccess.updateMany({ where: { id: access.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return buildPortalView(access, now);
}

/** De quién es la vista: lo resuelve quien llama (el código del portal o la sesión del Seller Center). */
export interface PortalSubject {
  companyId: string;
  contactId: string;
  showMovement: boolean;
  contact: { razonSocial: string; nombreFantasia: string | null; rut: string; isConsignor: boolean; consignmentCommissionBps: number | null };
  company: { businessName: string; rut: string; logoUrl: string | null; phone: string | null; email: string | null };
}

/**
 * La vista del portal para un contacto ya autorizado: sus productos como proveedor y, si es seller, su
 * mercadería, lo vendido sin liquidar y sus liquidaciones. La comparten el portal con código y el
 * Seller Center; se arma campo por campo.
 */
export async function buildPortalView(access: PortalSubject, now: Date = new Date()): Promise<SupplierPortalView> {
  const { companyId, contactId, showMovement } = access;
  const isConsignor = access.contact.isConsignor;

  const [links, consigned] = await Promise.all([
    prisma.productSupplier.findMany({
      where: { companyId, supplierId: contactId, product: { isActive: true } },
      orderBy: { product: { name: 'asc' } },
      take: 1000,
      select: { lastReceivedAt: true, product: { select: PORTAL_PRODUCT_SELECT } },
    }),
    // Lo que sigue siendo del seller: solo los productos con SU id como dueño, de esta empresa.
    isConsignor
      ? prisma.product.findMany({
          where: { companyId, consignorId: contactId, isActive: true },
          orderBy: { name: 'asc' },
          take: 1000,
          select: { ...PORTAL_PRODUCT_SELECT, consignmentCommissionBps: true },
        })
      : Promise.resolve([]),
  ]);
  const productIds = [...new Set([...links.map((link) => link.product.id), ...consigned.map((product) => product.id)])];

  const since = new Date(now.getTime() - MOVEMENT_WINDOW_DAYS * 24 * 60 * 60_000);
  const [arrivals, outflows] = await Promise.all([
    productIds.length === 0
      ? Promise.resolve([] as Array<{ productId: string; quantity: number; createdAt: Date }>)
      : // Una fila por producto (la llegada más reciente de ESTE proveedor): `DISTINCT ON` usa el índice
        // (empresa, proveedor, fecha) en vez de traer todas las llegadas para filtrarlas en memoria.
        prisma.$queryRaw<Array<{ productId: string; quantity: number; createdAt: Date }>>`
          SELECT DISTINCT ON ("productId") "productId", "quantity", "createdAt"
          FROM "InventoryMovement"
          WHERE "companyId" = ${companyId}
            AND "supplierId" = ${contactId}
            AND "productId" IN (${Prisma.join(productIds)})
            AND "type" IN ('PURCHASE_IN', 'ADJUSTMENT_IN')
          ORDER BY "productId", "createdAt" DESC`,
    showMovement && productIds.length > 0
      ? prisma.inventoryMovement.groupBy({
          by: ['productId', 'type'],
          where: { companyId, productId: { in: productIds }, type: { in: ['SALE_OUT', 'ADJUSTMENT_OUT'] }, createdAt: { gte: since } },
          _sum: { quantity: true },
        })
      : [],
  ]);

  const lastArrival = new Map(arrivals.map((arrival) => [arrival.productId, arrival]));
  const outflow = new Map<string, { sold: number; written: number }>();
  for (const row of outflows) {
    const entry = outflow.get(row.productId) ?? { sold: 0, written: 0 };
    if (row.type === 'SALE_OUT') entry.sold += row._sum.quantity ?? 0;
    else entry.written += row._sum.quantity ?? 0;
    outflow.set(row.productId, entry);
  }

  const toRow = (product: PortalProduct, fallbackReceivedAt: Date | null): SupplierPortalRow => {
    const total = roundQty(product.stocks.reduce((sum, stock) => sum + stock.quantity, 0));
    const arrival = lastArrival.get(product.id);
    const out = outflow.get(product.id);
    const sold = out ? roundQty(out.sold) : 0;
    return {
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      imageUrl: product.imageUrl,
      minStock: product.minStock,
      total,
      status: stockStatus(total, product.minStock),
      byWarehouse: product.stocks
        .map((stock) => ({ warehouse: stock.warehouse.name, quantity: roundQty(stock.quantity) }))
        .sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'es')),
      lastReceivedAt: arrival?.createdAt ?? fallbackReceivedAt,
      lastReceivedQty: arrival ? roundQty(arrival.quantity) : null,
      sold30: showMovement ? sold : null,
      written30: showMovement ? roundQty(out?.written ?? 0) : null,
      coverageDays: showMovement ? coverageDays(total, sold) : null,
    };
  };

  const rows = links.map((link) => toRow(link.product, link.lastReceivedAt));

  // Lo vendido de la mercadería de un seller sale de SUS líneas de venta (con su nombre como dueño en ese momento),
  // no de los movimientos del producto: si el producto cambió de dueño, no se le muestran ventas anteriores a él.
  const soldBySeller = isConsignor && showMovement ? await soldLinesByProduct(companyId, contactId, since) : new Map<string, number>();

  return {
    company: { name: access.company.businessName, rut: access.company.rut, logoUrl: access.company.logoUrl, phone: access.company.phone, email: access.company.email },
    supplier: { name: access.contact.nombreFantasia?.trim() || access.contact.razonSocial, rut: access.contact.rut },
    generatedAt: now,
    showMovement,
    windowDays: MOVEMENT_WINDOW_DAYS,
    summary: countStatuses(rows),
    rows,
    consignment: isConsignor
      ? await buildConsignmentView({
          companyId,
          contactId,
          commissionBps: access.contact.consignmentCommissionBps,
          rows: consigned.map((product) => {
            const row = toRow(product, null);
            const sold = showMovement ? roundQty(soldBySeller.get(product.id) ?? 0) : null;
            return {
              ...row,
              sold30: sold,
              // Las bajas del producto pueden ser anteriores a que fuera de este seller: no se le muestran.
              written30: null,
              coverageDays: sold === null ? null : coverageDays(row.total, sold),
              commissionBps: effectiveCommissionBps(product.consignmentCommissionBps, access.contact.consignmentCommissionBps),
            };
          }),
        })
      : null,
  };
}

/** Unidades vendidas netas (ventas menos devoluciones) de los productos de un seller desde `since`, por producto. */
async function soldLinesByProduct(companyId: string, contactId: string, since: Date): Promise<Map<string, number>> {
  const where = { companyId, consignorId: contactId, productId: { not: null }, document: { status: 'ISSUED' as const, issueDate: { gte: since } } };
  const [sales, returns] = await Promise.all([
    prisma.salesDocumentItem.groupBy({ by: ['productId'], where: { ...where, document: { ...where.document, dteType: { in: ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const } } }, _sum: { quantity: true } }),
    prisma.salesDocumentItem.groupBy({ by: ['productId'], where: { ...where, document: { ...where.document, dteType: 'NOTA_CREDITO_61' as const } }, _sum: { quantity: true } }),
  ]);
  const map = new Map<string, number>();
  for (const row of sales) if (row.productId) map.set(row.productId, (map.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  for (const row of returns) if (row.productId) map.set(row.productId, (map.get(row.productId) ?? 0) - (row._sum.quantity ?? 0));
  return map;
}

/** Lo vendido sin liquidar (solo totales) y las liquidaciones del seller, sin anuladas ni detalle de documentos. */
async function buildConsignmentView(input: { companyId: string; contactId: string; commissionBps: number | null; rows: ConsignmentPortalRow[] }): Promise<ConsignmentPortalView> {
  const { companyId, contactId } = input;
  const [pendingBySeller, settlements] = await Promise.all([
    loadPendingBySeller(prisma, companyId, contactId),
    prisma.sellerSettlement.findMany({
      where: { companyId, consignorId: contactId, status: { not: 'VOIDED' } },
      orderBy: { number: 'desc' },
      take: PORTAL_SETTLEMENTS,
      select: { number: true, createdAt: true, status: true, units: true, netSales: true, commissionAmount: true, adjustmentAmount: true, payoutAmount: true, paidAt: true },
    }),
  ]);
  const totals = settlementTotals(pendingBySeller.get(contactId) ?? []);
  return {
    commissionBps: input.commissionBps,
    summary: countStatuses(input.rows),
    rows: input.rows,
    pending: { units: totals.units, netSales: totals.netSales, commissionAmount: totals.commissionAmount, payoutAmount: totals.linesPayout },
    settlements: settlements.map((settlement) => ({ ...settlement, status: settlement.status === 'PAID' ? 'PAID' : 'CONFIRMED' })),
  };
}
