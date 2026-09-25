import { prisma } from '@/lib/prisma';
import type { Contact, Prisma } from '@prisma/client';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { normalizeAccountNumber } from '@/lib/treasury/banks';
import type { ContactCreateInput, ContactUpdateInput } from '../schema';

export async function listContacts(companyId: string, query?: string): Promise<Contact[]> {
  const where: Prisma.ContactWhereInput = { companyId };
  const trimmed = query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ razonSocial: like }, { nombreFantasia: like }, { rut: like }, { rutClean: like }];
  }
  return prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
}

/**
 * Fila de la tabla de `ContactsClient`: sin `companyId`/`rutClean` (uso
 * interno) ni `createdAt`/`updatedAt` (no se pintan). Incluye igual todos los
 * campos que `ContactForm` necesita para poder editar directo desde la fila,
 * sin pasar por `getContactAction`.
 */
export type ContactListItem = Pick<
  Contact,
  | 'id'
  | 'rut'
  | 'razonSocial'
  | 'nombreFantasia'
  | 'giro'
  | 'email'
  | 'phone'
  | 'address'
  | 'comuna'
  | 'region'
  | 'isCustomer'
  | 'isSupplier'
  | 'creditLimit'
  | 'creditDays'
  | 'priceListId'
  | 'bankCode'
  | 'bankAccountType'
  | 'bankAccountNumber'
  | 'paymentNoticeEmail'
>;

export interface ListContactsResult {
  items: ContactListItem[];
  total: number;
}

const CONTACTS_DEFAULT_PAGE_SIZE = 25;

const CONTACT_LIST_ITEM_SELECT = {
  id: true,
  rut: true,
  razonSocial: true,
  nombreFantasia: true,
  giro: true,
  email: true,
  phone: true,
  address: true,
  comuna: true,
  region: true,
  isCustomer: true,
  isSupplier: true,
  priceListId: true,
  creditLimit: true,
  creditDays: true,
  bankCode: true,
  bankAccountType: true,
  bankAccountNumber: true,
  paymentNoticeEmail: true,
} satisfies Prisma.ContactSelect;

/**
 * Versión paginada server-side de `listContacts`, exclusiva para la tabla de
 * gestión (`ContactsClient`). `listContacts` (sin paginar, tope 200) se deja
 * intacta a propósito: la siguen usando varios selectores de contacto
 * (`SalesDocumentForm`, `PurchaseDocumentForm`, `PurchaseOrderForm`,
 * `CommandMenu`) que esperan el arreglo completo de `Contact`, no
 * `{ items, total }` — cambiarle el contrato habría roto esas pantallas,
 * fuera del alcance de este cambio.
 */
export async function listContactsPage(
  companyId: string,
  options?: { query?: string; type?: 'customers' | 'suppliers'; page?: number; pageSize?: number }
): Promise<ListContactsResult> {
  const where: Prisma.ContactWhereInput = { companyId };
  const trimmed = options?.query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ razonSocial: like }, { nombreFantasia: like }, { rut: like }, { rutClean: like }];
  }
  if (options?.type === 'customers') where.isCustomer = true;
  if (options?.type === 'suppliers') where.isSupplier = true;

  const page = options?.page && options.page > 0 ? options.page : 1;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : CONTACTS_DEFAULT_PAGE_SIZE;

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: CONTACT_LIST_ITEM_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return { items, total };
}

export async function getContact(companyId: string, id: string): Promise<Contact | null> {
  return prisma.contact.findFirst({ where: { companyId, id } });
}

/** La lista de precios asignada debe ser de la misma empresa. */
async function assertPriceListInCompany(companyId: string, priceListId: string | null | undefined): Promise<void> {
  if (!priceListId) return;
  const list = await prisma.priceList.findFirst({ where: { id: priceListId, companyId }, select: { id: true } });
  if (!list) throw new Error('Lista de precios no encontrada');
}

export async function createContact(companyId: string, input: ContactCreateInput): Promise<Contact> {
  const rutClean = cleanRut(input.rut);
  if (!validateRut(rutClean)) throw new Error('RUT inválido');
  await assertPriceListInCompany(companyId, input.priceListId);

  return prisma.contact.create({
    data: {
      companyId,
      rut: formatRut(rutClean),
      rutClean,
      razonSocial: input.razonSocial,
      nombreFantasia: input.nombreFantasia || undefined,
      giro: input.giro || undefined,
      email: input.email || undefined,
      phone: input.phone || undefined,
      address: input.address || undefined,
      comuna: input.comuna || undefined,
      region: input.region || undefined,
      isCustomer: input.isCustomer ?? true,
      isSupplier: input.isSupplier ?? false,
      creditLimit: input.creditLimit ?? undefined,
      creditDays: input.creditDays ?? undefined,
      priceListId: input.priceListId ?? undefined,
      bankCode: input.bankCode ?? undefined,
      bankAccountType: input.bankAccountType ?? undefined,
      bankAccountNumber: input.bankAccountNumber ? normalizeAccountNumber(input.bankAccountNumber) : undefined,
      paymentNoticeEmail: input.paymentNoticeEmail || undefined,
    },
  });
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

export async function updateContact(companyId: string, id: string, input: ContactUpdateInput): Promise<Contact> {
  await assertPriceListInCompany(companyId, input.priceListId);
  const data: Prisma.ContactUpdateManyMutationInput & { priceListId?: string | null } = {
    razonSocial: input.razonSocial,
    nombreFantasia: emptyToNull(input.nombreFantasia),
    giro: emptyToNull(input.giro),
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    address: emptyToNull(input.address),
    comuna: emptyToNull(input.comuna),
    region: emptyToNull(input.region),
    isCustomer: input.isCustomer,
    isSupplier: input.isSupplier,
    creditLimit: input.creditLimit,
    creditDays: input.creditDays,
    priceListId: input.priceListId,
    bankCode: input.bankCode,
    bankAccountType: input.bankAccountType,
    bankAccountNumber: input.bankAccountNumber === undefined ? undefined : input.bankAccountNumber ? normalizeAccountNumber(input.bankAccountNumber) : null,
    paymentNoticeEmail: input.paymentNoticeEmail === undefined ? undefined : input.paymentNoticeEmail || null,
  };

  if (input.rut) {
    const rutClean = cleanRut(input.rut);
    if (!validateRut(rutClean)) throw new Error('RUT inválido');
    data.rut = formatRut(rutClean);
    data.rutClean = rutClean;
  }

  const result = await prisma.contact.updateMany({ where: { companyId, id }, data });
  if (result.count === 0) throw new Error('Contacto no encontrado');

  const updated = await getContact(companyId, id);
  if (!updated) throw new Error('Contacto no encontrado');
  return updated;
}

export async function deleteContact(companyId: string, id: string): Promise<void> {
  const result = await prisma.contact.deleteMany({ where: { companyId, id } });
  if (result.count === 0) throw new Error('Contacto no encontrado');
}
