import 'server-only';

import type { Prisma } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import {
  sellerInvitationSchema,
  type SellerInvitationInput,
  type SellerInvitationDelivery,
} from '@/lib/supplier-portal/identity';
import { prisma } from '@/lib/prisma';
import { getAppUrl, sendEmail } from '@/lib/email/mailer';
import { buildSupplierAccountInviteEmail } from '@/lib/email/templates';
import {
  INVITE_TTL_DAYS,
  hashAccountToken,
  newAccountToken,
} from '@/lib/supplier-portal/accounts';
import { SellerCenterError } from '@/lib/supplier-portal/errors';

/**
 * Seller Center desde la ficha del seller: la empresa invita a las personas del seller y
 * puede quitarles el acceso cuando quiera. Todo filtra por `companyId`; de la persona (que es de
 * la plataforma) solo se ve su correo y el nombre con que ESTA empresa la invitó, nunca si tiene
 * accesos en otras empresas.
 */

export type MembershipStatus = 'PENDING' | 'EXPIRED' | 'ACTIVE' | 'INACTIVE';

export interface SupplierAccountRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: MembershipStatus;
  invitedByName: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  lastAccessAt: Date | null;
}

export interface InviteActor {
  id: string;
  name: string;
}

function statusOf(
  row: {
    isActive: boolean;
    acceptedAt: Date | null;
    inviteExpiresAt: Date | null;
  },
  now: Date,
): MembershipStatus {
  if (!row.isActive) return 'INACTIVE';
  if (row.acceptedAt) return 'ACTIVE';
  return row.inviteExpiresAt && row.inviteExpiresAt > now
    ? 'PENDING'
    : 'EXPIRED';
}

async function requireSupplier(
  companyId: string,
  supplierId: string,
  client: Prisma.TransactionClient = prisma,
) {
  const contact = await client.contact.findFirst({
    where: { id: supplierId, companyId, isConsignor: true },
    select: { id: true, razonSocial: true, nombreFantasia: true },
  });
  if (!contact)
    throw new SellerCenterError(
      'El contacto no existe o no está marcado como seller (consignación)',
    );
  return contact;
}

export async function listSupplierAccounts(
  companyId: string,
  supplierId: string,
  now: Date = new Date(),
): Promise<SupplierAccountRow[]> {
  const rows = await prisma.supplierPortalMembership.findMany({
    where: { companyId, supplierId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      personName: true,
      isActive: true,
      acceptedAt: true,
      inviteExpiresAt: true,
      invitedByName: true,
      createdAt: true,
      lastAccessAt: true,
      person: { select: { email: true, phone: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.personName,
    email: row.person.email,
    phone: row.person.phone,
    status: statusOf(row, now),
    invitedByName: row.invitedByName,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    lastAccessAt: row.lastAccessAt,
  }));
}

interface PreparedInvitation {
  membershipId: string;
  token: string;
  email: string | null;
  phone: string | null;
  companyName: string;
  supplierName: string;
  inviterName: string;
}
/** Never call delivery inside a business transaction. Email secrets use the platform transport. */
export async function deliverSupplierInvitation(
  input: PreparedInvitation,
): Promise<SellerInvitationDelivery> {
  const acceptUrl = `${getAppUrl()}/proveedor/cuenta/invitacion/${input.token}`;
  if (input.phone) {
    const text = `${input.companyName} te invita a Seller Center en nombre de ${input.supplierName}. Tu usuario es ${input.phone}. Activa tu cuenta y elige tu contraseña: ${acceptUrl} . El enlace vence en ${INVITE_TTL_DAYS} días y sirve una sola vez. Después puedes instalar Seller Center desde ${getAppUrl()}/proveedor/cuenta`;
    return {
      membershipId: input.membershipId,
      delivery: 'whatsapp',
      whatsappUrl: `https://wa.me/${input.phone.slice(1)}?text=${encodeURIComponent(text)}`,
    };
  }
  if (!input.email)
    throw new SellerCenterError(
      'La invitación no tiene un correo o teléfono válido',
    );
  const message = buildSupplierAccountInviteEmail({
    companyName: input.companyName,
    supplierName: input.supplierName,
    inviterName: input.inviterName,
    acceptUrl,
    expiresInDays: INVITE_TTL_DAYS,
    loginIdentifier: input.email,
    appUrl: `${getAppUrl()}/proveedor/cuenta`,
  });
  const delivery = await sendEmail({ to: input.email, ...message });
  return { membershipId: input.membershipId, delivery: delivery.status };
}

const inviteData = (now: Date) => {
  const token = newAccountToken();
  return {
    token,
    data: {
      inviteTokenHash: hashAccountToken(token),
      inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000),
    },
  };
};

/**
 * Invita a una persona a entrar en nombre del seller. Si la persona ya existe en la plataforma
 * (otra empresa la invitó antes) se reutiliza sin cambiar su nombre: al aceptar, entra con su
 * contraseña de siempre. Una persona tiene a lo más un acceso por empresa.
 */
export async function prepareSupplierInvitation(
  companyId: string,
  supplierId: string,
  actor: InviteActor,
  rawInput: SellerInvitationInput,
  now: Date,
  client: Prisma.TransactionClient,
): Promise<PreparedInvitation> {
  const supplier = await requireSupplier(companyId, supplierId, client);
  const input = sellerInvitationSchema.parse(rawInput);
  const company = await client.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { businessName: true },
  });
  // Never bind a new phone to an existing email account (or vice versa) on an administrator's request.
  const person =
    'email' in input
      ? await client.supplierPortalPerson.upsert({
          where: { email: input.email },
          create: { email: input.email, name: input.name },
          update: {},
          select: { id: true, email: true, phone: true },
        })
      : await client.supplierPortalPerson.upsert({
          where: { phone: input.phone },
          create: { phone: input.phone, name: input.name },
          update: {},
          select: { id: true, email: true, phone: true },
        });
  const existing = await client.supplierPortalMembership.findFirst({
    where: { companyId, personId: person.id },
    select: { id: true, supplierId: true, acceptedAt: true, isActive: true },
  });
  if (existing && existing.supplierId !== supplierId)
    throw new SellerCenterError(
      'Esa persona ya tiene acceso en nombre de otro seller de tu empresa',
    );
  if (existing?.acceptedAt)
    throw new SellerCenterError(
      existing.isActive
        ? 'Esa persona ya tiene acceso'
        : 'Esa persona tiene el acceso desactivado: reactívalo en la lista',
    );
  const { token, data } = inviteData(now);
  let membershipId: string;
  if (existing) {
    const updated = await client.supplierPortalMembership.updateMany({
      where: { id: existing.id, companyId, acceptedAt: null },
      data: {
        ...data,
        personName: input.name,
        isActive: true,
        invitedById: actor.id,
        invitedByName: actor.name,
      },
    });
    if (!updated.count)
      throw new SellerCenterError(
        'Esa persona ya activó su cuenta. Actualiza la ficha.',
      );
    membershipId = existing.id;
  } else {
    const created = await client.supplierPortalMembership.create({
      data: {
        companyId,
        supplierId,
        personId: person.id,
        personName: input.name,
        ...data,
        invitedById: actor.id,
        invitedByName: actor.name,
      },
      select: { id: true },
    });
    membershipId = created.id;
  }
  return {
    membershipId,
    token,
    email: person.email,
    phone: person.phone,
    companyName: company.businessName,
    supplierName: supplier.nombreFantasia?.trim() || supplier.razonSocial,
    inviterName: actor.name,
  };
}

export async function inviteSupplierPerson(
  companyId: string,
  supplierId: string,
  actor: InviteActor,
  input: SellerInvitationInput,
  now: Date = new Date(),
): Promise<SellerInvitationDelivery> {
  const prepared = await prisma.$transaction(
    (tx) =>
      prepareSupplierInvitation(companyId, supplierId, actor, input, now, tx),
    LOCKING_TX_OPTIONS,
  );
  return deliverSupplierInvitation(prepared);
}

/** Enlace nuevo para una invitación sin aceptar (el anterior deja de servir). */
export async function resendSupplierInvite(
  companyId: string,
  membershipId: string,
  actor: InviteActor,
  now: Date = new Date(),
): Promise<SellerInvitationDelivery & { supplierId: string }> {
  const row = await prisma.supplierPortalMembership.findFirst({
    where: { id: membershipId, companyId, acceptedAt: null, isActive: true },
    select: {
      id: true,
      supplierId: true,
      person: { select: { email: true, phone: true } },
      company: { select: { businessName: true } },
      supplier: {
        select: { razonSocial: true, nombreFantasia: true, isConsignor: true },
      },
    },
  });
  if (!row || !row.supplier.isConsignor)
    throw new SellerCenterError('Esa invitación ya no está pendiente');
  const { token, data } = inviteData(now);
  // Condicionado a que siga pendiente: si la aceptaron entre medio, no se le pone un enlace nuevo.
  const { count } = await prisma.supplierPortalMembership.updateMany({
    where: { id: row.id, companyId, acceptedAt: null },
    data: { ...data, invitedById: actor.id, invitedByName: actor.name },
  });
  if (count === 0)
    throw new SellerCenterError('Esa invitación ya no está pendiente');
  const delivery = await deliverSupplierInvitation({
    membershipId: row.id,
    email: row.person.email,
    phone: row.person.phone,
    token,
    companyName: row.company.businessName,
    supplierName:
      row.supplier.nombreFantasia?.trim() || row.supplier.razonSocial,
    inviterName: actor.name,
  });
  return { supplierId: row.supplierId, ...delivery };
}

/** Quitar o devolver el acceso. Quitarlo corta la sesión abierta en la siguiente página. */
export async function setSupplierAccountActive(
  companyId: string,
  membershipId: string,
  active: boolean,
): Promise<{ supplierId: string }> {
  const row = await prisma.supplierPortalMembership.findFirst({
    where: { id: membershipId, companyId },
    select: { id: true, supplierId: true, acceptedAt: true },
  });
  if (!row) throw new SellerCenterError('Ese acceso no existe en tu empresa');
  if (active && !row.acceptedAt)
    throw new SellerCenterError(
      'Esa invitación no se ha aceptado: reenvíala en vez de reactivarla',
    );
  // Desactivar también anula un enlace pendiente: no debe poder usarse después.
  await prisma.supplierPortalMembership.updateMany({
    where: { id: row.id, companyId },
    data: active
      ? { isActive: true }
      : { isActive: false, inviteTokenHash: null, inviteExpiresAt: null },
  });
  return { supplierId: row.supplierId };
}

/** Anular una invitación que nadie aceptó: se borra (no hay historia que conservar). */
export async function cancelSupplierInvite(
  companyId: string,
  membershipId: string,
): Promise<{ supplierId: string }> {
  const row = await prisma.supplierPortalMembership.findFirst({
    where: { id: membershipId, companyId, acceptedAt: null },
    select: { id: true, supplierId: true },
  });
  if (!row) throw new SellerCenterError('Esa invitación ya no está pendiente');
  await prisma.supplierPortalMembership.deleteMany({
    where: { id: row.id, companyId, acceptedAt: null },
  });
  return { supplierId: row.supplierId };
}
