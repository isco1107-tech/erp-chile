import { NextRequest, NextResponse } from 'next/server';
import { recordWebhookEvent } from '@/modules/webhooks/services/webhook-idempotency.service';

/**
 * Endpoint genérico de ingestión de Webhooks con deduplicación e idempotencia garantizada.
 * Registra cada eventId en ProcessedWebhookEvent antes de delegar la ejecución.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = req.headers.get('x-webhook-provider') || body.provider || 'generic';
    const eventId = req.headers.get('x-webhook-event-id') || body.id || body.eventId || body.event_id;
    const eventType = req.headers.get('x-webhook-event-type') || body.type || body.eventType || 'unknown';
    const companyId = req.headers.get('x-company-id') || body.companyId || null;

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'Falta el identificador único del evento (eventId)' },
        { status: 400 }
      );
    }

    const { alreadyProcessed, event } = await recordWebhookEvent({
      provider: String(provider),
      eventId: String(eventId),
      eventType: String(eventType),
      payload: body,
      companyId: companyId ? String(companyId) : null,
    });

    if (alreadyProcessed) {
      return NextResponse.json(
        {
          success: true,
          message: 'Evento ya procesado previamente (descartado por idempotencia)',
          eventId: event?.eventId,
          status: 'DUPLICATE_IGNORED',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Evento recibido y procesado exitosamente',
        eventId: event?.eventId,
        status: 'PROCESSED',
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error procesando webhook';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
