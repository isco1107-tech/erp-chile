'use server';

import { revalidatePath } from 'next/cache';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import { createPlatformAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { deleteTenantSchema } from '../schema';
import { getTenantSnapshot, verifyTotpAndDeleteTenant } from '../services/platform-delete.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const TOTP_NOT_ENABLED_MESSAGE =
  'Debes activar la verificación en dos pasos en tu cuenta antes de poder eliminar empresas';

function toErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  return toFriendlyErrorMessage(error);
}

/**
 * Borrado PERMANENTE (hard delete, sin papelera) de una empresa completa:
 * usuarios, ventas, compras, inventario y contabilidad — todo. No hay forma
 * de deshacerlo. Exige que el propio superadmin tenga 2FA activo y confirme
 * con un código TOTP de 6 dígitos vigente (ver
 * src/modules/platform/services/platform-delete.service.ts para el detalle
 * del borrado y el lock anti fuerza-bruta del código).
 */
export async function deleteTenantAction(companyId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();

    // Chequeo temprano: si el superadmin no tiene 2FA activo, se rechaza sin
    // tocar nada más (ni siquiera se valida el código recibido).
    const superAdmin = await prisma.user.findUnique({
      where: { id: session.id },
      select: { totpEnabled: true },
    });
    if (!superAdmin?.totpEnabled) {
      return { success: false, error: TOTP_NOT_ENABLED_MESSAGE };
    }

    const parsed = deleteTenantSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Código inválido' };
    }

    // Snapshot ANTES de la transacción destructiva: es lo único que queda
    // disponible para la bitácora de plataforma una vez que la empresa (y su
    // propia bitácora interna, AuditLog) ya no exista.
    const tenant = await getTenantSnapshot(companyId);
    if (!tenant) return { success: false, error: 'Empresa no encontrada' };

    const outcome = await verifyTotpAndDeleteTenant({
      superAdminId: session.id,
      companyId,
      code: parsed.data.code,
    });

    if (outcome.kind === 'totp_not_configured') {
      return { success: false, error: TOTP_NOT_ENABLED_MESSAGE };
    }
    if (outcome.kind === 'locked') {
      return {
        success: false,
        error: `Demasiados intentos fallidos. Vuelve a intentar en ${outcome.minutesLeft} minuto(s)`,
      };
    }
    if (outcome.kind === 'invalid_code') {
      return { success: false, error: 'Código incorrecto' };
    }

    // La transacción de borrado ya confirmó (commit): recién ahora es seguro
    // dejar constancia. Nunca antes, y nunca dentro de la misma transacción
    // que borra la empresa.
    await createPlatformAuditLog({
      action: 'COMPANY_DELETED',
      companyId: tenant.id,
      companyRut: tenant.rut,
      companyBusinessName: tenant.businessName,
      performedByUserId: session.id,
      performedByEmail: session.email,
      metadata: { reason: 'hard_delete_by_superadmin' },
    });

    revalidatePath('/superadmin/companies');
    revalidatePath('/superadmin');
    revalidatePath('/superadmin/platform-audit-log');

    return { success: true, data: null, message: `Empresa ${tenant.businessName} eliminada permanentemente` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
