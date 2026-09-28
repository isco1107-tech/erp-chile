import 'server-only';
import type { WorkflowNotificationSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildPushPayload, sendPushToCompany } from '@/lib/notifications/web-push';

export interface CompanyNotificationInput {
  severity: WorkflowNotificationSeverity;
  title: string;
  message: string;
  href?: string | null;
  ruleId?: string | null;
  /**
   * Texto del push si debe ser más discreto que el de la campanita: el push
   * se ve en la pantalla bloqueada. Por ejemplo, sin teléfono ni correo.
   */
  pushMessage?: string;
}

/**
 * Aviso para el equipo de una empresa: lo guarda para la campanita y lo manda
 * como Web Push a los dispositivos que lo activaron. Es el único lugar que
 * crea `WorkflowNotification`, para que ningún aviso quede solo en uno de
 * los dos canales.
 *
 * Llamar siempre fuera de la transacción de negocio que lo origina: el push
 * es I/O externo (y `sendPushToCompany` nunca lanza).
 */
export async function notifyCompany(companyId: string, input: CompanyNotificationInput): Promise<void> {
  await prisma.workflowNotification.create({
    data: {
      companyId,
      ruleId: input.ruleId ?? null,
      severity: input.severity,
      title: input.title,
      message: input.message,
      href: input.href || null,
    },
  });
  await sendPushToCompany(companyId, buildPushPayload({ title: input.title, message: input.pushMessage ?? input.message, href: input.href }));
}
