import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

/** Ventana corta a propósito: es un enlace que da control total de la cuenta. */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** Estados de tenant que permiten operar; debe coincidir con `guards.ts`. */
const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'];

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * El token se guarda hasheado. Se usa SHA-256 y no bcrypt porque hay que
 * BUSCAR por el token: bcrypt genera un salt distinto cada vez y obligaría a
 * recorrer la tabla comparando uno por uno. SHA-256 es suficiente acá porque el
 * token tiene 256 bits de entropía real — no es una contraseña adivinable, que
 * es el único escenario donde bcrypt aporta sobre un hash rápido.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CreatedResetToken {
  token: string;
  user: { id: string; email: string; name: string };
  expiresAt: Date;
}

/**
 * Emite un token de recuperación si el correo corresponde a una cuenta que
 * puede operar. Devuelve `null` en cualquier otro caso — cuenta inexistente,
 * suspendida o de una empresa suspendida — y el llamador debe responder lo
 * mismo en todos los casos para no filtrar qué correos están registrados.
 */
export async function createPasswordResetToken(email: string): Promise<CreatedResetToken | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { company: { select: { status: true } } },
  });

  if (!user || !user.isActive) return null;
  // Un usuario de empresa suspendida no podría iniciar sesión igual; emitirle
  // un enlace solo lo llevaría a un callejón sin salida.
  if (!user.isSuperAdmin && user.company && !OPERATIONAL_STATUSES.includes(user.company.status)) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // Pedir un enlace nuevo invalida los anteriores: si alguien solicitó el
    // cambio por error, el enlace que ya viajó por correo deja de servir.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
  });

  return { token, user: { id: user.id, email: user.email, name: user.name }, expiresAt };
}

export type ResetTokenState = 'valid' | 'not_found' | 'expired' | 'used';

export interface ResetTokenCheck {
  state: ResetTokenState;
  email?: string;
}

export async function checkPasswordResetToken(token: string): Promise<ResetTokenCheck> {
  if (!token) return { state: 'not_found' };

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true, isActive: true } } },
  });

  if (!record || !record.user.isActive) return { state: 'not_found' };
  if (record.usedAt) return { state: 'used' };
  if (record.expiresAt < new Date()) return { state: 'expired' };

  return { state: 'valid', email: record.user.email };
}

export type ResetOutcome = { ok: true } | { ok: false; reason: ResetTokenState };

/**
 * Canjea el token y fija la nueva contraseña.
 *
 * El consumo del token va condicionado con `updateMany ... usedAt: null` dentro
 * de la transacción: si dos peticiones llegan con el mismo enlace, solo una
 * afecta filas y la otra falla, en vez de que ambas escriban una contraseña.
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<ResetOutcome> {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, isActive: true } } },
  });

  if (!record || !record.user.isActive) return { ok: false, reason: 'not_found' };
  if (record.usedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' };

  const passwordHash = await bcrypt.hash(newPassword, 12);

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return { ok: false, reason: 'used' as const };

    await tx.user.update({ where: { id: record.user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    return { ok: true as const };
  });
}
