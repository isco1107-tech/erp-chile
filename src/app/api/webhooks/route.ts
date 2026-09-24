import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claimWebhookEvent, markWebhookEventProcessed, markWebhookEventFailed } from '@/modules/webhooks/services/webhook-idempotency.service';
import { resolveCompanyByN8nWebhookSecret } from '@/modules/webhooks/services/n8n-secret.service';
import {
  handleN8nWebhookEvent,
  UnhandledEventTypeError,
  DocumentNotFoundError,
  InvalidEventPayloadError,
} from '@/modules/webhooks/services/n8n-handler.service';
import { checkRateLimit, N8N_WEBHOOK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';
import { createAuditLog } from '@/lib/auth/audit';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';

const MAX_BODY_BYTES = 256 * 1024; // Un evento de conciliación es unas pocas líneas de JSON; 256 KB da margen de sobra.

/**
 * Endpoint de ingestión de eventos de automatización externa (n8n, Zapier,
 * un script propio). Reemplaza la versión anterior de esta ruta, que solo
 * registraba el evento en `ProcessedWebhookEvent` sin ejecutar nada — quedaba
 * ahí como infraestructura sin usar. Esta versión sí dispara acciones
 * reales, así que primero exige lo que la anterior no tenía: autenticación.
 *
 * Auth: `Authorization: Bearer <token>`, donde `<token>` es el
 * `n8nWebhookSecret` de `CompanySettings` (generado desde Configuración →
 * Empresa). El token ES la identidad de empresa — el `companyId` NUNCA se
 * acepta del body, exactamente igual que el token de postulación pública de
 * candidatas resuelve el proyecto sin aceptar `projectId` del cliente.
 *
 * Idempotencia (auditada — ver `webhook-idempotency.service.ts`): el
 * `eventId` se RECLAMA de forma atómica con `claimWebhookEvent` (un INSERT
 * que choca contra `@@unique([provider, companyId, eventId])`) ANTES de
 * ejecutar la acción de negocio, no después. Con la versión anterior
 * (check-then-act: `count()` → ejecutar → `create()`), dos requests con el
 * mismo eventId en paralelo —un reintento real de n8n tras un timeout—
 * podían pasar ambas el check y duplicar un cobro real en Tesorería antes
 * de que cualquiera alcanzara a registrarse. Si la acción de negocio falla
 * después de reclamar, el reclamo se marca `FAILED` (`markWebhookEventFailed`)
 * en vez de quedar `CLAIMED` para siempre, para permitir un reintento legítimo.
 *
 * La acción de negocio (`handleN8nWebhookEvent`) y el marcado a `PROCESSED`
 * corren dentro del mismo `prisma.$transaction` (OP-06): si el pago se
 * aplica pero el marcado falla, ambos revierten — sin esto, el evento
 * quedaba `FAILED` con el pago ya aplicado, y un reintento legítimo con el
 * mismo `eventId` volvía a aplicarlo (doble abono).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Falta el header Authorization: Bearer <token>' }, { status: 401 });
    }

    const company = await resolveCompanyByN8nWebhookSecret(token);
    if (!company) {
      return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });
    }

    // Rate limit por empresa (no por IP): n8n/Zapier suelen correr desde IPs
    // fijas de infraestructura compartida entre muchos clientes de ese
    // proveedor, así que limitar por IP penalizaría a otras empresas.
    const rl = checkRateLimit(`company:${company.companyId}`, N8N_WEBHOOK_RATE_LIMIT);
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.max(1, Math.ceil((rl.retryAfterMs - Date.now()) / 1000)) : 60;
      return NextResponse.json(
        { success: false, error: 'Demasiados eventos en poco tiempo para esta empresa' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const contentLengthHeader = req.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'El body supera el tamaño máximo permitido' }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Body inválido, se espera JSON' }, { status: 400 });
    }

    const eventId = String(body.eventId ?? body.id ?? body.event_id ?? '').trim();
    const eventType = String(body.eventType ?? body.type ?? body.event_type ?? '').trim();
    if (!eventId) {
      return NextResponse.json({ success: false, error: 'Falta el identificador único del evento (eventId)' }, { status: 400 });
    }
    if (!eventType) {
      return NextResponse.json({ success: false, error: 'Falta el tipo de evento (eventType)' }, { status: 400 });
    }

    const claim = await claimWebhookEvent({ provider: 'n8n', eventId, eventType, companyId: company.companyId });
    if (!claim.claimed) {
      return NextResponse.json(
        { success: true, message: 'Evento ya procesado previamente (descartado por idempotencia)', eventId, status: 'DUPLICATE_IGNORED' },
        { status: 200 }
      );
    }

    const payload = typeof body.payload === 'object' && body.payload !== null ? (body.payload as Record<string, unknown>) : body;

    try {
      // El efecto de negocio (puede aplicar un pago) y el marcado del evento
      // como procesado confirman o revierten juntos: si uno falla después de
      // que el otro ya escribió, un reintento con el mismo `eventId` volvería
      // a aplicar el pago (OP-06).
      const result = await prisma.$transaction(async (tx) => {
        const handlerResult = await handleN8nWebhookEvent(company.companyId, eventType, payload, tx);
        await markWebhookEventProcessed({ provider: 'n8n', eventId, companyId: company.companyId, payload }, tx);
        return handlerResult;
      }, LOCKING_TX_OPTIONS);
      // Recién confirmada la transacción: la bitácora nunca registra un pago que se revirtió.
      if (result.audit) await createAuditLog(result.audit);
      return NextResponse.json({ success: true, message: result.summary, eventId, status: 'PROCESSED' }, { status: 200 });
    } catch (handlerError) {
      if (handlerError instanceof UnhandledEventTypeError) {
        // No es un error del cliente: el evento es válido, el ERP simplemente
        // no tiene una acción configurada para ese tipo todavía. Se marca
        // igual (con status IGNORED, no PROCESSED) así no se re-intenta
        // indefinidamente, y se responde 200.
        await markWebhookEventProcessed({ provider: 'n8n', eventId, companyId: company.companyId, payload, status: 'IGNORED' });
        return NextResponse.json({ success: true, message: handlerError.message, eventId, status: 'IGNORED_NO_HANDLER' }, { status: 200 });
      }

      // Cualquier otro error marca el reclamo como FAILED (no lo borra: queda
      // el rastro de auditoría) y libera el eventId para que un reintento
      // legítimo con el mismo eventId pueda volver a intentarse.
      await markWebhookEventFailed({ provider: 'n8n', eventId, companyId: company.companyId, payload });

      if (handlerError instanceof InvalidEventPayloadError) {
        return NextResponse.json({ success: false, error: `Payload inválido: ${handlerError.message}` }, { status: 400 });
      }
      if (handlerError instanceof DocumentNotFoundError) {
        return NextResponse.json({ success: false, error: handlerError.message }, { status: 404 });
      }
      captureException(handlerError, { module: 'webhooks', companyId: company.companyId, extra: { eventType, eventId } });
      return NextResponse.json({ success: false, error: 'Error interno al procesar el evento' }, { status: 500 });
    }
  } catch (error) {
    captureException(error, { module: 'webhooks' });
    return NextResponse.json({ success: false, error: 'Error interno al procesar el webhook' }, { status: 500 });
  }
}
