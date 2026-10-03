import { prisma } from '@/lib/prisma';
import { createCompanyCursor, type CronRunOptions } from '@/lib/cron/batch-core';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildMonthlyClosingEmail } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';
import { runReconciliationWithF29 } from './reconciliation.service';
import { captureException } from '@/lib/observability';
import { addMonthsSantiago, santiagoDateParts } from '@/lib/chile/timezone';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/**
 * Cierre mensual automático: calcula el F29 del mes recién terminado (vía
 * `runReconciliationWithF29`, que además corre las cuadraturas contables
 * cuando la empresa tiene el plan de cuentas mapeado) y manda un correo a
 * Dueños/Administradores/Contador. Antes de esto, tanto el motor de F29
 * como el de cuadraturas existían en el código pero nadie los ejecutaba
 * fuera de un test manual — quedaban invisibles.
 *
 * Corre para toda empresa con `hasDteBilling` activo (emite documentos
 * tributarios reales, por lo tanto tiene una obligación de F29 real que
 * declarar), sin exigir `hasAccounting`: el F29 se calcula igual aunque no
 * haya plan de cuentas mapeado, solo que ese caso no trae cuadraturas.
 *
 * Pensado para correr los primeros días de cada mes, cerrando el mes
 * calendario anterior — ver `vercel.json` (día 5, 08:00).
 */
export async function runMonthlyClosingCron(options: CronRunOptions = {}): Promise<{ processedCompanies: number; emailsSent: number; nextAfter: string | null }> {
  const now = new Date();
  // Cierra el mes calendario anterior al que corre el cron, en el calendario
  // de Santiago (auditoría 2026-09-27, hallazgo FIN-01/TRI-03) — no en UTC.
  const { year, month } = santiagoDateParts(addMonthsSantiago(now, -1));

  const companies = await prisma.company.findMany({
    where: { ...(options.after ? { id: { gt: options.after } } : {}), status: { in: [...OPERATIONAL_STATUSES] }, features: { hasDteBilling: true } },
    select: { id: true, businessName: true },
    orderBy: { id: 'asc' },
  });

  let processedCompanies = 0;
  let emailsSent = 0;

  const cursor = createCompanyCursor(options.budget);
  for (const company of companies) {
    if (cursor.stopBefore(company.id)) break;
    try {
      const { f29, checks } = await runReconciliationWithF29(company.id, { year, month });

      const recipients = await prisma.user.findMany({
        where: { companyId: company.id, role: { in: ['OWNER', 'ADMIN', 'ACCOUNTANT'] }, isActive: true },
        select: { email: true },
      });

      const email = buildMonthlyClosingEmail({
        companyName: company.businessName,
        year,
        month,
        netSales: f29.netSales,
        debitVat: f29.debitVat,
        creditVat: f29.creditVat,
        previousRemanent: f29.previousRemanent,
        remanentCredit: f29.remanentCredit,
        ppmAmount: f29.ppmAmount,
        determinedTax: f29.determinedTax,
        honorariumRetentionAmount: f29.honorariumRetentionAmount,
        checks,
        dashboardUrl: `${getAppUrl()}/dashboard/reports/f29`,
      });

      for (const recipient of recipients) {
        const delivery = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html, text: email.text, companyId: company.id });
        if (delivery.status !== 'failed') emailsSent++;
      }

      await createAuditLog({
        companyId: company.id,
        userEmail: 'monthly-closing-cron',
        action: 'CREATE',
        entity: 'MonthlyClosing',
        entityId: `${company.id}-${year}-${String(month).padStart(2, '0')}`,
        metadata: {
          year,
          month,
          determinedTax: f29.determinedTax,
          checksOutOfBalance: checks.filter((c) => !c.inBalance).length,
          recipientCount: recipients.length,
        },
      });

      processedCompanies++;
    } catch (err) {
      captureException(err, { module: 'accounting', companyId: company.id, extra: { reason: 'monthly-closing' } });
    }
  }

  return { processedCompanies, emailsSent, nextAfter: cursor.nextAfter };
}
