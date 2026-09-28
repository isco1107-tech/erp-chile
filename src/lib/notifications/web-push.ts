import 'server-only';
import webpush from 'web-push';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import { toFeatureFlags } from '@/lib/auth/modules';
import { captureException } from '@/lib/observability';

/**
 * Avisos Web Push a los dispositivos (navegador o PWA instalada) que los
 * activaron. Recibe exactamente lo mismo que la campanita de la empresa
 * (`WorkflowNotification`): no es un canal con reglas propias.
 *
 * Sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT todo es un no-op y
 * la opción no aparece en la interfaz. Las llaves se generan una vez con
 * `npx web-push generate-vapid-keys`; cambiarlas invalida todas las
 * suscripciones existentes.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Servicios push de los navegadores reales. El servidor hace un POST al
 * `endpoint` que manda el navegador: sin esta lista, cualquiera con sesión
 * podría registrar una URL interna (metadata de la nube, la red privada) y
 * usar el envío de avisos como SSRF.
 */
const PUSH_SERVICE_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge heredado (WNS)
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari / iOS
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname));
}

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+=*$/, 'Llave inválida');

/** Lo que entrega `PushSubscription.toJSON()` en el navegador. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, 'Servicio de notificaciones no reconocido'),
  keys: z.object({
    p256dh: base64Url.max(200),
    auth: base64Url.max(100),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta interna a abrir al tocar el aviso. */
  href: string;
}

const MAX_TITLE = 80;
const MAX_BODY = 180;

/**
 * Arma el contenido del aviso. `href` solo puede ser una ruta interna: el
 * service worker abre lo que diga acá, y una URL externa convertiría cada
 * aviso en un enlace a cualquier sitio.
 */
export function buildPushPayload(input: { title: string; message: string; href?: string | null }): PushPayload {
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  const href = input.href && input.href.startsWith('/') && !input.href.startsWith('//') && !input.href.includes('\\') ? input.href : '/dashboard';
  return { title: clip(input.title.trim(), MAX_TITLE), body: clip(input.message.trim(), MAX_BODY), href };
}

/** Códigos con los que el servicio push dice que la suscripción ya no existe. */
const GONE_STATUS = new Set([404, 410]);

function statusCodeOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const code = (error as { statusCode: unknown }).statusCode;
    return typeof code === 'number' ? code : null;
  }
  return null;
}

/**
 * Envía el aviso a todos los dispositivos suscritos de la empresa cuyos
 * usuarios SIGUEN teniendo acceso a ella: usuario activo, empresa operativa,
 * y la empresa es su empresa hogar o (con multiempresa contratado) tiene
 * membresía. Las mismas reglas que `getAuthContext`, para que un usuario
 * desactivado o sacado de la empresa deje de recibir avisos al instante.
 *
 * Nunca lanza: un aviso es I/O externo y no debe poder romper lo que lo
 * originó. Las suscripciones que el servicio push da por muertas se borran.
 */
export async function sendPushToCompany(companyId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const vapid = getVapidConfig();
  if (!vapid) return { sent: 0, removed: 0 };

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { status: true, features: true },
    });
    if (!company || !isOperationalTenant(company.status)) return { sent: 0, removed: 0 };
    const multiCompany = toFeatureFlags(company.features).hasMultiCompany;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        companyId,
        user: {
          isActive: true,
          OR: multiCompany ? [{ companyId }, { companyMemberships: { some: { companyId } } }] : [{ companyId }],
        },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    const body = JSON.stringify(payload);
    let sent = 0;
    const goneIds: string[] = [];
    const deliveredIds: string[] = [];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        // Doble control: una fila vieja de antes de esta validación no debe
        // poder dirigir el POST a otro lado.
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          goneIds.push(subscription.id);
          return;
        }
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            body,
            { vapidDetails: vapid, TTL: 60 * 60 * 12, timeout: 10_000 },
          );
          sent += 1;
          deliveredIds.push(subscription.id);
        } catch (error) {
          const status = statusCodeOf(error);
          if (status !== null && GONE_STATUS.has(status)) {
            goneIds.push(subscription.id);
            return;
          }
          captureException(error, { module: 'push', companyId, extra: { status } });
        }
      }),
    );

    if (goneIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { companyId, id: { in: goneIds } } });
    }
    if (deliveredIds.length > 0) {
      await prisma.pushSubscription.updateMany({ where: { companyId, id: { in: deliveredIds } }, data: { lastSuccessAt: new Date() } });
    }
    return { sent, removed: goneIds.length };
  } catch (error) {
    captureException(error, { module: 'push', companyId });
    return { sent: 0, removed: 0 };
  }
}
