'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { headers } from 'next/headers';
import { getAuthContext, authErrorMessage } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookieServer } from '@/lib/auth/session';
import { recordSession } from '@/lib/auth/sessions';
import { createAuditLog } from '@/lib/auth/audit';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import { getClientIp } from '@/lib/security/cloudflare';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const schema = z
  .object({
    password: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

/**
 * Completa el cambio obligatorio de contraseña de primer ingreso. A
 * diferencia de `resetPasswordAction` (token público, sin sesión), esta
 * requiere una sesión activa: es exactamente el "sí, ya entré con la
 * temporal, ahora quiero la mía" — por eso reemite la cookie con la sesión
 * incrementada en vez de forzar un login nuevo.
 */
export async function completeForcedPasswordChangeAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const context = await getAuthContext();
    // Esta acción solo existe para el cambio obligatorio de primer ingreso —
    // no hay (todavía) un flujo de cambio de contraseña voluntario en el
    // sistema. Sin este chequeo, una sesión robada o un equipo abierto podía
    // usarla para fijar una contraseña permanente en cualquier momento, sin
    // volver a pedir la actual (SEG-02).
    if (!context.mustChangePassword) {
      return { success: false, error: 'No hay un cambio de contraseña pendiente' };
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    // `sessionVersion: increment` invalida cualquier otra sesión abierta con
    // la contraseña temporal (por ejemplo, si alguien más también la tenía) —
    // la que se reemite acá abajo queda al día porque lleva el valor nuevo.
    const updated = await prisma.user.update({
      where: { id: context.id },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });

    const token = await createSessionToken({
      id: updated.id,
      role: updated.role,
      email: updated.email,
      companyId: updated.companyId ?? undefined,
      companyName: context.companyName,
      isSuperAdmin: updated.isSuperAdmin,
      sessionVersion: updated.sessionVersion,
    });
    await setSessionCookieServer(token);
    if (updated.companyId) {
      const headerList = await headers();
      await recordSession({
        userId: updated.id,
        companyId: updated.companyId,
        token,
        userAgent: headerList.get('user-agent'),
        ipAddress: getClientIp(headerList),
      });
    }

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'forced_password_change' },
    });

    return { success: true, data: null, message: 'Contraseña actualizada correctamente' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    if (error instanceof Error) return { success: false, error: error.message };
    return { success: false, error: 'Ocurrió un error inesperado' };
  }
}
