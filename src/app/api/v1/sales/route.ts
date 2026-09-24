import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, apiOk, apiValidationError, authenticateApiRequest, pagination, type ApiContext } from '@/lib/api/public-api';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { PAYMENT_METHODS, salesDocumentCreateSchema } from '@/modules/sales/schema';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { serializeSale } from './serialize';

export const dynamic = 'force-dynamic';

const API_DTE_TYPES = ['BOLETA_39', 'BOLETA_EXENTA_41', 'FACTURA_33', 'FACTURA_EXENTA_34', 'COTIZACION'] as const;
const CONSUMIDOR_FINAL_RUT = '66666666-6';

const apiSaleSchema = z.object({
  customer: z
    .object({
      contactId: z.string().min(1).optional(),
      rut: z.string().min(3).optional(),
      razonSocial: z.string().trim().min(2).max(200).optional(),
      email: z.string().email().optional(),
      giro: z.string().max(200).optional(),
      address: z.string().max(300).optional(),
      comuna: z.string().max(100).optional(),
    })
    .optional(),
  dteType: z.enum(API_DTE_TYPES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  status: z.enum(['ISSUED', 'DRAFT']).default('ISSUED'),
  warehouseId: z.string().min(1).optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).optional(),
        sku: z.string().min(1).optional(),
        description: z.string().trim().min(1).max(300).optional(),
        quantity: z.number().positive(),
        /** Precio NETO unitario (sin IVA), en pesos enteros. Si se omite y hay producto, se usa su precio neto de catálogo. */
        unitPrice: z.number().int().min(0).optional(),
        /** Solo para líneas sin producto: con producto, la exención la decide el catálogo. */
        isExempt: z.boolean().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
      })
    )
    .min(1)
    .max(200),
});

type ApiSaleInput = z.infer<typeof apiSaleSchema>;

/** Cliente de la venta: por id, por RUT (creándolo si se mandan sus datos y la llave puede), o consumidor final en boletas. */
async function resolveCustomer(ctx: ApiContext, input: ApiSaleInput): Promise<string> {
  const customer = input.customer;
  if (customer?.contactId) {
    const found = await prisma.contact.findFirst({ where: { id: customer.contactId, companyId: ctx.companyId }, select: { id: true } });
    if (!found) throw new ApiError('customer.contactId no existe en esta empresa', 422, 'unknown_customer');
    return found.id;
  }
  const isBoleta = input.dteType === 'BOLETA_39' || input.dteType === 'BOLETA_EXENTA_41';
  const rawRut = customer?.rut ?? (isBoleta ? CONSUMIDOR_FINAL_RUT : null);
  if (!rawRut) throw new ApiError('Una factura necesita cliente: envía customer.contactId o customer.rut', 422, 'missing_customer');

  const rutClean = cleanRut(rawRut);
  if (!validateRut(rutClean)) throw new ApiError('customer.rut no es un RUT válido', 422, 'invalid_rut');
  const existing = await prisma.contact.findFirst({ where: { companyId: ctx.companyId, rutClean }, select: { id: true } });
  if (existing) return existing.id;

  const isConsumidorFinal = rutClean === cleanRut(CONSUMIDOR_FINAL_RUT);
  if (!isConsumidorFinal) {
    if (!customer?.razonSocial) throw new ApiError('El cliente no existe: envía customer.razonSocial para crearlo', 422, 'unknown_customer');
    if (!ctx.scopes.includes('contacts:write')) throw new ApiError('Para crear clientes la llave necesita el permiso "contacts:write"', 403, 'insufficient_scope');
  }
  const created = await prisma.contact.create({
    data: {
      companyId: ctx.companyId,
      rut: formatRut(rutClean),
      rutClean,
      razonSocial: isConsumidorFinal ? 'Consumidor final' : customer!.razonSocial!,
      email: customer?.email ?? null,
      giro: customer?.giro ?? null,
      address: customer?.address ?? null,
      comuna: customer?.comuna ?? null,
      isCustomer: true,
    },
    select: { id: true },
  });
  return created.id;
}

export async function GET(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'sales:read');
    const url = new URL(req.url);
    const { skip, take, page, pageSize } = pagination(url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const status = url.searchParams.get('status');
    const where: Prisma.SalesDocumentWhereInput = {
      companyId: ctx.companyId,
      ...(status === 'ISSUED' || status === 'DRAFT' || status === 'CANCELLED' ? { status } : {}),
      ...(url.searchParams.get('contactId') ? { contactId: url.searchParams.get('contactId')! } : {}),
      ...(from || to ? { issueDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    };
    if ((from && Number.isNaN(new Date(from).getTime())) || (to && Number.isNaN(new Date(to).getTime()))) {
      throw new ApiError('from/to deben ser fechas ISO (AAAA-MM-DD)', 400, 'invalid_date');
    }
    const [rows, total] = await Promise.all([
      prisma.salesDocument.findMany({ where, skip, take, orderBy: { issueDate: 'desc' }, include: { contact: { select: { id: true, rut: true, razonSocial: true } } } }),
      prisma.salesDocument.count({ where }),
    ]);
    return apiOk(rows.map((doc) => serializeSale(doc)), { meta: { page, pageSize, total } });
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/sales', companyId: ctx?.companyId });
  }
}

/**
 * Crea un documento de venta (por ejemplo, la boleta de un pedido de la tienda
 * en línea). Pasa por el mismo servicio que el formulario: folio/CAF, timbre,
 * stock, asiento y cobro al contado. `Idempotency-Key` es obligatoria al
 * emitir: reintentar con la misma llave devuelve el mismo documento.
 */
export async function POST(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'sales:write');
    const idempotencyHeader = req.headers.get('idempotency-key')?.trim() ?? '';
    const body: unknown = await req.json().catch(() => null);
    const parsed = apiSaleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error.issues);
    const input = parsed.data;
    if (input.status === 'ISSUED' && !idempotencyHeader) {
      throw new ApiError('Envía la cabecera "Idempotency-Key" (p. ej. el N° de pedido) para emitir sin riesgo de duplicar', 400, 'missing_idempotency_key');
    }
    if (idempotencyHeader.length > 100) throw new ApiError('Idempotency-Key admite hasta 100 caracteres', 400, 'invalid_idempotency_key');

    const contactId = await resolveCustomer(ctx, input);

    const warehouse = input.warehouseId
      ? await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId: ctx.companyId }, select: { id: true } })
      : await prisma.warehouse.findFirst({ where: { companyId: ctx.companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
    if (!warehouse) throw new ApiError('warehouseId no existe (o la empresa no tiene bodegas)', 422, 'unknown_warehouse');

    const skus = [...new Set(input.items.map((item) => item.sku).filter((sku): sku is string => Boolean(sku)))];
    const ids = [...new Set(input.items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
    const products = await prisma.product.findMany({
      where: { companyId: ctx.companyId, OR: [{ sku: { in: skus } }, { id: { in: ids } }] },
      select: { id: true, sku: true, name: true, netPrice: true },
    });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const byId = new Map(products.map((p) => [p.id, p]));

    const items = input.items.map((item, index) => {
      const product = item.productId ? byId.get(item.productId) : item.sku ? bySku.get(item.sku) : undefined;
      if ((item.productId || item.sku) && !product) throw new ApiError(`items[${index}]: producto no encontrado (${item.sku ?? item.productId})`, 422, 'unknown_product');
      const unitPrice = item.unitPrice ?? product?.netPrice;
      if (unitPrice === undefined) throw new ApiError(`items[${index}]: falta unitPrice`, 422, 'missing_price');
      const description = item.description ?? product?.name;
      if (!description) throw new ApiError(`items[${index}]: falta description`, 422, 'missing_description');
      return { productId: product?.id, sku: product?.sku, description, quantity: item.quantity, unitPrice, isExempt: product ? undefined : item.isExempt, discountPercent: item.discountPercent };
    });

    const salesInput = salesDocumentCreateSchema.safeParse({
      contactId,
      warehouseId: warehouse.id,
      dteType: input.dteType,
      paymentMethod: input.paymentMethod,
      dueDate: input.dueDate,
      notes: input.notes,
      // Espacio de nombres por llave: dos integraciones distintas pueden usar el mismo N° de pedido.
      idempotencyKey: idempotencyHeader ? `api:${ctx.keyId}:${idempotencyHeader}` : undefined,
      items,
    });
    if (!salesInput.success) return apiValidationError(salesInput.error.issues);

    const document = await createSalesDocument(ctx.companyId, salesInput.data, input.status);
    const full = await prisma.salesDocument.findFirstOrThrow({
      where: { id: document.id, companyId: ctx.companyId },
      include: { contact: { select: { id: true, rut: true, razonSocial: true } }, items: true },
    });
    return apiOk(serializeSale(full), { status: 201 });
  } catch (error) {
    return apiError(error, { route: 'POST /api/v1/sales', companyId: ctx?.companyId });
  }
}
