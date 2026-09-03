'use server';

import { revalidatePath } from 'next/cache';
import { headers, cookies } from 'next/headers';
import { Prisma, type Invitation, type Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookieServer, clearSessionCookieServer } from '@/lib/auth/session';
import { recordSession, revokeSessionByToken } from '@/lib/auth/sessions';
import { checkIpAllowlist } from '@/lib/auth/ip-allowlist-guard';
import * as usersService from '@/lib/services/users.service';
import type { SafeUser, TeamMember } from '@/lib/services/users.service';
import { INVITATION_TTL_DAYS } from '@/lib/services/users.service';
import { countSeatsInUse } from '@/modules/roles/services/roles.service';
import { getAppUrl, sendEmail, type EmailResult } from '@/lib/email/mailer';
import { buildInvitationEmail } from '@/lib/email/templates';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import type { CreateUserDirectResult } from '@/lib/services/users.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const ROLES: Role[] = ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'];

const inviteUserSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  role: z.enum(ROLES as [Role, ...Role[]]),
  customRoleId: z.string().nullable().optional(),
});

const createUserDirectSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  name: z.string().min(2, 'El nombre es obligatorio'),
  role: z.enum(ROLES as [Role, ...Role[]]),
  customRoleId: z.string().nullable().optional(),
});

const acceptInvitationSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  password: passwordPolicySchema,
});

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe una invitación pendiente para ese correo';
  }
  return toFriendlyErrorMessage(error);
}

export async function listUsersAction(): Promise<ActionResult<TeamMember[]>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const data = await usersService.listUsers(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPendingInvitationsAction(): Promise<ActionResult<Invitation[]>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const data = await usersService.listPendingInvitations(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function inviteUserAction(input: unknown): Promise<ActionResult<Invitation>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const parsed = inviteUserSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    if (parsed.data.role === 'OWNER' && session.role !== 'OWNER') {
      return { success: false, error: 'Solo un Dueño (OWNER) puede invitar a otro Dueño' };
    }

    // Cupo del plan: usuarios activos + invitaciones vigentes.
    const context = session;
    const seatsInUse = await countSeatsInUse(session.companyId);
    const alreadyInvited = await prisma.invitation.findFirst({
      where: { companyId: session.companyId, email: parsed.data.email, acceptedAt: null },
      select: { id: true },
    });
    // Reinvitar a alguien ya invitado no consume una licencia adicional.
    if (!alreadyInvited && seatsInUse >= context.maxUsers) {
      return {
        success: false,
        error: `Tu plan ${context.planName} permite ${context.maxUsers} usuarios y ya están ocupados. Libera un cupo o solicita una ampliación de plan`,
      };
    }

    const data = await usersService.inviteUser(session.companyId, parsed.data);
    const delivery = await deliverInvitationEmail(data, session.companyName, session.email);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Invitation',
      entityId: data.id,
      metadata: { email: data.email, role: data.role, envioCorreo: delivery.status },
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data, message: invitationMessage(delivery.status, data.email) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Crea la cuenta al instante, sin invitación por correo: el administrador ya
 * acordó la contraseña con la persona por otro medio.
 */
export async function createUserDirectAction(input: unknown): Promise<ActionResult<CreateUserDirectResult>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const parsed = createUserDirectSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    if (parsed.data.role === 'OWNER' && session.role !== 'OWNER') {
      return { success: false, error: 'Solo un Dueño (OWNER) puede crear otro Dueño' };
    }

    const data = await usersService.createUserDirect(session.companyId, parsed.data);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'User',
      entityId: data.user.id,
      metadata: { email: data.user.email, role: data.user.role, viaInvitation: false, temporaryPassword: true },
    });
    revalidatePath('/dashboard/settings/users');
    return {
      success: true,
      data,
      message: `Cuenta creada para ${data.user.email}. Copia la contraseña temporal y entrégasela: no volverá a mostrarse.`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Envía el correo de invitación. Nunca lanza: la invitación ya quedó guardada y
 * un fallo del proveedor de correo no debe deshacerla — el administrador
 * siempre puede copiar el enlace a mano desde el panel de Equipo.
 */
async function deliverInvitationEmail(
  invitation: Invitation,
  companyName: string,
  inviterEmail: string
): Promise<EmailResult> {
  const acceptUrl = `${getAppUrl()}/accept-invitation?token=${invitation.token}`;
  const email = buildInvitationEmail({
    companyName,
    roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
    inviterName: inviterEmail,
    acceptUrl,
    expiresInDays: INVITATION_TTL_DAYS,
  });
  return sendEmail({ to: invitation.email, ...email });
}

function invitationMessage(status: EmailResult['status'], email: string): string {
  if (status === 'sent') return `Invitación enviada a ${email}`;
  if (status === 'logged') {
    return `Invitación creada. El envío de correo no está configurado: copia el enlace desde la lista para compartirlo.`;
  }
  return `Invitación creada, pero el correo a ${email} no pudo enviarse. Copia el enlace desde la lista para compartirlo.`;
}

export async function revokeInvitationAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    await usersService.revokeInvitation(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Invitation',
      entityId: id,
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data: null, message: 'Invitación revocada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function resendInvitationAction(id: string): Promise<ActionResult<Invitation>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    // `resendInvitation` rota el token, así que el enlace anterior deja de
    // servir y hay que mandar el nuevo por correo.
    const data = await usersService.resendInvitation(session.companyId, id);
    const delivery = await deliverInvitationEmail(data, session.companyName, session.email);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Invitation',
      entityId: id,
      metadata: { resent: true, envioCorreo: delivery.status },
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data, message: invitationMessage(delivery.status, data.email) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const roleSchema = z.enum(ROLES as [Role, ...Role[]]);

export async function changeUserRoleAction(userId: string, role: Role): Promise<ActionResult<SafeUser>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const parsedRole = roleSchema.safeParse(role);
    if (!parsedRole.success) return { success: false, error: 'Rol inválido' };
    if (parsedRole.data === 'OWNER' && session.role !== 'OWNER') {
      return { success: false, error: 'Solo un Dueño (OWNER) puede asignar el rol de Dueño' };
    }
    const data = await usersService.changeUserRole(session.companyId, session.id, userId, parsedRole.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      metadata: { newRole: role },
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data, message: 'Rol actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function toggleUserStatusAction(userId: string): Promise<ActionResult<SafeUser>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const data = await usersService.toggleUserStatus(session.companyId, session.id, userId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      metadata: { isActive: data.isActive },
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data, message: data.isActive ? 'Usuario reactivado' : 'Usuario suspendido' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    await usersService.deleteUser(session.companyId, session.id, userId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'User',
      entityId: userId,
    });
    revalidatePath('/dashboard/settings/users');
    return { success: true, data: null, message: 'Usuario eliminado. Ya puedes invitar o crear de nuevo ese correo' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function resetUserPasswordAction(
  userId: string
): Promise<ActionResult<CreateUserDirectResult & { isSelf: boolean }>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const isSelf = userId === session.id;
    // Auto-reseteo: diferimos invalidar la sesión (ver
    // `resetUserTemporaryPassword`/`finalizeOwnPasswordResetAction`) para que
    // el admin alcance a ver y copiar la clave nueva antes de que se cierre
    // su propia sesión.
    const data = await usersService.resetUserTemporaryPassword(session.companyId, userId, {
      deferInvalidation: isSelf,
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      metadata: { reason: isSelf ? 'self_password_reset' : 'admin_password_reset', temporaryPassword: true },
    });
    // Si es auto-reseteo, NO revalidar todavía: el refresh automático que
    // dispara Next.js tras una Server Action con `revalidatePath` volvería a
    // ejecutar el layout del dashboard, que vería `mustChangePassword`/
    // `sessionVersion` ya desactualizados una vez que se apliquen — pero acá
    // se difieren justamente para evitar eso. Se revalida recién en
    // `finalizeOwnPasswordResetAction`, cuando ya no importa (la sesión
    // termina de todos modos).
    if (!isSelf) revalidatePath('/dashboard/settings/users');
    return {
      success: true,
      data: { ...data, isSelf },
      message: `Nueva contraseña temporal generada para ${data.user.email}`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Fase 2 del auto-reseteo: el admin ya vio y copió la clave nueva en el
 * diálogo, así que ahora sí se invalida su sesión activa (sessionVersion +
 * mustChangePassword) y se cierra — al reingresar con la clave temporal
 * pasará por el flujo normal de cambio obligatorio de contraseña.
 */
export async function finalizeOwnPasswordResetAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    await usersService.finalizeOwnPasswordReset(session.companyId, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: session.id,
      metadata: { reason: 'self_password_reset_confirmed' },
    });

    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (token) await revokeSessionByToken(token);
    await clearSessionCookieServer();

    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getInvitationByTokenAction(
  token: string
): Promise<ActionResult<{ email: string; role: Role; companyName: string; expired: boolean }>> {
  try {
    const invitation = await usersService.getInvitationByToken(token);
    if (!invitation || invitation.acceptedAt) return { success: false, error: 'Invitación no válida' };
    return {
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        companyName: invitation.company.businessName,
        expired: invitation.expiresAt < new Date(),
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function acceptInvitationAction(token: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = acceptInvitationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const user = await usersService.acceptInvitation(token, parsed.data);

    const headerList = await headers();
    const clientIp = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    // Aceptar una invitación termina en una sesión real igual que el login:
    // sin este chequeo, alguien con un enlace de invitación filtrado podía
    // crear su cuenta y entrar desde cualquier IP, saltándose por completo
    // la restricción que la empresa configuró.
    const ipError = await checkIpAllowlist(user.companyId, user.isSuperAdmin, clientIp);
    if (ipError) return { success: false, error: ipError };

    const company = user.companyId ? await prisma.company.findUnique({ where: { id: user.companyId } }) : null;
    await createAuditLog({
      companyId: user.companyId ?? '',
      userId: user.id,
      userEmail: user.email,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role, viaInvitation: true },
    });

    const sessionToken = await createSessionToken({
      id: user.id,
      role: user.role,
      email: user.email,
      companyId: user.companyId ?? undefined,
      companyName: company?.businessName,
      sessionVersion: user.sessionVersion,
    });
    await setSessionCookieServer(sessionToken);
    if (user.companyId) {
      await recordSession({
        userId: user.id,
        companyId: user.companyId,
        token: sessionToken,
        userAgent: headerList.get('user-agent'),
        ipAddress: clientIp,
      });
    }

    return { success: true, data: null, message: 'Cuenta creada correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

