import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/mailer';
import { buildInstallmentReminderEmail } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';
import { applyOverduePenalties, listOverdueInstallments, type OverdueInstallmentGroup } from './payment-plans.service';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/**
 * Ejecuta, para cada empresa con el módulo `hasInstallmentPlans` activo:
 * 1) aplicar multas por mora sobre cuotas recién vencidas, y
 * 2) enviar un correo de recordatorio por cada cliente con cuotas vencidas.
 *
 * Mismo patrón que `runDailyRemindersCron` en
 * `src/modules/calendar/services/event-reminders.service.ts`: itera todas las
 * empresas operativas, nunca deja que el fallo de una interrumpa a las demás.
 */
export async function runOverdueInstallmentsReminderCron(): Promise<{ processedCompanies: number; remindersSent: number }> {
  const companies = await prisma.company.findMany({
    where: { status: { in: [...OPERATIONAL_STATUSES] }, features: { hasInstallmentPlans: true } },
    select: { id: true, businessName: true, rut: true, phone: true },
  });

  let processedCompanies = 0;
  let remindersSent = 0;

  for (const company of companies) {
    try {
      await applyOverduePenalties(company.id);
      const groups = await listOverdueInstallments(company.id);

      // Agrupa por contacto: un mismo cliente puede tener varios planes de
      // pago vencidos a la vez, y no tiene sentido mandarle un correo por cada uno.
      const byContact = new Map<string, { email: string; razonSocial: string; installments: OverdueInstallmentGroup['installments'] }>();
      for (const group of groups) {
        if (!group.contactEmail) continue;
        const existing = byContact.get(group.contactId);
        if (existing) {
          existing.installments.push(...group.installments);
        } else {
          byContact.set(group.contactId, {
            email: group.contactEmail,
            razonSocial: group.contactRazonSocial,
            installments: [...group.installments],
          });
        }
      }

      for (const [contactId, contact] of byContact) {
        const totalDue = contact.installments.reduce((sum, i) => sum + i.amount, 0);
        const email = buildInstallmentReminderEmail({
          companyName: company.businessName,
          companyRut: company.rut,
          companyPhone: company.phone,
          customerName: contact.razonSocial,
          installments: contact.installments,
          totalDue,
        });

        const delivery = await sendEmail({ to: contact.email, subject: email.subject, html: email.html, text: email.text });

        await createAuditLog({
          companyId: company.id,
          userEmail: contact.email,
          action: 'CREATE',
          entity: 'PaymentPlanOverdueReminder',
          entityId: contactId,
          metadata: { recipient: contact.email, installmentsCount: contact.installments.length, deliveryStatus: delivery.status },
        });

        if (delivery.status !== 'failed') remindersSent++;
      }

      processedCompanies++;
    } catch (err) {
      console.error(`Error al procesar recordatorio de cuotas vencidas para empresa ${company.id}:`, err);
    }
  }

  return { processedCompanies, remindersSent };
}
