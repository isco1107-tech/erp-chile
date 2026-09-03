'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { getAppUrl, sendEmail } from '@/lib/email/mailer';
import { buildPasswordResetEmail } from '@/lib/email/templates';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import {
  RESET_TOKEN_TTL_MINUTES,
  checkPasswordResetToken,
  createPasswordResetToken,
  resetPasswordWithToken,
  type ResetTokenState,
} from '@/lib/services/password-reset.service';
import { checkRateLimit, RESET_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { logSecurityEvent } from '@/lib/security/security-logger';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const requestSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
});

const resetSchema = z
  .object({
    token: z.string().min(1, 'Enlace inválido'),
    password: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

/**
 * Extrae la IP del cliente desde headers de Server Action.
 * En Vercel, `x-forwarded-for` es confiable (la plataforma lo sobreescribe).
 */
async function getServerActionIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
    return headerList.get('x-real-ip') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function getServerActionUserAgent(): Promise<string | null> {
  try {
    const headerList = await headers();
    return headerList.get('user-agent');
  } catch {
    return null;
  }
}

/**
 * Solicita el enlace de recuperación.
 *
 * Responde SIEMPRE lo mismo exista o no la cuenta. Si respondiera "ese correo
 * no está registrado", el formulario se convertiría en un oráculo para saber
 * quién tiene cuenta en la plataforma — que es exactamente la lista que busca
 * quien prepara un ataque de credenciales.
 */
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const genericMessage =
    'Si ese correo tiene una cuenta activa, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja de entrada y la carpeta de spam.';

  // ── Rate limit por IP: frena email bombing y enumeración masiva ──────
  const clientIp = await getServerActionIp();
  const rl = checkRateLimit(clientIp, RESET_RATE_LIMIT);
  if (!rl.allowed) {
    const userAgent = await getServerActionUserAgent();
    logSecurityEvent({
      type: 'RATE_LIMITED',
      ip: clientIp,
      userAgent,
      metadata: { route: 'requestPasswordResetAction', limit: rl.limit },
    });
    // Se devuelve el mensaje genérico igualmente — un 429 explícito confirmaría
    // que el rate limit existe y da información al atacante sobre los umbrales.
    return { success: true, data: null, message: genericMessage };
  }

  try {
    const created = await createPasswordResetToken(parsed.data.email);

    if (created) {
      const resetUrl = `${getAppUrl()}/reset-password?token=${created.token}`;
      const email = buildPasswordResetEmail({
        userName: created.user.name,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      });
      await sendEmail({ to: created.user.email, ...email });
    }

    const userAgent = await getServerActionUserAgent();
    logSecurityEvent({
      type: 'PASSWORD_RESET_REQUESTED',
      email: parsed.data.email,
      ip: clientIp,
      userAgent,
    });

    return { success: true, data: null, message: genericMessage };
  } catch (error) {
    console.error('requestPasswordResetAction falló:', error);
    // Tampoco acá se distingue: un error interno no debe revelar si el correo
    // existía. Queda en el log del servidor para diagnosticarlo.
    return { success: true, data: null, message: genericMessage };
  }
}

export async function checkResetTokenAction(token: string): Promise<ActionResult<{ email: string }>> {
  const check = await checkPasswordResetToken(token);
  if (check.state === 'valid' && check.email) {
    return { success: true, data: { email: check.email } };
  }
  return { success: false, error: describeTokenState(check.state) };
}

function describeTokenState(state: ResetTokenState): string {
  if (state === 'expired') return 'Este enlace venció. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".';
  if (state === 'used') return 'Este enlace ya fue utilizado. Solicita uno nuevo si necesitas cambiar la contraseña.';
  return 'Enlace de recuperación inválido.';
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const outcome = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!outcome.ok) return { success: false, error: describeTokenState(outcome.reason) };

  const clientIp = await getServerActionIp();
  const userAgent = await getServerActionUserAgent();
  logSecurityEvent({
    type: 'PASSWORD_CHANGED',
    ip: clientIp,
    userAgent,
    metadata: { via: 'reset-link' },
  });

  return { success: true, data: null, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
}
