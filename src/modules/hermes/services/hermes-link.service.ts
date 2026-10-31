import 'server-only';

import { prisma } from '@/lib/prisma';
import { calculateTotal } from '@/lib/chile/tax';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import { isUniqueConstraintError, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { createAuditLog } from '@/lib/auth/audit';
import { boletaTypeFor, generateHermesKey, hashHermesKey, hermesKeyPrefix, type HermesSaleInput } from '@/lib/hermes/link';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { getOrCreateGenericCustomer } from '@/modules/pos/services/pos.service';

/**
 * Conexión con Hermes (la agenda del ecosistema Aether; ADR 0008 de Hermes y plan H5-P).
 *
 * Reglas:
 *  - La empresa sale SIEMPRE de la llave (`HermesLink.keyHash`), nunca del cuerpo.
 *  - Solo empresas que operan (ACTIVE/TRIAL) y con Inventario contratado.
 *  - Catálogo: nombre, SKU, precio con IVA del catálogo y stock de la bodega de la conexión.
 *    Nunca costos ni PMP.
 *  - Venta: boleta (39, o 41 si todo es exento) por `createSalesDocument`, el mismo camino de la
 *    tienda en línea: precio e `isExempt` del catálogo, kardex al PMP, asiento y cobro en
 *    Tesorería. Stock negativo según `CompanySettings.allowNegativeStock`. La clave de Hermes es
 *    la de idempotencia: reenviar la misma venta devuelve la misma boleta.
 */

export class HermesLinkError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type HermesLinkContext = { linkId: string; companyId: string; warehouseId: string };

export async function resolveHermesLink(key: string): Promise<HermesLinkContext | null> {
  const link = await prisma.hermesLink.findUnique({
    where: { keyHash: hashHermesKey(key) },
    select: { id: true, companyId: true, warehouseId: true, company: { select: { status: true, features: { select: { hasInventory: true } } } } },
  });
  if (!link || !isOperationalTenant(link.company.status) || !link.company.features?.hasInventory) return null;
  // Último uso: informativo; nunca frena la operación.
  await prisma.hermesLink.updateMany({ where: { id: link.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { linkId: link.id, companyId: link.companyId, warehouseId: link.warehouseId };
}

export type HermesProduct = { id: string; sku: string; name: string; unit: string; isExempt: boolean; grossPrice: number; stock: number | null };

export async function listHermesProducts(ctx: HermesLinkContext, query: { q?: string | undefined; limit: number }): Promise<HermesProduct[]> {
  const q = query.q?.trim();
  const products = await prisma.product.findMany({
    where: {
      companyId: ctx.companyId,
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: q }] } : {}),
    },
    select: {
      id: true, sku: true, name: true, unit: true, isExempt: true, netPrice: true, isTrackable: true,
      stocks: { where: { companyId: ctx.companyId, warehouseId: ctx.warehouseId }, select: { quantity: true } },
    },
    orderBy: { name: 'asc' },
    take: query.limit,
  });
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    isExempt: p.isExempt,
    grossPrice: p.isExempt ? p.netPrice : calculateTotal(p.netPrice),
    stock: p.isTrackable ? (p.stocks[0]?.quantity ?? 0) : null,
  }));
}

export type HermesSaleResult = { salesDocumentId: string; folio: number | null; dteType: string; totalAmount: number; replayed: boolean };

export async function createHermesSale(ctx: HermesLinkContext, input: HermesSaleInput): Promise<HermesSaleResult> {
  const idempotencyKey = `hermes:${input.idempotencyKey}`;
  const previous = await prisma.salesDocument.findUnique({
    where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey } },
    select: { id: true, folio: true, dteType: true, totalAmount: true },
  });
  if (previous) return { salesDocumentId: previous.id, folio: previous.folio, dteType: previous.dteType, totalAmount: previous.totalAmount, replayed: true };

  const products = await prisma.product.findMany({
    where: { companyId: ctx.companyId, id: { in: input.items.map((i) => i.productId) } },
    select: { id: true, sku: true, name: true, isExempt: true, netPrice: true, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) throw new HermesLinkError('Un producto de la venta no existe en el ERP de esta empresa.', 422);
    if (!p.isActive) throw new HermesLinkError(`«${p.name}» está desactivado en el ERP.`, 422);
  }

  const lines = input.items.map((item) => ({ item, product: byId.get(item.productId)! }));
  const dteType = boletaTypeFor(lines.map((l) => l.product));
  try {
    const contactId = await getOrCreateGenericCustomer(prisma, ctx.companyId);
    const document = await createSalesDocument(
      ctx.companyId,
      {
        contactId,
        warehouseId: ctx.warehouseId,
        dteType,
        paymentMethod: input.paymentMethod,
        notes: 'Hermes · venta de productos en la caja',
        idempotencyKey,
        items: lines.map(({ item, product }) => ({
          productId: product.id,
          sku: product.sku,
          description: product.name,
          quantity: item.quantity,
          unitPrice: product.netPrice,
          isExempt: product.isExempt,
        })),
      },
      'ISSUED'
    );
    await createAuditLog({
      companyId: ctx.companyId,
      userEmail: 'hermes',
      action: 'CREATE',
      entity: 'SalesDocument',
      entityId: document.id,
      metadata: { origen: 'hermes', linkId: ctx.linkId, dteType, productos: lines.length },
    });
    return { salesDocumentId: document.id, folio: document.folio, dteType, totalAmount: document.totalAmount, replayed: false };
  } catch (error) {
    // Dos envíos de la misma venta a la vez: gana el primero y el segundo devuelve esa boleta.
    if (isUniqueConstraintError(error)) {
      const again = await prisma.salesDocument.findUnique({
        where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey } },
        select: { id: true, folio: true, dteType: true, totalAmount: true },
      });
      if (again) return { salesDocumentId: again.id, folio: again.folio, dteType: again.dteType, totalAmount: again.totalAmount, replayed: true };
    }
    // Las reglas de negocio ("Stock insuficiente en …") vuelven en español tal cual; un error
    // del driver se traduce y toFriendlyErrorMessage manda su detalle a observabilidad.
    throw new HermesLinkError(toFriendlyErrorMessage(error), 422);
  }
}

// ── Configuración (Configuración → Empresa) ──────────────────────────

export type HermesLinkStatus = { connected: boolean; keyPrefix: string | null; warehouseId: string | null; warehouseName: string | null; createdAt: Date | null; lastUsedAt: Date | null };

export async function getHermesLinkStatus(companyId: string): Promise<HermesLinkStatus> {
  const link = await prisma.hermesLink.findUnique({
    where: { companyId },
    select: { keyPrefix: true, warehouseId: true, createdAt: true, lastUsedAt: true, warehouse: { select: { name: true } } },
  });
  return link
    ? { connected: true, keyPrefix: link.keyPrefix, warehouseId: link.warehouseId, warehouseName: link.warehouse.name, createdAt: link.createdAt, lastUsedAt: link.lastUsedAt }
    : { connected: false, keyPrefix: null, warehouseId: null, warehouseName: null, createdAt: null, lastUsedAt: null };
}

/** Genera (o regenera) la llave: la anterior deja de servir al instante. Devuelve la llave UNA vez. */
export async function issueHermesKey(companyId: string, warehouseId: string, userId: string): Promise<string> {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
  if (!warehouse) throw new HermesLinkError('Esa bodega no es de tu empresa.', 404);
  const key = generateHermesKey();
  const data = { keyHash: hashHermesKey(key), keyPrefix: hermesKeyPrefix(key), warehouseId, createdById: userId, createdAt: new Date(), lastUsedAt: null };
  await prisma.hermesLink.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
  return key;
}

export async function changeHermesWarehouse(companyId: string, warehouseId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
  if (!warehouse) throw new HermesLinkError('Esa bodega no es de tu empresa.', 404);
  const r = await prisma.hermesLink.updateMany({ where: { companyId }, data: { warehouseId } });
  if (r.count === 0) throw new HermesLinkError('Primero genera la llave de conexión.', 404);
}

export async function revokeHermesKey(companyId: string): Promise<boolean> {
  const r = await prisma.hermesLink.deleteMany({ where: { companyId } });
  return r.count > 0;
}
