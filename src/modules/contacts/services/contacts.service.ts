import { prisma } from '@/lib/prisma';
import type { Contact, Prisma } from '@prisma/client';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { normalizeAccountNumber } from '@/lib/treasury/banks';
import { isValidCommissionBps } from '@/lib/consignment/commission';
import { loadPendingBySeller } from '@/modules/inventory/services/consignment-settlement.service';
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
  | 'isConsignor'
  | 'consignmentCommissionBps'
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
  isConsignor: true,
  consignmentCommissionBps: true,
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
  options?: { query?: string; type?: 'customers' | 'suppliers' | 'consignors'; page?: number; pageSize?: number }
): Promise<ListContactsResult> {
  const where: Prisma.ContactWhereInput = { companyId };
  const trimmed = options?.query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ razonSocial: like }, { nombreFantasia: like }, { rut: like }, { rutClean: like }];
  }
  if (options?.type === 'customers') where.isCustomer = true;
  if (options?.type === 'suppliers') where.isSupplier = true;
  if (options?.type === 'consignors') where.isConsignor = true;

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

/** Un seller necesita su comisión: sin ella no se sabe cuánto se le debe al vender, y no se inventa una. */
function assertConsignorCommission(isConsignor: boolean, commissionBps: number | null | undefined): void {
  if (isConsignor && !isValidCommissionBps(commissionBps)) {
    throw new Error('Indica la comisión del seller (un porcentaje entre 0 y 100)');
  }
}

export async function createContact(companyId: string, input: ContactCreateInput): Promise<Contact> {
  const rutClean = cleanRut(input.rut);
  if (!validateRut(rutClean)) throw new Error('RUT inválido');
  await assertPriceListInCompany(companyId, input.priceListId);
  assertConsignorCommission(input.isConsignor ?? false, input.consignmentCommissionBps);

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
      isConsignor: input.isConsignor ?? false,
      consignmentCommissionBps: input.isConsignor ? input.consignmentCommissionBps : undefined,
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

/**
 * Lo que cambia en la condición de seller al editar un contacto, validado contra lo que ya tiene
 * guardado (el esquema de edición es parcial). Dejar de ser seller no se permite mientras tenga
 * productos en consignación: quedarían sin dueño y pasarían a ser "propios" sin que nadie lo decida.
 */
async function resolveConsignorUpdate(
  companyId: string,
  id: string,
  input: ContactUpdateInput
): Promise<{ isConsignor?: boolean; consignmentCommissionBps?: number | null }> {
  if (input.isConsignor === undefined && input.consignmentCommissionBps === undefined) return {};
  const current = await prisma.contact.findFirst({ where: { companyId, id }, select: { isConsignor: true, consignmentCommissionBps: true } });
  if (!current) throw new Error('Contacto no encontrado');

  const isConsignor = input.isConsignor ?? current.isConsignor;
  const commissionBps = input.consignmentCommissionBps === undefined ? current.consignmentCommissionBps : input.consignmentCommissionBps;
  assertConsignorCommission(isConsignor, commissionBps);

  if (current.isConsignor && !isConsignor) {
    const [products, pending, unpaid] = await Promise.all([
      prisma.product.count({ where: { companyId, consignorId: id } }),
      loadPendingBySeller(prisma, companyId, id),
      prisma.consignmentSettlement.count({ where: { companyId, consignorId: id, status: 'CONFIRMED' } }),
    ]);
    if (products > 0) {
      throw new Error(`Este seller tiene ${products} producto${products === 1 ? '' : 's'} en consignación. Cambia el dueño de esos productos antes de quitarle la condición de seller`);
    }
    // Sin la condición de seller no se le puede liquidar: lo que se le debe quedaría invisible.
    if ((pending.get(id)?.length ?? 0) > 0 || unpaid > 0) {
      throw new Error('Este seller tiene ventas sin liquidar o liquidaciones sin pagar. Liquídalas y págalas antes de quitarle la condición de seller');
    }
  }
  return { isConsignor, consignmentCommissionBps: isConsignor ? commissionBps : null };
}

export async function updateContact(companyId: string, id: string, input: ContactUpdateInput): Promise<Contact> {
  await assertPriceListInCompany(companyId, input.priceListId);
  const consignment = await resolveConsignorUpdate(companyId, id, input);
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
    ...consignment,
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
  const [consigned, settlements, soldLines] = await Promise.all([
    prisma.product.count({ where: { companyId, consignorId: id } }),
    prisma.consignmentSettlement.count({ where: { companyId, consignorId: id } }),
    prisma.salesDocumentItem.count({ where: { companyId, consignorId: id } }),
  ]);
  if (consigned > 0) throw new Error('Este seller tiene productos en consignación. Cambia el dueño de esos productos antes de eliminarlo');
  if (settlements > 0) throw new Error('Este seller tiene liquidaciones registradas, no se puede eliminar');
  // Aunque ya no tenga productos: lo que se le debe por sus ventas vive en esas líneas y desaparecería con él.
  if (soldLines > 0) throw new Error('Este seller tiene ventas de su mercadería registradas: se conserva para que su historial y lo que se le debe sigan visibles');
  const result = await prisma.contact.deleteMany({ where: { companyId, id } });
  if (result.count === 0) throw new Error('Contacto no encontrado');
}
