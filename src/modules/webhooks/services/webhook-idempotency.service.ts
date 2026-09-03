import { prisma } from '@/lib/prisma';
import type { Prisma, ProcessedWebhookEvent } from '@prisma/client';

export interface RecordWebhookResult {
  alreadyProcessed: boolean;
  event: ProcessedWebhookEvent | null;
}

/**
 * Registra un evento de webhook recibido de forma atómica e idempotente.
 * Si el eventId para el provider dado ya fue registrado previamente,
 * descarta la ejecución y retorna alreadyProcessed: true.
 */
export async function recordWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown> | null;
  companyId?: string | null;
}): Promise<RecordWebhookResult> {
  const { provider, eventId, eventType, payload, companyId } = params;

  if (!provider || !eventId) {
    throw new Error('Provider y eventId son requeridos para registrar el webhook');
  }

  try {
    const created = await prisma.processedWebhookEvent.create({
      data: {
        provider: provider.toLowerCase().trim(),
        eventId: eventId.trim(),
        eventType: eventType.trim(),
        payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
        companyId: companyId ?? undefined,
        status: 'PROCESSED',
      },
    });
    return { alreadyProcessed: false, event: created };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      const existing = await prisma.processedWebhookEvent.findUnique({
        where: { provider_eventId: { provider: provider.toLowerCase().trim(), eventId: eventId.trim() } },
      });
      return { alreadyProcessed: true, event: existing };
    }
    throw error;
  }
}

/**
 * Consulta si un evento de webhook ya fue procesado.
 */
export async function isWebhookEventProcessed(provider: string, eventId: string): Promise<boolean> {
  const count = await prisma.processedWebhookEvent.count({
    where: {
      provider: provider.toLowerCase().trim(),
      eventId: eventId.trim(),
    },
  });
  return count > 0;
}
