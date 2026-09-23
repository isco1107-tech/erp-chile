import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Token de identidad de empresa para el webhook entrante de automatización
 * (`POST /api/webhooks`, ver n8n-handler.service.ts). Mismo patrón que
 * `ensureCalendarSyncToken`/`regenerateCalendarSyncToken` en
 * `calendar.service.ts`: el token ES la autenticación completa — quien lo
 * presenta como `Authorization: Bearer <token>` actúa como esa empresa, sin
 * que el companyId se acepte nunca del payload del cliente.
 */
export async function ensureN8nWebhookSecret(companyId: string): Promise<string> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { n8nWebhookSecret: true },
  });

  if (settings?.n8nWebhookSecret) {
    return settings.n8nWebhookSecret;
  }

  const token = crypto.randomBytes(24).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { n8nWebhookSecret: token },
    create: { companyId, n8nWebhookSecret: token },
  });

  return token;
}

/** Regenera el token, invalidando el anterior de inmediato (cualquier
 * automatización que lo tuviera guardado empieza a recibir 401). */
export async function regenerateN8nWebhookSecret(companyId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { n8nWebhookSecret: token },
    create: { companyId, n8nWebhookSecret: token },
  });
  return token;
}

/** Revoca el token sin generar uno nuevo: la empresa deja de tener
 * automatización externa habilitada hasta que alguien genere uno de nuevo. */
export async function revokeN8nWebhookSecret(companyId: string): Promise<void> {
  await prisma.companySettings.updateMany({
    where: { companyId },
    data: { n8nWebhookSecret: null },
  });
}

/**
 * Resuelve el companyId a partir del token recibido en el header
 * `Authorization: Bearer <token>` del webhook entrante. Es el ÚNICO lugar
 * donde ese endpoint determina de qué empresa es el evento — nunca confía en
 * un `companyId` del body, exactamente igual que el token de postulación de
 * candidatas (`candidateRegistrationToken`) resuelve el proyecto.
 */
export async function resolveCompanyByN8nWebhookSecret(token: string): Promise<{ companyId: string } | null> {
  if (!token) return null;
  const settings = await prisma.companySettings.findUnique({
    where: { n8nWebhookSecret: token },
    select: { companyId: true },
  });
  return settings ? { companyId: settings.companyId } : null;
}
