'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { listReceivables } from '../services/treasury.service';
import { getCompanyProfile } from '@/lib/services/company.service';
import { sendEmail } from '@/lib/email/mailer';
import { buildPaymentReminderEmail } from '@/lib/email/templates';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { formatRut } from '@/lib/chile/rut';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

/**
 * Envío MANUAL (no cron) del recordatorio de cobranza: un correo real llega a
 * un cliente externo, no a un usuario del ERP — a diferencia de los agentes de
 * IA (que nunca contactan a nadie fuera del sistema), esto sí sale de la
 * empresa. Por eso queda gatillado por un clic humano desde Tesorería > CxC,
 * no por un cron silencioso: un monto mal calculado o un cliente ya pagado
 * dispararía un correo real y visible para el cliente, no solo una
 * recomendación interna a corregir en pantalla.
 */
export async function sendPaymentReminderAction(
  contactId: string
): Promise<ActionResult<{ sentTo: string; documentsCount: number }>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');

    const receivables = await listReceivables(session.companyId);
    const contactDocs = receivables.filter((doc) => doc.contactId === contactId);
    if (contactDocs.length === 0) {
      return { success: false, error: 'Este cliente no tiene documentos pendientes de cobro' };
    }

    const contact = contactDocs[0]!.contact;
    if (!contact.email) {
      return { success: false, error: 'Este cliente no tiene correo electrónico registrado' };
    }

    const company = await getCompanyProfile(session.companyId);
    if (!company) return { success: false, error: 'Empresa no encontrada' };

    const documents = contactDocs.map((doc) => ({
      dteLabel: DTE_TYPE_LABELS[doc.dteType],
      folio: doc.folio,
      dueDate: doc.dueDate,
      amount: doc.totalAmount - doc.paidAmount,
    }));
    const totalDue = documents.reduce((sum, doc) => sum + doc.amount, 0);

    const email = buildPaymentReminderEmail({
      companyName: company.businessName,
      companyRut: formatRut(company.rut),
      companyPhone: company.phone,
      customerName: contact.razonSocial,
      documents,
      totalDue,
    });

    const delivery = await sendEmail({ to: contact.email, ...email });
    if (delivery.status === 'failed') {
      return { success: false, error: 'No se pudo enviar el correo. Intenta nuevamente más tarde' };
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Contact',
      entityId: contactId,
      metadata: {
        reason: 'payment_reminder_sent',
        to: contact.email,
        documentsCount: documents.length,
        totalDue,
        deliveryStatus: delivery.status,
      },
    });

    return {
      success: true,
      data: { sentTo: contact.email, documentsCount: documents.length },
      message:
        delivery.status === 'logged'
          ? 'Recordatorio generado, pero el envío de correo no está configurado en el servidor (revisa BREVO_API_KEY/RESEND_API_KEY)'
          : `Recordatorio enviado a ${contact.email}`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
