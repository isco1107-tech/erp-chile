import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MOVEMENT_WINDOW_DAYS, countStatuses, coverageDays, roundQty, stockStatus, type StatusCounts, type StockStatus } from '@/lib/supplier-portal/analysis';
import { formatSupplierCode, hashSupplierCode, newSupplierCode, normalizeSupplierCode, supplierCodeHint } from '@/lib/supplier-portal/code';

/**
 * Portal de inventario del proveedor (`/proveedor`): cada proveedor entra con SU código y ve
 * cuánto le queda en la bodega de los productos que surte, para analizar y reponer.
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
  products: Array<{ id: string; sku: string; name: string; unit: string; stock: number; lastReceivedAt: Date | null }>;
}

async function requireSupplier(companyId: string, contactId: string): Promise<{ id: string; razonSocial: string }> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId, isSupplier: true }, select: { id: true, razonSocial: true } });
  if (!contact) throw new SupplierPortalError('El contacto no existe o no está marcado como proveedor');
  return contact;
}

export async function getSupplierPortalAdmin(companyId: string, contactId: string): Promise<SupplierPortalAdmin> {
  const [access, links] = await Promise.all([
    prisma.supplierPortalAccess.findFirst({ where: { companyId, contactId }, select: { codeHint: true, createdAt: true, lastUsedAt: true, showMovement: true } }),
    prisma.productSupplier.findMany({
      where: { companyId, supplierId: contactId },
      orderBy: { product: { name: 'asc' } },
      take: 500,
      select: { lastReceivedAt: true, product: { select: { id: true, sku: true, name: true, unit: true, stocks: { select: { quantity: true } } } } },
    }),
  ]);
  return {
    access: access ? { hint: access.codeHint, createdAt: access.createdAt, lastUsedAt: access.lastUsedAt, showMovement: access.showMovement } : null,
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
  await requireSupplier(companyId, contactId);
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

export interface SupplierPortalView {
  company: { name: string; rut: string; logoUrl: string | null; phone: string | null; email: string | null };
  supplier: { name: string; rut: string };
  generatedAt: Date;
  showMovement: boolean;
  windowDays: number;
  summary: StatusCounts;
  rows: SupplierPortalRow[];
}

/** Cada cuánto como máximo se anota el último uso del código (no una escritura por cada vista). */
const LAST_USED_EVERY_MS = 5 * 60_000;

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
      contact: { select: { razonSocial: true, nombreFantasia: true, rut: true } },
      company: { select: { businessName: true, rut: true, logoUrl: true, phone: true, email: true, status: true, features: { select: { hasInventory: true } } } },
    },
  });
  // Empresa suspendida o cancelada (solo ACTIVE y TRIAL operan) o sin el módulo de inventario: el portal no existe para el proveedor.
  if (!access || !(access.company.status === 'ACTIVE' || access.company.status === 'TRIAL') || !access.company.features?.hasInventory) return null;
  return access;
}

export async function getSupplierPortalView(rawCode: string, now: Date = new Date()): Promise<SupplierPortalView | null> {
  const access = await accessForCode(rawCode);
  if (!access) return null;
  const { companyId, contactId, showMovement } = access;

  if (!access.lastUsedAt || now.getTime() - access.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    // Anotar el uso nunca debe impedir ver el inventario.
    void prisma.supplierPortalAccess.updateMany({ where: { id: access.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }

  const links = await prisma.productSupplier.findMany({
    where: { companyId, supplierId: contactId, product: { isActive: true } },
    orderBy: { product: { name: 'asc' } },
    take: 1000,
    select: {
      lastReceivedAt: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          brand: true,
          unit: true,
          imageUrl: true,
          minStock: true,
          stocks: { select: { quantity: true, warehouse: { select: { name: true } } } },
        },
      },
    },
  });
  const productIds = links.map((link) => link.product.id);

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

  const rows: SupplierPortalRow[] = links.map((link) => {
    const { product } = link;
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
      lastReceivedAt: arrival?.createdAt ?? link.lastReceivedAt,
      lastReceivedQty: arrival ? roundQty(arrival.quantity) : null,
      sold30: showMovement ? sold : null,
      written30: showMovement ? roundQty(out?.written ?? 0) : null,
      coverageDays: showMovement ? coverageDays(total, sold) : null,
    };
  });

  return {
    company: { name: access.company.businessName, rut: access.company.rut, logoUrl: access.company.logoUrl, phone: access.company.phone, email: access.company.email },
    supplier: { name: access.contact.nombreFantasia?.trim() || access.contact.razonSocial, rut: access.contact.rut },
    generatedAt: now,
    showMovement,
    windowDays: MOVEMENT_WINDOW_DAYS,
    summary: countStatuses(rows),
    rows,
  };
}
