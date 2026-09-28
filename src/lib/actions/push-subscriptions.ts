'use server';

import { headers } from 'next/headers';
import { authErrorMessage, getAuthContext } from '@/lib/auth/guards';
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

/** Llave pública VAPID para `pushManager.subscribe`. `null` si el servidor no tiene push configurado. */
export async function getPushPublicKeyAction(): Promise<ActionResult<{ publicKey: string | null }>> {
  try {
    await getAuthContext();
    return { success: true, data: { publicKey: getVapidConfig()?.publicKey ?? null } };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? 'No se pudo revisar la configuración de avisos' };
  }
}

export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const context = await getAuthContext();
    companyId = context.companyId;
    if (!getVapidConfig()) return { success: false, error: 'Los avisos en el dispositivo no están habilitados en este servidor' };

    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Suscripción inválida' };

    const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
    const { endpoint, keys } = parsed.data;
    // El endpoint es del navegador, no de la persona: si en este mismo
    // navegador entra otro usuario u otra empresa, los avisos pasan a ser
    // de quien está ahora.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent, userId: context.id, companyId: context.companyId },
      update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, userId: context.id, companyId: context.companyId, lastSuccessAt: null },
    });
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
    if (typeof endpoint !== 'string' || endpoint.length > 1000) return { success: false, error: 'Suscripción inválida' };
    // Por usuario y no por empresa: el dispositivo pudo quedar suscrito
    // estando en otra de sus empresas, y "desactivar" debe apagarlo igual.
    // Solo las propias: nadie puede apagarle los avisos a otro.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: context.id } });
    return { success: true, data: null, message: 'Avisos desactivados en este dispositivo' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'push', companyId });
    return { success: false, error: 'No se pudieron desactivar los avisos' };
  }
}
