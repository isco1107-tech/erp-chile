import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import type { AuditAction, Invitation, Prisma, Role } from '@prisma/client';
import { generateRandomPassword } from '@/lib/auth/password-policy';
import { toFeatureFlags } from '@/lib/auth/modules';

export const INVITATION_TTL_DAYS = 7;
const INVITATION_TTL_HOURS = INVITATION_TTL_DAYS * 24;

/**
 * Lista POSITIVA de campos de `User` seguros para cruzar la frontera Server
 * Action → cliente. Antes era `Omit<User, 'passwordHash'>`: cualquier campo de
 * seguridad nuevo en el modelo (un secreto TOTP, un contador de intentos
 * fallidos) se filtraba automáticamente al navegador de cualquier ADMIN hasta
 * que alguien se acordara de excluirlo a mano. Con lista positiva pasa lo
 * contrario — un campo nuevo queda afuera hasta que se agregue acá a
 * propósito. Quedan fuera a propósito: `passwordHash`, `totpSecret`,
 * `totpFailedAttempts`, `totpLockedUntil`, `failedLoginAttempts`,
 * `loginLockedUntil` (material/estado de autenticación) y `sessionVersion`
 * (contador interno de invalidación sin uso en la interfaz).
 */
export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  companyId: true,
  customRoleId: true,
  photoUrl: true,
  jobPositionId: true,
  managerId: true,
  isSuperAdmin: true,
  isActive: true,
  mustChangePassword: true,
  totpEnabled: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Miembro del equipo con el nombre de su rol personalizado, si tiene uno. */
export type TeamMember = SafeUser & { customRoleName: string | null };

export async function listUsers(companyId: string): Promise<TeamMember[]> {
  const users = await prisma.user.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { ...SAFE_USER_SELECT, customRole: { select: { name: true } } },
  });
  return users.map(({ customRole, ...user }) => ({ ...user, customRoleName: customRole?.name ?? null }));
}

export async function listPendingInvitations(companyId: string): Promise<Invitation[]> {
  return prisma.invitation.findMany({
    where: { companyId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Cuenta existente con ese correo, sin distinguir mayúsculas: es la misma
 * persona aunque la escriban distinto, y no debe terminar con dos cuentas.
 */
async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, companyId: true, isSuperAdmin: true, isActive: true },
  });
}

export async function inviteUser(
  companyId: string,
  data: { email: string; role: Role; customRoleId?: string | null },
  options: { multiCompany: boolean }
): Promise<Invitation & { existingAccount: boolean }> {
  // Alguien que ya tiene cuenta en otra empresa no recibe una cuenta nueva:
  // se le suma esta empresa como membresía (Multiempresa), con el mismo
  // correo y la misma contraseña que ya usa.
  const existingUser = await findUserByEmail(data.email);
  if (existingUser) {
    if (existingUser.companyId === companyId) throw new Error('Esa persona ya es parte del equipo');
    if (existingUser.isSuperAdmin) throw new Error('No se puede invitar una cuenta de plataforma');
    const membership = await prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: existingUser.id, companyId } },
      select: { id: true },
    });
    if (membership) throw new Error('Esa persona ya tiene acceso a esta empresa');
    if (!options.multiCompany) {
      throw new Error(
        'Ese correo ya tiene una cuenta en otra empresa. Para sumar a esa persona sin crearle otra cuenta, tu plan necesita el módulo Multiempresa'
      );
    }
  }

  if (data.customRoleId) {
    const customRole = await prisma.customRole.findFirst({ where: { id: data.customRoleId, companyId } });
    if (!customRole) throw new Error('Rol personalizado no encontrado');
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
  const customRoleId = data.customRoleId ?? null;

  const invitation = await prisma.invitation.upsert({
    where: { companyId_email: { companyId, email: data.email } },
    update: { role: data.role, customRoleId, token, expiresAt, acceptedAt: null },
    create: { companyId, email: data.email, role: data.role, customRoleId, token, expiresAt },
  });
  return { ...invitation, existingAccount: existingUser !== null };
}

export async function revokeInvitation(companyId: string, id: string): Promise<void> {
  const invitation = await prisma.invitation.findFirst({ where: { id, companyId } });
  if (!invitation) throw new Error('Invitación no encontrada');
  await prisma.invitation.deleteMany({ where: { id, companyId } });
}

export async function resendInvitation(companyId: string, id: string): Promise<Invitation> {
  const invitation = await prisma.invitation.findFirst({ where: { id, companyId } });
  if (!invitation) throw new Error('Invitación no encontrada');
  if (invitation.acceptedAt) throw new Error('Esta invitación ya fue aceptada');

  return prisma.invitation.update({
    where: { id },
    data: { token: generateToken(), expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000) },
  });
}

export async function getInvitationByToken(
  token: string
): Promise<(Invitation & { company: { businessName: string }; existingAccount: boolean }) | null> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { company: { select: { businessName: true } } },
  });
  if (!invitation) return null;
  return { ...invitation, existingAccount: (await findUserByEmail(invitation.email)) !== null };
}

/**
 * Cupos del plan que ocupa una empresa: su equipo activo más las personas de
 * otras empresas que trabajan en ella con membresía (también usan la empresa).
 */
async function occupiedSeats(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  const [homeUsers, members] = await Promise.all([
    tx.user.count({ where: { companyId, isActive: true } }),
    tx.companyMembership.count({ where: { companyId, user: { isActive: true } } }),
  ]);
  return homeUsers + members;
}

/**
 * Acepta una invitación dirigida a alguien que YA tiene cuenta: no crea un
 * usuario, le suma la empresa como membresía. Exige que quien acepta sea esa
 * misma cuenta (sesión iniciada con ese correo): el token solo prueba que
 * se recibió el correo, no autoriza a colgarle una empresa a otra cuenta.
 */
export async function acceptInvitationAsMember(
  token: string,
  sessionUserId: string
): Promise<{ companyId: string; companyName: string; role: Role; email: string }> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { company: { select: { businessName: true, status: true, maxUsers: true, features: true } } },
  });
  if (!invitation) throw new Error('Invitación no válida');
  if (invitation.acceptedAt) throw new Error('Esta invitación ya fue utilizada');
  if (invitation.expiresAt < new Date()) throw new Error('Esta invitación ha expirado');
  if (invitation.company.status === 'SUSPENDED' || invitation.company.status === 'CANCELLED') {
    throw new Error('La cuenta de esta empresa no se encuentra activa');
  }
  if (!toFeatureFlags(invitation.company.features).hasMultiCompany) {
    throw new Error('Esta empresa ya no tiene el módulo Multiempresa. Pide que te inviten de nuevo');
  }

  const user = await prisma.user.findFirst({
    where: { id: sessionUserId, isActive: true },
    select: { id: true, email: true, companyId: true, isSuperAdmin: true },
  });
  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error(`Esta invitación es para ${invitation.email}. Entra con esa cuenta para aceptarla`);
  }
  if (user.isSuperAdmin) throw new Error('No se puede invitar una cuenta de plataforma');
  if (user.companyId === invitation.companyId) throw new Error('Ya eres parte de esta empresa');

  await prisma.$transaction(async (tx) => {
    // El cupo se revalida al aceptar: entre la invitación y este momento el
    // plan pudo cambiar o llenarse.
    if ((await occupiedSeats(tx, invitation.companyId)) >= invitation.company.maxUsers) {
      throw new Error(`La empresa alcanzó el máximo de ${invitation.company.maxUsers} usuarios de su plan. Contacta al administrador`);
    }
    let customRoleId: string | null = null;
    if (invitation.customRoleId) {
      const customRole = await tx.customRole.findFirst({
        where: { id: invitation.customRoleId, companyId: invitation.companyId },
        select: { id: true },
      });
      customRoleId = customRole?.id ?? null;
    }
    await tx.companyMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: invitation.companyId } },
      create: { userId: user.id, companyId: invitation.companyId, role: invitation.role, customRoleId },
      update: { role: invitation.role, customRoleId },
    });
    await tx.invitation.updateMany({ where: { id: invitation.id, companyId: invitation.companyId }, data: { acceptedAt: new Date() } });
  });

  return { companyId: invitation.companyId, companyName: invitation.company.businessName, role: invitation.role, email: user.email };
}

/**
 * Selección mínima necesaria para que `acceptInvitationAction` emita la
 * sesión (`createSessionToken`/`checkIpAllowlist`) — deliberadamente no es
 * `SafeUser`: esta función nunca cruza al cliente, así que no debe heredar
 * las decisiones de qué mostrarle a la interfaz, y sí necesita
 * `sessionVersion`, que `SafeUser` excluye a propósito.
 */
interface AcceptInvitationResult {
  id: string;
  companyId: string | null;
  role: Role;
  email: string;
  sessionVersion: number;
  isSuperAdmin: boolean;
}

export async function acceptInvitation(
  token: string,
  data: { name: string; password: string }
): Promise<AcceptInvitationResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { company: { select: { status: true, maxUsers: true } } },
  });
  if (!invitation) throw new Error('Invitación no válida');
  if (invitation.acceptedAt) throw new Error('Esta invitación ya fue utilizada');
  if (invitation.expiresAt < new Date()) throw new Error('Esta invitación ha expirado');
  if (invitation.company.status === 'SUSPENDED' || invitation.company.status === 'CANCELLED') {
    throw new Error('La cuenta de esta empresa no se encuentra activa');
  }

  // Con cuenta existente se acepta como membresía (acceptInvitationAsMember),
  // nunca creando una segunda cuenta con el mismo correo.
  if (await findUserByEmail(invitation.email)) {
    throw new Error('Ese correo ya tiene una cuenta: inicia sesión con ella para aceptar la invitación');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  return prisma.$transaction(async (tx) => {
    // El límite se revalida al aceptar, no solo al invitar: entre ambos momentos
    // pueden pasar días y el plan pudo cambiar o llenarse el cupo.
    if ((await occupiedSeats(tx, invitation.companyId)) >= invitation.company.maxUsers) {
      throw new Error(
        `La empresa alcanzó el máximo de ${invitation.company.maxUsers} usuarios de su plan. Contacta al administrador`
      );
    }

    // El rol pudo borrarse entre la invitación y su aceptación. La FK con
    // SetNull ya evita el id colgante, pero se revalida igual para no depender
    // de un side effect de la base de datos.
    let customRoleId: string | null = null;
    if (invitation.customRoleId) {
      const customRole = await tx.customRole.findFirst({
        where: { id: invitation.customRoleId, companyId: invitation.companyId },
        select: { id: true },
      });
      customRoleId = customRole?.id ?? null;
    }

    const user = await tx.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        name: data.name,
        role: invitation.role,
        companyId: invitation.companyId,
        customRoleId,
      },
      select: { id: true, companyId: true, role: true, email: true, sessionVersion: true, isSuperAdmin: true },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    return user;
  });
}

export interface CreateUserDirectResult {
  user: TeamMember;
  /**
   * Contraseña temporal en claro. Solo existe en este valor de retorno: nunca
   * se guarda ni se loguea en ninguna otra parte. El administrador la
   * transcribe y se la entrega a la persona por fuera del sistema (WhatsApp,
   * en persona, teléfono) — el usuario debe cambiarla en su primer ingreso.
   */
  temporaryPassword: string;
}

/**
 * Crea la cuenta de inmediato, sin pasar por el correo de invitación: útil
 * cuando el administrador prefiere entregar la contraseña por otro medio en
 * vez de esperar un round-trip de email. La contraseña SIEMPRE se genera acá,
 * nunca la escribe el administrador: así queda garantizado que cumple la
 * política desde el origen, y el flag `mustChangePassword` obliga a la
 * persona a elegir la suya propia en el primer ingreso.
 */
export async function createUserDirect(
  companyId: string,
  data: { email: string; name: string; role: Role; customRoleId?: string | null }
): Promise<CreateUserDirectResult> {
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new Error('Ya existe un usuario con ese correo electrónico');

  let customRoleName: string | null = null;
  if (data.customRoleId) {
    const customRole = await prisma.customRole.findFirst({ where: { id: data.customRoleId, companyId } });
    if (!customRole) throw new Error('Rol personalizado no encontrado');
    customRoleName = customRole.name;
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { maxUsers: true } });
  if (!company) throw new Error('Empresa no encontrada');
  if ((await occupiedSeats(prisma, companyId)) >= company.maxUsers) {
    throw new Error(`Tu plan permite ${company.maxUsers} usuarios y ya están ocupados. Libera un cupo o solicita una ampliación de plan`);
  }

  const temporaryPassword = generateRandomPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
      companyId,
      customRoleId: data.customRoleId ?? null,
      mustChangePassword: true,
    },
    select: SAFE_USER_SELECT,
  });
  return { user: { ...user, customRoleName }, temporaryPassword };
}

/**
 * Jerarquía actor→objetivo para gestionar una cuenta (cambiar rol, resetear
 * contraseña, suspender, eliminar): sin esto, el permiso `settings:users`
 * alcanzaba para actuar sobre cualquier cuenta de la empresa, incluido un
 * OWNER o una cuenta de plataforma (`isSuperAdmin`) que compartiera esa
 * empresa como hogar. Usa el rol BASE real del actor (`actorRole`, el enum
 * `Role` de la sesión), no su conjunto de permisos efectivo — así un
 * `CustomRole` al que se le haya otorgado `settings:users` no elude la regla,
 * igual criterio que ya usa `inviteUserAction`/`createUserDirectAction` para
 * bloquear la asignación del rol OWNER.
 */
export function assertCanManageTarget(actorRole: Role, target: { role: Role; isSuperAdmin: boolean }): void {
  if (target.isSuperAdmin) {
    throw new Error('No se puede administrar una cuenta de plataforma desde la empresa');
  }
  if (target.role === 'OWNER' && actorRole !== 'OWNER') {
    throw new Error('Solo un Dueño (OWNER) puede administrar a otro Dueño');
  }
}

export async function changeUserRole(
  companyId: string,
  actingUserId: string,
  targetUserId: string,
  role: Role,
  actorRole: Role
): Promise<SafeUser> {
  if (actingUserId === targetUserId) throw new Error('No puedes cambiar tu propio rol');
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId } });
  if (!target) throw new Error('Usuario no encontrado');
  assertCanManageTarget(actorRole, target);

  if (target.role === 'OWNER' && role !== 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { companyId, role: 'OWNER', isActive: true } });
    if (ownerCount <= 1) throw new Error('Debe existir al menos un Dueño (OWNER) activo en la empresa');
  }

  const result = await prisma.user.updateMany({ where: { id: targetUserId, companyId }, data: { role } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
  return prisma.user.findFirstOrThrow({ where: { id: targetUserId, companyId }, select: SAFE_USER_SELECT });
}

export async function toggleUserStatus(
  companyId: string,
  actingUserId: string,
  targetUserId: string,
  actorRole: Role
): Promise<SafeUser> {
  if (actingUserId === targetUserId) throw new Error('No puedes suspender tu propia cuenta');
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId } });
  if (!target) throw new Error('Usuario no encontrado');
  assertCanManageTarget(actorRole, target);

  if (target.isActive && target.role === 'OWNER') {
    const activeOwnerCount = await prisma.user.count({ where: { companyId, role: 'OWNER', isActive: true } });
    if (activeOwnerCount <= 1) throw new Error('Debe existir al menos un Dueño (OWNER) activo en la empresa');
  }

  const result = await prisma.user.updateMany({
    where: { id: targetUserId, companyId },
    data: { isActive: !target.isActive },
  });
  if (result.count === 0) throw new Error('Usuario no encontrado');
  return prisma.user.findFirstOrThrow({ where: { id: targetUserId, companyId }, select: SAFE_USER_SELECT });
}

/**
 * Elimina la cuenta por completo (no una suspensión): la fila de `User`
 * desaparece de la base de datos y el correo queda libre para volver a
 * invitarlo o crearlo desde cero.
 *
 * Nunca se bloquea por historial: los turnos de caja, períodos contables
 * cerrados y asientos que esa persona haya generado NO se tocan ni se
 * eliminan — sobreviven con el vínculo al usuario en `null` (montos y
 * cuadres intactos, solo se pierde de quién fue). Es la única forma de que
 * "eliminar" sea eliminar de verdad sin arriesgar la contabilidad.
 */
export async function deleteUser(
  companyId: string,
  actingUserId: string,
  targetUserId: string,
  actorRole: Role
): Promise<void> {
  if (actingUserId === targetUserId) throw new Error('No puedes eliminar tu propia cuenta');
  const target = await prisma.user.findFirst({ where: { id: targetUserId, companyId } });
  if (!target) throw new Error('Usuario no encontrado');
  assertCanManageTarget(actorRole, target);

  if (target.role === 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { companyId, role: 'OWNER' } });
    if (ownerCount <= 1) throw new Error('Debe existir al menos un Dueño (OWNER) en la empresa');
  }

  // `managerId` usa `onDelete: Restrict` (relación estructural del organigrama,
  // igual que `Account.parentId`): sin este pre-check, Postgres devolvería un
  // error crudo de FK en vez de un mensaje accionable.
  const reportsCount = await prisma.user.count({ where: { companyId, managerId: targetUserId } });
  if (reportsCount > 0) {
    throw new Error(
      `No puedes eliminar a este usuario: tiene ${reportsCount} colaborador(es) reportándole. Reasígnalos primero desde Organigrama.`
    );
  }

  const result = await prisma.user.deleteMany({ where: { id: targetUserId, companyId } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
}

export async function updateOwnPhone(companyId: string, userId: string, phone: string | null): Promise<SafeUser> {
  const result = await prisma.user.updateMany({ where: { id: userId, companyId }, data: { phone } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
  return prisma.user.findFirstOrThrow({ where: { id: userId, companyId }, select: SAFE_USER_SELECT });
}

export async function updateOwnJobPosition(
  companyId: string,
  userId: string,
  jobPositionId: string | null
): Promise<SafeUser> {
  const result = await prisma.user.updateMany({ where: { id: userId, companyId }, data: { jobPositionId } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
  return prisma.user.findFirstOrThrow({ where: { id: userId, companyId }, select: SAFE_USER_SELECT });
}

export interface UserActivitySummary {
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  activeSessionCount: number;
  recentActions: Array<{ id: string; action: AuditAction; entity: string; entityId: string; createdAt: Date }>;
}

/**
 * Resumen de "cómo trabaja con la plataforma" a partir de datos que ya
 * existían (sesiones y auditoría) — no hay un sistema de tracking nuevo que
 * mantener. `lastLoginAt` toma el `createdAt` de sesión más reciente (se crea
 * una fila nueva en cada login, revocada o no); `lastSeenAt`/el conteo de
 * activas solo miran sesiones vigentes.
 */
export async function getUserActivity(companyId: string, userId: string): Promise<UserActivitySummary> {
  const [lastSession, activeSessions, recentActions] = await Promise.all([
    prisma.userSession.findFirst({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.userSession.findMany({
      where: { companyId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { lastSeenAt: true },
    }),
    prisma.auditLog.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, entity: true, entityId: true, createdAt: true },
    }),
  ]);

  const lastSeenAt = activeSessions.reduce<Date | null>(
    (latest, s) => (!latest || s.lastSeenAt > latest ? s.lastSeenAt : latest),
    null
  );

  return {
    lastLoginAt: lastSession?.createdAt ?? null,
    lastSeenAt,
    activeSessionCount: activeSessions.length,
    recentActions,
  };
}

/**
 * Genera una contraseña temporal nueva y la reemplaza — nunca se guarda ni se
 * puede recuperar la original en claro (solo existió en el momento de
 * crearla). Es la vía correcta para "recuperar" un acceso perdido: una
 * credencial nueva y válida, no la vieja expuesta indefinidamente.
 */
export async function resetUserTemporaryPassword(
  companyId: string,
  actingUserId: string,
  targetUserId: string,
  actorRole: Role,
  options?: {
    /**
     * Cuando el admin se resetea la contraseña a sí mismo, invalidar la
     * sesión ya mismo (mustChangePassword/sessionVersion) la mataría a mitad
     * del refresh automático que Next.js dispara tras cualquier Server
     * Action — el diálogo con la clave nueva se cierra solo, antes de que
     * alcance a copiarla. Con esto en `true` solo se guarda el hash nuevo; la
     * invalidación real queda para `finalizeOwnPasswordReset`, recién cuando
     * ya confirmó haberla copiado.
     */
    deferInvalidation?: boolean;
  }
): Promise<CreateUserDirectResult> {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, companyId },
    include: { customRole: { select: { name: true } } },
  });
  if (!target) throw new Error('Usuario no encontrado');
  // El auto-reseteo (actingUserId === targetUserId) es el único caso legítimo
  // en que un OWNER/superadmin es su propio objetivo — no pasa por la
  // jerarquía porque no hay elevación de privilegio posible sobre uno mismo.
  if (actingUserId !== targetUserId) {
    assertCanManageTarget(actorRole, target);
  }

  const temporaryPassword = generateRandomPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const result = await prisma.user.updateMany({
    where: { id: targetUserId, companyId },
    data: options?.deferInvalidation
      ? { passwordHash }
      : { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  if (result.count === 0) throw new Error('Usuario no encontrado');

  const updated = await prisma.user.findFirstOrThrow({ where: { id: targetUserId, companyId }, select: SAFE_USER_SELECT });
  return { user: { ...updated, customRoleName: target.customRole?.name ?? null }, temporaryPassword };
}

/**
 * Segunda fase de un auto-reseteo iniciado con `deferInvalidation: true`:
 * recién acá se invalida la sesión activa del propio admin (sessionVersion) y
 * se exige elegir contraseña nueva al reingresar (mustChangePassword) — se
 * dispara cuando ya confirmó, en el diálogo, haber copiado la clave.
 */
export async function finalizeOwnPasswordReset(companyId: string, userId: string): Promise<void> {
  const result = await prisma.user.updateMany({
    where: { id: userId, companyId },
    data: { mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  if (result.count === 0) throw new Error('Usuario no encontrado');
}
