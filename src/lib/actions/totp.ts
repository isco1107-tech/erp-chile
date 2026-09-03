'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { getAuthContext, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import { encryptTotpSecret, decryptTotpSecret } from '@/lib/auth/totp-crypto';
import { generateTotpSecret, buildTotpUri, verifyTotpCode, generateBackupCodes } from '@/lib/auth/totp';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export interface BackupCodesResult {
  backupCodes: string[];
}

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export interface TotpStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getTotpStatusAction(): Promise<ActionResult<TotpStatus>> {
  try {
    const context = await getAuthContext();
    const [user, backupCodesRemaining] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: context.id }, select: { totpEnabled: true } }),
      prisma.totpBackupCode.count({ where: { userId: context.id, usedAt: null } }),
    ]);
    return { success: true, data: { enabled: user.totpEnabled, backupCodesRemaining } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const passwordConfirmSchema = z.object({ password: z.string().min(1, 'Ingresa tu contraseña') });

async function assertPassword(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error('Contraseña incorrecta');
}

export interface TotpSetupData {
  secret: string;
  qrDataUrl: string;
}

/**
 * Genera un secreto nuevo y lo guarda cifrado — `totpEnabled` sigue en
 * `false` hasta que `confirmTotpSetupAction` verifique un código real.
 * Exige contraseña igual que desactivar/regenerar: sin esto, cualquiera con
 * la sesión ya abierta (sin conocer la contraseña) podía reemplazar el 2FA
 * de una cuenta activa, o activar 2FA a espaldas del dueño de la cuenta y
 * dejarlo bloqueado en su próximo login.
 */
export async function startTotpSetupAction(input: unknown): Promise<ActionResult<TotpSetupData>> {
  try {
    const context = await getAuthContext();
    const parsed = passwordConfirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await assertPassword(context.id, parsed.data.password);

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: context.id },
      data: { totpSecret: encryptTotpSecret(secret), totpEnabled: false },
    });
    const uri = buildTotpUri(secret, context.email);
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { success: true, data: { secret, qrDataUrl } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const confirmSetupSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Debe ser un código de 6 dígitos') });

export async function confirmTotpSetupAction(input: unknown): Promise<ActionResult<BackupCodesResult>> {
  try {
    const context = await getAuthContext();
    const parsed = confirmSetupSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Código inválido' };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.id }, select: { totpSecret: true } });
    if (!user.totpSecret) return { success: false, error: 'Primero genera un código QR' };

    const valid = await verifyTotpCode(decryptTotpSecret(user.totpSecret), parsed.data.code);
    if (!valid) return { success: false, error: 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo' };

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)));

    await prisma.$transaction([
      prisma.totpBackupCode.deleteMany({ where: { userId: context.id } }),
      prisma.totpBackupCode.createMany({ data: hashed.map((codeHash) => ({ userId: context.id, codeHash })) }),
      prisma.user.update({ where: { id: context.id }, data: { totpEnabled: true } }),
    ]);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'totp_enabled' },
    });

    return { success: true, data: { backupCodes }, message: 'Verificación en dos pasos activada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function disableTotpAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const context = await getAuthContext();
    const parsed = passwordConfirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await assertPassword(context.id, parsed.data.password);

    await prisma.$transaction([
      prisma.totpBackupCode.deleteMany({ where: { userId: context.id } }),
      prisma.user.update({
        where: { id: context.id },
        data: { totpSecret: null, totpEnabled: false, totpFailedAttempts: 0, totpLockedUntil: null },
      }),
    ]);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'totp_disabled' },
    });

    return { success: true, data: null, message: 'Verificación en dos pasos desactivada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regenerateBackupCodesAction(input: unknown): Promise<ActionResult<BackupCodesResult>> {
  try {
    const context = await getAuthContext();
    const parsed = passwordConfirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await assertPassword(context.id, parsed.data.password);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.id }, select: { totpEnabled: true } });
    if (!user.totpEnabled) return { success: false, error: 'La verificación en dos pasos no está activa' };

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)));

    await prisma.$transaction([
      prisma.totpBackupCode.deleteMany({ where: { userId: context.id } }),
      prisma.totpBackupCode.createMany({ data: hashed.map((codeHash) => ({ userId: context.id, codeHash })) }),
    ]);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'totp_backup_codes_regenerated' },
    });

    return { success: true, data: { backupCodes }, message: 'Códigos de respaldo regenerados' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
