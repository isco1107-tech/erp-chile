import type { Contact } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiError, apiOk, apiValidationError, authenticateApiRequest, pagination, type ApiContext } from '@/lib/api/public-api';
import { contactCreateSchema } from '@/modules/contacts/schema';
import { createContact } from '@/modules/contacts/services/contacts.service';
import { isUniqueConstraintError } from '@/lib/prisma-errors';

export const dynamic = 'force-dynamic';

/** Solo los campos que la API promete: nada interno (límites internos, ids de otras tablas). */
function serialize(contact: Contact) {
  return {
    id: contact.id,
    rut: contact.rut,
    razonSocial: contact.razonSocial,
    nombreFantasia: contact.nombreFantasia,
    giro: contact.giro,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    comuna: contact.comuna,
    isCustomer: contact.isCustomer,
    isSupplier: contact.isSupplier,
    createdAt: contact.createdAt,
  };
}

export async function GET(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'contacts:read');
    const url = new URL(req.url);
    const { skip, take, page, pageSize } = pagination(url);
    const search = url.searchParams.get('search')?.trim();
    const type = url.searchParams.get('type');
    const where = {
      companyId: ctx.companyId,
      ...(type === 'customers' ? { isCustomer: true } : type === 'suppliers' ? { isSupplier: true } : {}),
      ...(search
        ? { OR: [{ razonSocial: { contains: search, mode: 'insensitive' as const } }, { rutClean: { contains: search.replace(/[^0-9kK]/g, '').toUpperCase() } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([prisma.contact.findMany({ where, skip, take, orderBy: { razonSocial: 'asc' } }), prisma.contact.count({ where })]);
    return apiOk(rows.map(serialize), { meta: { page, pageSize, total } });
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/contacts', companyId: ctx?.companyId });
  }
}

export async function POST(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'contacts:write');
    const body: unknown = await req.json().catch(() => null);
    const parsed = contactCreateSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error.issues);
    try {
      const contact = await createContact(ctx.companyId, parsed.data);
      return apiOk(serialize(contact), { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error('Ya existe un contacto con ese RUT');
      throw error;
    }
  } catch (error) {
    return apiError(error, { route: 'POST /api/v1/contacts', companyId: ctx?.companyId });
  }
}
