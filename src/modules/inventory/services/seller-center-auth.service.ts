import 'server-only';

import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { moduleEnabled, toFeatureFlags } from '@/lib/auth/modules';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import { getAppUrl, sendEmail } from '@/lib/email/mailer';
import { buildSupplierAccountResetEmail } from '@/lib/email/templates';
import { captureException } from '@/lib/observability';
import {
  LOCKOUT_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  RESET_TTL_MINUTES,
  hashAccountToken,
  isWellFormedToken,
  newAccountToken,
  normalizeEmail,
} from '@/lib/supplier-portal/accounts';
import { verifySupplierSessionToken } from '@/lib/supplier-portal/session';

/**
 * Seller Center: ingreso de las personas de un seller de consignación (`/proveedor/cuenta`).
 *
 * Reglas que no se rompen:
 * - **La persona es de la plataforma, el acceso es de la empresa.** `SupplierPortalPerson` no
 *   tiene empresa; cada `SupplierPortalMembership` dice a qué empresa y en nombre de qué proveedor
 *   entra. Ninguna empresa ve ni cambia la contraseña, y los correos de acceso salen por la cuenta
 *   de la plataforma (nunca por el Brevo de una empresa, que podría leerlos).
 * - **Todo se revalida en cada página.** El token solo dice quién y con qué acceso; el acceso tiene
 *   que seguir activo y aceptado, el contacto seguir siendo seller, la empresa operando (ACTIVE
 *   o TRIAL), con Inventario y Seller Center encendidos, y la versión de sesión coincidir.
 * - **Fuerza bruta acotada.** Igual que el login del panel: lock de la fila, 5 intentos y 15
 *   minutos de bloqueo, y un `bcrypt` de relleno cuando el correo no existe.
 */

export class SellerCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellerCenterError';
  }
}

export class SupplierAccountLockedError extends SellerCenterError {
  constructor(minutesLeft: number) {
    super(`Demasiados intentos fallidos. Vuelve a intentar en ${minutesLeft} minuto(s)`);
  }
}

const BCRYPT_COST = 12;
const DUMMY_HASH = '$2b$12$8M8fKdKgsaNr.D4NjEj7auzaCl4kApLh477i.TriJbHm0KTvVMwae';
const OPERATIONAL = ['ACTIVE', 'TRIAL'] as const;
/** Cada cuánto como máximo se anota el último acceso (no una escritura por página). */
const LAST_ACCESS_EVERY_MS = 5 * 60_000;

/** Acceso que todavía sirve. El módulo se revisa aparte (vive en `CompanyFeatures`). */
const USABLE_MEMBERSHIP = {
  isActive: true,
  acceptedAt: { not: null },
  // Solo sellers de consignación: el Seller Center es su portal (ADR 0010).
  supplier: { isConsignor: true },
  company: { status: { in: [...OPERATIONAL] } },
} satisfies Prisma.SupplierPortalMembershipWhereInput;

const sellerCenterOn = (features: Parameters<typeof toFeatureFlags>[0]) => moduleEnabled(toFeatureFlags(features), 'hasSellerCenter');

const supplierName = (contact: { razonSocial: string; nombreFantasia: string | null }) => contact.nombreFantasia?.trim() || contact.razonSocial;

export interface SupplierAccount {
  personId: string;
  personName: string;
  personEmail: string;
  membershipId: string;
  companyId: string;
  supplierId: string;
  company: { name: string; rut: string; logoUrl: string | null; email: string | null; phone: string | null };
  supplier: { name: string; rut: string };
  /** Lo que necesita la vista compartida con el portal (`buildPortalView`). */
  contact: { razonSocial: string; nombreFantasia: string | null; rut: string; isConsignor: boolean; consignmentCommissionBps: number | null };
  /** La empresa usa «Mermas con responsable»: se muestra quién respondió por cada merma. */
  showsLiability: boolean;
  /** Los demás accesos de la misma persona (otras empresas), para cambiar de una a otra. */
  others: Array<{ membershipId: string; companyName: string; supplierName: string }>;
}

/** Accesos que la persona puede usar hoy, el más usado primero. */
export async function usableMemberships(personId: string): Promise<Array<{ id: string; companyName: string; supplierName: string }>> {
  const rows = await prisma.supplierPortalMembership.findMany({
    where: { personId, ...USABLE_MEMBERSHIP },
    orderBy: [{ lastAccessAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 50,
    select: {
      id: true,
      company: { select: { businessName: true, features: true } },
      supplier: { select: { razonSocial: true, nombreFantasia: true } },
    },
  });
  return rows.filter((row) => sellerCenterOn(row.company.features)).map((row) => ({ id: row.id, companyName: row.company.businessName, supplierName: supplierName(row.supplier) }));
}

/** La cuenta detrás de una cookie, o `null` si ya no sirve por cualquier motivo. */
export async function resolveSupplierSession(token: string | undefined, now: Date = new Date()): Promise<SupplierAccount | null> {
  if (!token) return null;
  const payload = await verifySupplierSessionToken(token);
  if (!payload) return null;
  const membership = await prisma.supplierPortalMembership.findFirst({
    where: { id: payload.membershipId, personId: payload.personId, ...USABLE_MEMBERSHIP },
    select: {
      id: true,
      companyId: true,
      supplierId: true,
      lastAccessAt: true,
      person: { select: { id: true, name: true, email: true, sessionVersion: true } },
      company: { select: { businessName: true, rut: true, logoUrl: true, email: true, phone: true, features: true } },
      supplier: { select: { razonSocial: true, nombreFantasia: true, rut: true, isConsignor: true, consignmentCommissionBps: true } },
    },
  });
  if (!membership || membership.person.sessionVersion !== payload.sessionVersion || !sellerCenterOn(membership.company.features)) return null;

  if (!membership.lastAccessAt || now.getTime() - membership.lastAccessAt.getTime() > LAST_ACCESS_EVERY_MS) {
    // Anotar el acceso nunca debe impedir entrar.
    void prisma.supplierPortalMembership.updateMany({ where: { id: membership.id }, data: { lastAccessAt: now } }).catch(() => undefined);
  }
  const others = (await usableMemberships(membership.person.id)).filter((entry) => entry.id !== membership.id);
  return {
    personId: membership.person.id,
    personName: membership.person.name,
    personEmail: membership.person.email,
    membershipId: membership.id,
    companyId: membership.companyId,
    supplierId: membership.supplierId,
    company: { name: membership.company.businessName, rut: membership.company.rut, logoUrl: membership.company.logoUrl, email: membership.company.email, phone: membership.company.phone },
    supplier: { name: supplierName(membership.supplier), rut: membership.supplier.rut },
    contact: membership.supplier,
    showsLiability: moduleEnabled(toFeatureFlags(membership.company.features), 'hasShrinkageLiability'),
    others: others.map((entry) => ({ membershipId: entry.id, companyName: entry.companyName, supplierName: entry.supplierName })),
  };
}

type LockablePerson = { id: string; passwordHash: string | null; failedLoginAttempts: number; loginLockedUntil: Date | null };

/**
 * Compara la contraseña DENTRO de la transacción que tiene la fila bloqueada, y anota el intento
 * fallido (o el bloqueo) ahí mismo: una ráfaga concurrente no consigue más intentos de los debidos.
 * Devuelve `false` sin lanzar para que la transacción confirme el contador.
 */
async function checkPasswordLocked(tx: Prisma.TransactionClient, person: LockablePerson, password: string): Promise<boolean> {
  if (person.loginLockedUntil && person.loginLockedUntil > new Date()) {
    throw new SupplierAccountLockedError(Math.ceil((person.loginLockedUntil.getTime() - Date.now()) / 60_000));
  }
  if (!person.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  const match = await bcrypt.compare(password, person.passwordHash);
  if (!match) {
    const attempts = person.failedLoginAttempts + 1;
    await tx.supplierPortalPerson.update({
      where: { id: person.id },
      data: attempts >= MAX_LOGIN_ATTEMPTS ? { failedLoginAttempts: 0, loginLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } : { failedLoginAttempts: attempts },
    });
    return false;
  }
  if (person.failedLoginAttempts > 0 || person.loginLockedUntil) {
    await tx.supplierPortalPerson.update({ where: { id: person.id }, data: { failedLoginAttempts: 0, loginLockedUntil: null } });
  }
  return true;
}

const LOCKABLE = { id: true, passwordHash: true, failedLoginAttempts: true, loginLockedUntil: true, sessionVersion: true } as const;

/**
 * Correo y contraseña. Devuelve la persona y el acceso con que entra, o `null` si las credenciales
 * no sirven (sin decir si el correo existe). Lanza si la cuenta está bloqueada o si no tiene ningún
 * acceso activo (eso solo se dice con la contraseña correcta).
 */
export async function loginSupplierPerson(rawEmail: string, password: string): Promise<{ personId: string; membershipId: string; sessionVersion: number } | null> {
  const email = normalizeEmail(rawEmail);
  const person = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SupplierPortalPerson" WHERE email = ${email} FOR UPDATE`;
    const found = await tx.supplierPortalPerson.findUnique({ where: { email }, select: LOCKABLE });
    if (!found) {
      await bcrypt.compare(password, DUMMY_HASH);
      return null;
    }
    const ok = await checkPasswordLocked(tx, found, password);
    if (!ok) return null;
    await tx.supplierPortalPerson.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
    return found;
  }, LOCKING_TX_OPTIONS);
  if (!person) return null;

  const [first] = await usableMemberships(person.id);
  if (!first) throw new SellerCenterError('Tu cuenta no tiene un acceso activo. Pídele a la empresa que te invite de nuevo.');
  return { personId: person.id, membershipId: first.id, sessionVersion: person.sessionVersion };
}

/** Cambiar a otro acceso de la MISMA persona (otra empresa). */
export async function switchSupplierMembership(personId: string, membershipId: string): Promise<{ personId: string; membershipId: string; sessionVersion: number }> {
  const usable = await usableMemberships(personId);
  if (!usable.some((entry) => entry.id === membershipId)) throw new SellerCenterError('Ese acceso no está disponible');
  const person = await prisma.supplierPortalPerson.findUnique({ where: { id: personId }, select: { sessionVersion: true } });
  if (!person) throw new SellerCenterError('Ese acceso no está disponible');
  return { personId, membershipId, sessionVersion: person.sessionVersion };
}

// ─── Invitación ──────────────────────────────────────────────────────────────

export type InvitationView =
  | { state: 'valid'; email: string; personName: string; hasPassword: boolean; companyName: string; supplierName: string }
  | { state: 'invalid' };

const INVITATION_SELECT = {
  id: true,
  isActive: true,
  acceptedAt: true,
  inviteExpiresAt: true,
  personId: true,
  company: { select: { businessName: true, status: true, features: true } },
  supplier: { select: { razonSocial: true, nombreFantasia: true, isConsignor: true } },
  person: { select: { email: true, name: true, passwordHash: true } },
} satisfies Prisma.SupplierPortalMembershipSelect;

type InvitationRow = Prisma.SupplierPortalMembershipGetPayload<{ select: typeof INVITATION_SELECT }>;

function invitationUsable(row: InvitationRow | null, now: Date): row is InvitationRow {
  return Boolean(
    row &&
      row.isActive &&
      !row.acceptedAt &&
      row.inviteExpiresAt &&
      row.inviteExpiresAt > now &&
      row.supplier.isConsignor &&
      (OPERATIONAL as readonly string[]).includes(row.company.status) &&
      sellerCenterOn(row.company.features)
  );
}

/** Qué muestra la página del enlace: crear contraseña o entrar con la que ya tiene. */
export async function inspectInvitation(token: string, now: Date = new Date()): Promise<InvitationView> {
  if (!isWellFormedToken(token)) return { state: 'invalid' };
  const row = await prisma.supplierPortalMembership.findUnique({ where: { inviteTokenHash: hashAccountToken(token) }, select: INVITATION_SELECT });
  if (!invitationUsable(row, now)) return { state: 'invalid' };
  return {
    state: 'valid',
    email: row.person.email,
    personName: row.person.name,
    hasPassword: Boolean(row.person.passwordHash),
    companyName: row.company.businessName,
    supplierName: supplierName(row.supplier),
  };
}

/**
 * Acepta la invitación: crea la contraseña (persona nueva) o la comprueba (persona que ya tiene
 * cuenta por otra empresa: nadie puede sumar un acceso a la cuenta de otro sin su contraseña).
 * El enlace queda usado en la misma transacción.
 */
export async function acceptInvitation(token: string, password: string, now: Date = new Date()): Promise<{ personId: string; membershipId: string; sessionVersion: number }> {
  if (!isWellFormedToken(token)) throw new SellerCenterError('El enlace no es válido o ya se usó');
  const tokenHash = hashAccountToken(token);
  const invalid = () => new SellerCenterError('El enlace no es válido, venció o ya se usó. Pide uno nuevo a la empresa.');
  // La revisión completa (empresa, módulo, proveedor) va antes: una lectura con relaciones dentro de
  // la transacción hace que Prisma lance consultas en paralelo sobre su única conexión.
  const checked = await prisma.supplierPortalMembership.findUnique({ where: { inviteTokenHash: tokenHash }, select: INVITATION_SELECT });
  if (!invitationUsable(checked, now)) throw invalid();
  return prisma.$transaction(async (tx) => {
    // Con la fila bloqueada se confirma que el enlace sigue vigente (nadie lo usó ni lo anuló entre medio).
    await tx.$queryRaw`SELECT id FROM "SupplierPortalMembership" WHERE id = ${checked.id} FOR UPDATE`;
    const row = await tx.supplierPortalMembership.findFirst({
      where: { id: checked.id, inviteTokenHash: tokenHash, isActive: true, acceptedAt: null, inviteExpiresAt: { gt: now } },
      select: { id: true, personId: true },
    });
    if (!row) throw invalid();

    await tx.$queryRaw`SELECT id FROM "SupplierPortalPerson" WHERE id = ${row.personId} FOR UPDATE`;
    const person = await tx.supplierPortalPerson.findUniqueOrThrow({ where: { id: row.personId }, select: LOCKABLE });
    if (person.passwordHash) {
      if (!(await checkPasswordLocked(tx, person, password))) return null;
    } else {
      const policy = passwordPolicySchema.safeParse(password);
      if (!policy.success) throw new SellerCenterError(policy.error.issues[0]?.message ?? 'La contraseña no cumple los requisitos');
      await tx.supplierPortalPerson.update({ where: { id: person.id }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST) } });
    }
    await tx.supplierPortalMembership.update({ where: { id: row.id }, data: { acceptedAt: now, inviteTokenHash: null, inviteExpiresAt: null, lastAccessAt: now } });
    return { personId: person.id, membershipId: row.id, sessionVersion: person.sessionVersion };
  }, LOCKING_TX_OPTIONS).then((result) => {
    // Contraseña equivocada: el intento quedó anotado (la transacción confirmó) y recién ahora se avisa.
    if (!result) throw new SellerCenterError('La contraseña no es correcta. Usa la de tu cuenta del portal de proveedores.');
    return result;
  });
}

// ─── Recuperar la contraseña ─────────────────────────────────────────────────

/** Manda un enlace de recuperación si el correo tiene contraseña. Nunca dice si existe. */
export async function requestPasswordReset(rawEmail: string, now: Date = new Date()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const person = await prisma.supplierPortalPerson.findUnique({ where: { email }, select: { id: true, name: true, passwordHash: true } });
  if (!person?.passwordHash) return;
  const token = newAccountToken();
  await prisma.supplierPortalPerson.update({
    where: { id: person.id },
    data: { resetTokenHash: hashAccountToken(token), resetExpiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000) },
  });
  const message = buildSupplierAccountResetEmail({ name: person.name, resetUrl: `${getAppUrl()}/proveedor/cuenta/restablecer/${token}`, expiresInMinutes: RESET_TTL_MINUTES });
  // Sin `companyId` a propósito: un correo de acceso nunca sale por la cuenta de una empresa.
  const delivery = await sendEmail({ to: email, ...message });
  if (delivery.status === 'failed') captureException(new Error('No se pudo enviar el correo de recuperación del Seller Center'), { module: 'portal-proveedores', extra: { reason: delivery.error } });
}

/** Nueva contraseña con el enlace: cierra todas las sesiones abiertas y desbloquea la cuenta. */
export async function resetPassword(token: string, password: string, now: Date = new Date()): Promise<void> {
  if (!isWellFormedToken(token)) throw new SellerCenterError('El enlace no es válido o ya se usó');
  const policy = passwordPolicySchema.safeParse(password);
  if (!policy.success) throw new SellerCenterError(policy.error.issues[0]?.message ?? 'La contraseña no cumple los requisitos');
  const tokenHash = hashAccountToken(token);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Condicionado al enlace vigente: dos envíos del mismo enlace dejan una sola contraseña nueva.
  const { count } = await prisma.supplierPortalPerson.updateMany({
    where: { resetTokenHash: tokenHash, resetExpiresAt: { gt: now } },
    data: { passwordHash, resetTokenHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 }, failedLoginAttempts: 0, loginLockedUntil: null },
  });
  if (count === 0) throw new SellerCenterError('El enlace no es válido, venció o ya se usó. Pide uno nuevo.');
}
