'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { assertPasswordChangeNotPending, authErrorMessage, getAuthContext, type AuthContext } from '@/lib/auth/guards';
import { hashSessionToken } from '@/lib/auth/sessions';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { getVapidConfig, pushSubscriptionSchema } from '@/lib/notifications/web-push';
import type { ActionResult } from '@/lib/actions/notifications';

/*
 * Sin `requireAuthWithPermission` a propósito, igual que la campanita
 * (src/lib/actions/notifications.ts): activar avisos en el propio dispositivo
 * no es una acción sobre datos de la empresa sino recibir lo que la campanita
 * ya le muestra a cualquier usuario activo. `getAuthContext` sí exige sesión
 * válida, usuario activo, empresa operativa y acceso a ella.
 */

/** Tope de dispositivos por usuario: cada aviso es un POST saliente por dispositivo. */
const MAX_DEVICES_PER_USER = 10;

const endpointSchema = z.string().min(1).max(1000);

/**
 * Fila de `UserSession` de la cookie actual. La suscripción queda atada a
 * ella: cerrar sesión o revocar el dispositivo apaga los avisos. Sin fila no
 * se puede revocar, así que no se permite activar.
 */
async function currentSession(context: AuthContext): Promise<{ id: string; sessionVersion: number } | null> {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  const [session, user] = await Promise.all([
    prisma.userSession.findFirst({
      where: { tokenHash: hashSessionToken(token), userId: context.id, companyId: context.companyId, revokedAt: null },
      select: { id: true },
    }),
    prisma.user.findFirst({ where: { id: context.id }, select: { sessionVersion: true } }),
  ]);
  return session && user ? { id: session.id, sessionVersion: user.sessionVersion } : null;
}

/** La lista de IP permitidas limita desde dónde se ve la empresa; un push llegaría a cualquier red. */
async function ipAllowlistEnabled(companyId: string): Promise<boolean> {
  const settings = await prisma.companySettings.findFirst({ where: { companyId }, select: { ipAllowlistEnabled: true } });
  return settings?.ipAllowlistEnabled ?? false;
}

/**
 * Estado de los avisos para este navegador: la llave pública VAPID (`null`
 * si no se ofrecen) y si el `endpoint` que ya tiene el navegador está activo
 * para ESTA persona y ESTA sesión. Sin esa consulta, en un navegador
 * compartido el siguiente usuario vería "activado" con la suscripción de otro.
 */
export async function getPushStatusAction(endpoint: string | null): Promise<ActionResult<{ publicKey: string | null; subscribed: boolean }>> {
  try {
    const context = await getAuthContext();
    assertPasswordChangeNotPending(context);
    const vapid = getVapidConfig();
    if (!vapid || (await ipAllowlistEnabled(context.companyId))) return { success: true, data: { publicKey: null, subscribed: false } };

    const parsedEndpoint = endpointSchema.safeParse(endpoint);
    if (!parsedEndpoint.success) return { success: true, data: { publicKey: vapid.publicKey, subscribed: false } };

    const session = await currentSession(context);
    const row = session
      ? await prisma.pushSubscription.findFirst({
          where: { endpoint: parsedEndpoint.data, userId: context.id, companyId: context.companyId, sessionId: session.id },
          select: { id: true },
        })
      : null;
    return { success: true, data: { publicKey: vapid.publicKey, subscribed: row !== null } };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? 'No se pudo revisar la configuración de avisos' };
  }
}

export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const context = await getAuthContext();
    assertPasswordChangeNotPending(context);
    companyId = context.companyId;
    if (!getVapidConfig()) return { success: false, error: 'Los avisos en el dispositivo no están habilitados en este servidor' };
    if (await ipAllowlistEnabled(context.companyId)) {
      return { success: false, error: 'Tu empresa limita el acceso por IP, así que los avisos en el dispositivo están desactivados' };
    }

    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Suscripción inválida' };

    const session = await currentSession(context);
    if (!session) return { success: false, error: 'Vuelve a iniciar sesión para activar los avisos en este dispositivo' };

    const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
    const { endpoint, keys } = parsed.data;
    const owner = { userId: context.id, companyId: context.companyId, sessionId: session.id, sessionVersion: session.sessionVersion };
    // El endpoint es del navegador, no de la persona: si en este mismo
    // navegador entra otro usuario u otra empresa, los avisos pasan a ser
    // de quien está ahora (y de su sesión).
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent, ...owner },
      update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, ...owner, lastSuccessAt: null },
    });

    const extra = await prisma.pushSubscription.findMany({
      where: { userId: context.id },
      orderBy: { createdAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (extra.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { userId: context.id, id: { in: extra.map((row) => row.id) } } });
    }
    return { success: true, data: null, message: 'Avisos activados en este dispositivo' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'push', companyId });
    return { success: false, error: 'No se pudieron activar los avisos en este dispositivo' };
  }
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const context = await getAuthContext();
    companyId = context.companyId;
    const parsed = endpointSchema.safeParse(endpoint);
    if (!parsed.success) return { success: false, error: 'Suscripción inválida' };
    // Por usuario y no por empresa: el dispositivo pudo quedar suscrito
    // estando en otra de sus empresas, y "desactivar" debe apagarlo igual.
    // Solo las propias: nadie puede apagarle los avisos a otro.
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data, userId: context.id } });
    return { success: true, data: null, message: 'Avisos desactivados en este dispositivo' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'push', companyId });
    return { success: false, error: 'No se pudieron desactivar los avisos' };
  }
}
