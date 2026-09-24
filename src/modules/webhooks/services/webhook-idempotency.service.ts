import { prisma } from '@/lib/prisma';
import type { Prisma, ProcessedWebhookEvent } from '@prisma/client';

export interface RecordWebhookResult {
  alreadyProcessed: boolean;
  event: ProcessedWebhookEvent | null;
}

/**
 * Registra un evento de webhook recibido de forma atómica e idempotente.
 * Si el eventId para el provider+empresa dado ya fue registrado
 * previamente, descarta la ejecución y retorna alreadyProcessed: true.
 *
 * Uso directo (registrar y listo) solo tiene sentido para webhooks que no
 * disparan una acción de negocio reversible/con efecto financiero — para
 * eso existe `claimWebhookEvent` (ver abajo), que reclama ANTES de
 * ejecutar en vez de registrar DESPUÉS.
 */
export async function recordWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown> | null;
  companyId: string;
}): Promise<RecordWebhookResult> {
  const { provider, eventId, eventType, payload, companyId } = params;

  if (!provider || !eventId) {
    throw new Error('Provider y eventId son requeridos para registrar el webhook');
  }

  const normalizedProvider = provider.toLowerCase().trim();
  const normalizedEventId = eventId.trim();

  try {
    const created = await prisma.processedWebhookEvent.create({
      data: {
        provider: normalizedProvider,
        eventId: normalizedEventId,
        eventType: eventType.trim(),
        payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
        companyId,
        status: 'PROCESSED',
      },
    });
    return { alreadyProcessed: false, event: created };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      const existing = await prisma.processedWebhookEvent.findUnique({
        where: { provider_companyId_eventId: { provider: normalizedProvider, companyId, eventId: normalizedEventId } },
      });
      return { alreadyProcessed: true, event: existing };
    }
    throw error;
  }
}

/**
 * Reclama un eventId de forma atómica ANTES de ejecutar la acción de
 * negocio que dispara — a diferencia de `recordWebhookEvent` (que registra
 * DESPUÉS), este es el patrón correcto para cualquier webhook cuyo efecto
 * sea financiero o no-idempotente por sí mismo (ej. `payment.confirmed` en
 * `n8n-handler.service.ts`): el `create` con `status: 'CLAIMED'` es la
 * operación atómica que decide quién "gana" la carrera cuando el mismo
 * `eventId` llega dos veces en paralelo (reintento de red de n8n durante un
 * timeout, el caso real que se quiere cubrir) — el segundo choca contra el
 * `@@unique([provider, companyId, eventId])` y nunca llega a ejecutar la
 * acción.
 *
 * Si la acción de negocio falla después de reclamar, el llamador debe
 * llamar a `releaseWebhookEventClaim` para permitir un reintento legítimo
 * con el mismo eventId (ver `route.ts`).
 */
export async function claimWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType: string;
  companyId: string;
}): Promise<{ claimed: boolean }> {
  const provider = params.provider.toLowerCase().trim();
  const eventId = params.eventId.trim();
  const eventType = params.eventType.trim();

  try {
    await prisma.processedWebhookEvent.create({
      data: { provider, eventId, eventType, companyId: params.companyId, status: 'CLAIMED' },
    });
    return { claimed: true };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      const reclaimed = await prisma.processedWebhookEvent.updateMany({
        where: { provider, companyId: params.companyId, eventId, status: 'FAILED' },
        data: { status: 'CLAIMED', eventType, processedAt: new Date() },
      });
      if (reclaimed.count === 1) return { claimed: true };
      return { claimed: false };
    }
    throw error;
  }
}

/**
 * Marca como `PROCESSED` un evento previamente reclamado con
 * `claimWebhookEvent`, adjuntando el payload y el resultado final.
 *
 * Acepta un cliente de transacción opcional (`db`) para que el llamador
 * pueda marcarlo atómicamente junto con el efecto de negocio que el evento
 * dispara (ver `route.ts`): si el marcado falla, el efecto también revierte,
 * en vez de quedar aplicado con el evento en `FAILED` — eso permitía que un
 * reintento con el mismo `eventId` volviera a aplicarlo.
 */
export async function markWebhookEventProcessed(
  params: {
    provider: string;
    eventId: string;
    companyId: string;
    payload?: Record<string, unknown> | null;
    status?: 'PROCESSED' | 'IGNORED';
  },
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await db.processedWebhookEvent.updateMany({
    where: { provider: params.provider.toLowerCase().trim(), companyId: params.companyId, eventId: params.eventId.trim() },
    data: { status: params.status ?? 'PROCESSED', payload: params.payload ? (params.payload as Prisma.InputJsonValue) : undefined, processedAt: new Date() },
  });
}

/**
 * Libera el reclamo de un evento cuya acción de negocio falló, para que un
 * reintento legítimo con el mismo eventId pueda volver a intentarse. Se
 * borra en vez de dejarlo en `FAILED`: dejarlo en la tabla bloquearía
 * permanentemente ese eventId contra el `@@unique`, y el objetivo es
 * exactamente lo contrario (permitir el reintento).
 */
export async function markWebhookEventFailed(params: {
  provider: string;
  eventId: string;
  companyId: string;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.processedWebhookEvent.updateMany({
    where: {
      provider: params.provider.toLowerCase().trim(),
      companyId: params.companyId,
      eventId: params.eventId.trim(),
      status: 'CLAIMED',
    },
    data: { status: 'FAILED', payload: params.payload ? (params.payload as Prisma.InputJsonValue) : undefined, processedAt: new Date() },
  });
}

/**
 * Consulta si un evento de webhook ya fue procesado (o está siendo
 * procesado ahora mismo) para esta empresa. Uso informativo/de lectura —
 * la decisión real de "quién gana la carrera" la toma el `create` atómico
 * de `claimWebhookEvent`, no este `count`.
 */
export async function isWebhookEventProcessed(provider: string, companyId: string, eventId: string): Promise<boolean> {
  const count = await prisma.processedWebhookEvent.count({
    where: {
      provider: provider.toLowerCase().trim(),
      companyId,
      eventId: eventId.trim(),
    },
  });
  return count > 0;
}
