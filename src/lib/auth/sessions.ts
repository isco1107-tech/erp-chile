import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/mailer';
import { buildNewLoginNoticeEmail } from '@/lib/email/templates';

/**
 * Registro paralelo de sesiones para la pantalla "Dispositivos activos".
 *
 * El sistema de autenticación sigue siendo JWT sin estado — esto no lo
 * reemplaza. Es una tabla que se llena junto al token (mismo evento: login,
 * aceptar invitación, cambio de contraseña) y que cada request consulta para
 * saber si esa sesión en particular fue cerrada a mano desde otro
 * dispositivo, algo que un JWT por sí solo no puede expresar.
 */

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** No vale la pena escribir `lastSeenAt` en cada request; alcanza con refrescarlo cada tanto. */
const TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sessionExpiryFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export interface RecordSessionInput {
  userId: string;
  companyId: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Crea la fila de sesión. Nunca debe poder tumbar el login si falla — se traga cualquier error. */
export async function recordSession(input: RecordSessionInput): Promise<void> {
  try {
    const ipAddress = input.ipAddress?.slice(0, 100) || null;

    // Antes de crear la fila: ¿esta IP ya inició sesión con esta cuenta
    // alguna vez? Si nunca (y la cuenta ya tenía sesiones previas, para no
    // avisar en el login de bienvenida de una cuenta recién creada), es una
    // señal de seguridad real — se avisa por correo fuera de este await
    // para no demorar el login por un problema de SMTP.
    if (ipAddress) {
      void checkAndNotifyNewLoginLocation(input.userId, ipAddress, input.userAgent ?? null);
    }

    await prisma.userSession.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        tokenHash: hashSessionToken(input.token),
        userAgent: input.userAgent?.slice(0, 300) || null,
        ipAddress,
        expiresAt: sessionExpiryFromNow(),
      },
    });
  } catch (error) {
    console.error('No se pudo registrar la sesión para "Dispositivos activos":', error);
  }
}

/**
 * Aviso de seguridad: nuevo inicio de sesión desde una IP que esta cuenta
 * nunca había usado. Corre ANTES de crear la fila nueva a propósito —
 * necesita que la ausencia de coincidencias sea real, no un artefacto de
 * haber creado la fila un instante antes en la misma llamada. `isFirstLogin`
 * (cuenta sin ninguna sesión previa) se excluye a propósito: el primer login
 * de una cuenta nueva siempre es "una IP nunca vista", y avisar ahí sería
 * ruido, no una señal de seguridad.
 */
async function checkAndNotifyNewLoginLocation(userId: string, ipAddress: string, userAgent: string | null): Promise<void> {
  try {
    const [priorSessionCount, sameIpCount] = await Promise.all([
      prisma.userSession.count({ where: { userId } }),
      prisma.userSession.count({ where: { userId, ipAddress } }),
    ]);
    const isFirstLoginEver = priorSessionCount === 0;
    if (isFirstLoginEver || sameIpCount > 0) return;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;

    const email = buildNewLoginNoticeEmail({ userName: user.name, ipAddress, userAgent, loginAt: new Date() });
    await sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text });
  } catch (error) {
    console.error('checkAndNotifyNewLoginLocation: fallo al enviar aviso de nuevo inicio de sesión:', error);
  }
}

/**
 * `false` si la sesión no está registrada (tokens emitidos antes de este
 * cambio, o el propio registro falló) — nunca bloquea por no tener fila.
 * Solo bloquea cuando SÍ hay fila y quedó `revokedAt` explícito.
 */
export async function isSessionRevoked(token: string): Promise<boolean> {
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { revokedAt: true },
  });
  return session?.revokedAt != null;
}

export async function touchSession(token: string): Promise<void> {
  try {
    await prisma.userSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null, lastSeenAt: { lt: new Date(Date.now() - TOUCH_THROTTLE_MS) } },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // No crítico: si falla, la próxima request lo vuelve a intentar.
  }
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { tokenHash: hashSessionToken(token) },
    data: { revokedAt: new Date() },
  });
}
