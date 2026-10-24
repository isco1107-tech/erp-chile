import 'server-only';

import { prisma } from '@/lib/prisma';
import { getAppUrl, sendEmail, type EmailResult } from '@/lib/email/mailer';
import { buildSupplierAccountInviteEmail } from '@/lib/email/templates';
import { INVITE_TTL_DAYS, hashAccountToken, newAccountToken, normalizeEmail } from '@/lib/supplier-portal/accounts';
import { SellerCenterError } from './seller-center-auth.service';

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
  email: string;
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

function statusOf(row: { isActive: boolean; acceptedAt: Date | null; inviteExpiresAt: Date | null }, now: Date): MembershipStatus {
  if (!row.isActive) return 'INACTIVE';
  if (row.acceptedAt) return 'ACTIVE';
  return row.inviteExpiresAt && row.inviteExpiresAt > now ? 'PENDING' : 'EXPIRED';
}

async function requireSupplier(companyId: string, supplierId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: supplierId, companyId, isConsignor: true }, select: { id: true, razonSocial: true, nombreFantasia: true } });
  if (!contact) throw new SellerCenterError('El contacto no existe o no está marcado como seller (consignación)');
  return contact;
}

export async function listSupplierAccounts(companyId: string, supplierId: string, now: Date = new Date()): Promise<SupplierAccountRow[]> {
  const rows = await prisma.supplierPortalMembership.findMany({
    where: { companyId, supplierId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, personName: true, isActive: true, acceptedAt: true, inviteExpiresAt: true, invitedByName: true, createdAt: true, lastAccessAt: true, person: { select: { email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.personName,
    email: row.person.email,
    status: statusOf(row, now),
    invitedByName: row.invitedByName,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    lastAccessAt: row.lastAccessAt,
  }));
}

/** Manda el enlace por la cuenta de la plataforma (no la de la empresa: es un correo de acceso). */
async function deliverInvite(input: { email: string; token: string; companyName: string; supplierName: string; inviterName: string }): Promise<EmailResult> {
  const message = buildSupplierAccountInviteEmail({
    companyName: input.companyName,
    supplierName: input.supplierName,
    inviterName: input.inviterName,
    acceptUrl: `${getAppUrl()}/proveedor/cuenta/invitacion/${input.token}`,
    expiresInDays: INVITE_TTL_DAYS,
  });
  return sendEmail({ to: input.email, ...message });
}

const inviteData = (now: Date) => {
  const token = newAccountToken();
  return { token, data: { inviteTokenHash: hashAccountToken(token), inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000) } };
};

/**
 * Invita a una persona a entrar en nombre del seller. Si la persona ya existe en la plataforma
 * (otra empresa la invitó antes) se reutiliza sin cambiar su nombre: al aceptar, entra con su
 * contraseña de siempre. Una persona tiene a lo más un acceso por empresa.
 */
export async function inviteSupplierPerson(
  companyId: string,
  supplierId: string,
  actor: InviteActor,
  input: { name: string; email: string },
  now: Date = new Date()
): Promise<{ membershipId: string; delivery: EmailResult['status'] }> {
  const supplier = await requireSupplier(companyId, supplierId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { businessName: true } });
  const email = normalizeEmail(input.email);
  const person = await prisma.supplierPortalPerson.upsert({ where: { email }, create: { email, name: input.name.trim() }, update: {}, select: { id: true } });

  const existing = await prisma.supplierPortalMembership.findUnique({ where: { companyId_personId: { companyId, personId: person.id } }, select: { id: true, supplierId: true, acceptedAt: true, isActive: true } });
  if (existing && existing.supplierId !== supplierId) throw new SellerCenterError('Esa persona ya tiene acceso en nombre de otro seller de tu empresa');
  if (existing?.acceptedAt && existing.isActive) throw new SellerCenterError('Esa persona ya tiene acceso');
  if (existing?.acceptedAt && !existing.isActive) throw new SellerCenterError('Esa persona tiene el acceso desactivado: reactívalo en la lista');

  const { token, data } = inviteData(now);
  const membership = existing
    ? await prisma.supplierPortalMembership.update({ where: { id: existing.id }, data: { ...data, personName: input.name.trim(), isActive: true, invitedById: actor.id, invitedByName: actor.name }, select: { id: true } })
    : await prisma.supplierPortalMembership.create({ data: { companyId, supplierId, personId: person.id, personName: input.name.trim(), ...data, invitedById: actor.id, invitedByName: actor.name }, select: { id: true } });

  const delivery = await deliverInvite({ email, token, companyName: company.businessName, supplierName: supplier.nombreFantasia?.trim() || supplier.razonSocial, inviterName: actor.name });
  return { membershipId: membership.id, delivery: delivery.status };
}

/** Enlace nuevo para una invitación sin aceptar (el anterior deja de servir). */
export async function resendSupplierInvite(companyId: string, membershipId: string, actor: InviteActor, now: Date = new Date()): Promise<{ supplierId: string; delivery: EmailResult['status'] }> {
  const row = await prisma.supplierPortalMembership.findFirst({
    where: { id: membershipId, companyId, acceptedAt: null, isActive: true },
    select: { id: true, supplierId: true, person: { select: { email: true } }, company: { select: { businessName: true } }, supplier: { select: { razonSocial: true, nombreFantasia: true, isConsignor: true } } },
  });
  if (!row || !row.supplier.isConsignor) throw new SellerCenterError('Esa invitación ya no está pendiente');
  const { token, data } = inviteData(now);
  // Condicionado a que siga pendiente: si la aceptaron entre medio, no se le pone un enlace nuevo.
  const { count } = await prisma.supplierPortalMembership.updateMany({ where: { id: row.id, companyId, acceptedAt: null }, data: { ...data, invitedById: actor.id, invitedByName: actor.name } });
  if (count === 0) throw new SellerCenterError('Esa invitación ya no está pendiente');
  const delivery = await deliverInvite({ email: row.person.email, token, companyName: row.company.businessName, supplierName: row.supplier.nombreFantasia?.trim() || row.supplier.razonSocial, inviterName: actor.name });
  return { supplierId: row.supplierId, delivery: delivery.status };
}

/** Quitar o devolver el acceso. Quitarlo corta la sesión abierta en la siguiente página. */
export async function setSupplierAccountActive(companyId: string, membershipId: string, active: boolean): Promise<{ supplierId: string }> {
  const row = await prisma.supplierPortalMembership.findFirst({ where: { id: membershipId, companyId }, select: { id: true, supplierId: true, acceptedAt: true } });
  if (!row) throw new SellerCenterError('Ese acceso no existe en tu empresa');
  if (active && !row.acceptedAt) throw new SellerCenterError('Esa invitación no se ha aceptado: reenvíala en vez de reactivarla');
  // Desactivar también anula un enlace pendiente: no debe poder usarse después.
  await prisma.supplierPortalMembership.updateMany({ where: { id: row.id, companyId }, data: active ? { isActive: true } : { isActive: false, inviteTokenHash: null, inviteExpiresAt: null } });
  return { supplierId: row.supplierId };
}

/** Anular una invitación que nadie aceptó: se borra (no hay historia que conservar). */
export async function cancelSupplierInvite(companyId: string, membershipId: string): Promise<{ supplierId: string }> {
  const row = await prisma.supplierPortalMembership.findFirst({ where: { id: membershipId, companyId, acceptedAt: null }, select: { id: true, supplierId: true } });
  if (!row) throw new SellerCenterError('Esa invitación ya no está pendiente');
  await prisma.supplierPortalMembership.deleteMany({ where: { id: row.id, companyId, acceptedAt: null } });
  return { supplierId: row.supplierId };
}
