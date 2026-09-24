import type { Prisma } from '@prisma/client';
import { registerSalesPayment, registerPurchasePayment } from '@/modules/treasury/services/treasury.service';
import type { CreateAuditLogInput } from '@/lib/auth/audit';
import { paymentConfirmedEventSchema, type PaymentConfirmedEvent } from '../schema';

export class UnhandledEventTypeError extends Error {}
export class DocumentNotFoundError extends Error {}
export class InvalidEventPayloadError extends Error {}

/**
 * Ejecuta un evento entrante ya autenticado (companyId resuelto desde el
 * token, ver `n8n-secret.service.ts`) y ya reclamado como no-duplicado (ver
 * `route.ts`). Cada `case` reusa el mismo servicio de Tesorería que usaría
 * la Server Action manual (`treasury.actions.ts`) — el webhook no
 * reimplementa la lógica de negocio, solo la dispara.
 *
 * `tx` es el cliente de la transacción de Prisma abierta en `route.ts`, que
 * envuelve tanto este efecto de negocio como `markWebhookEventProcessed`:
 * si el pago se aplica pero el evento no llega a marcarse como procesado (o
 * viceversa), ambos revierten juntos — evita que un reintento con el mismo
 * `eventId` vuelva a aplicar el pago (OP-06).
 */
/**
 * La bitácora viaja en el resultado en vez de escribirse acá: el handler corre
 * dentro de la transacción del webhook, y `createAuditLog` usa su propia
 * conexión. Escribirla antes del commit dejaba registrado un pago que un
 * rollback posterior deshacía. La ruta la escribe después de confirmar.
 */
export interface N8nHandlerResult {
  summary: string;
  audit?: CreateAuditLogInput;
}

export async function handleN8nWebhookEvent(
  companyId: string,
  eventType: string,
  rawPayload: Record<string, unknown>,
  tx: Prisma.TransactionClient
): Promise<N8nHandlerResult> {
  switch (eventType) {
    case 'payment.confirmed': {
      const parsed = paymentConfirmedEventSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new InvalidEventPayloadError(parsed.error.issues.map((i) => i.message).join('; '));
      }
      return handlePaymentConfirmed(companyId, parsed.data, tx);
    }
    default:
      throw new UnhandledEventTypeError(`No hay una acción configurada para el evento "${eventType}"`);
  }
}

async function handlePaymentConfirmed(
  companyId: string,
  data: PaymentConfirmedEvent,
  tx: Prisma.TransactionClient
): Promise<N8nHandlerResult> {
  const paymentInput = {
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    paymentDate: data.paymentDate,
    referenceNumber: data.referenceNumber,
    bankAccount: data.bankAccount,
    notes: data.notes ?? 'Conciliado automáticamente vía n8n',
  };

  if (data.documentType === 'sales') {
    const folioNumber = Number(data.folio);
    if (!Number.isFinite(folioNumber)) throw new InvalidEventPayloadError('El folio de venta debe ser numérico');

    const doc = await tx.salesDocument.findFirst({
      where: { companyId, folio: folioNumber },
      select: { id: true },
    });
    if (!doc) throw new DocumentNotFoundError(`No se encontró el documento de venta con folio ${data.folio}`);

    const payment = await registerSalesPayment(companyId, doc.id, paymentInput, tx);

    return {
      summary: `Cobro de ${data.amount} registrado en venta folio ${data.folio}`,
      audit: {
        companyId,
        userEmail: 'n8n-webhook',
        action: 'CREATE',
        entity: 'Payment',
        entityId: payment.id,
        metadata: { source: 'n8n', eventType: 'payment.confirmed', salesDocumentId: doc.id, folio: data.folio, amount: data.amount },
      },
    };
  }

  const doc = await tx.purchaseDocument.findFirst({
    where: { companyId, folio: data.folio },
    select: { id: true },
  });
  if (!doc) throw new DocumentNotFoundError(`No se encontró el documento de compra con folio ${data.folio}`);

  const payment = await registerPurchasePayment(companyId, doc.id, paymentInput, tx);

  return {
    summary: `Pago de ${data.amount} registrado en compra folio ${data.folio}`,
    audit: {
      companyId,
      userEmail: 'n8n-webhook',
      action: 'CREATE',
      entity: 'Payment',
      entityId: payment.id,
      metadata: { source: 'n8n', eventType: 'payment.confirmed', purchaseDocumentId: doc.id, folio: data.folio, amount: data.amount },
    },
  };
}
