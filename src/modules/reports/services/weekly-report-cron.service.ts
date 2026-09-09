import { prisma } from '@/lib/prisma';
import { buildReportDataset } from './dataset.service';
import { buildWorkbook } from './workbook.service';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildWeeklyReportEmail } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/**
 * Entrega semanal del libro Excel (`buildReportDataset` + `buildWorkbook`,
 * el mismo motor que usa `GET /api/reports/excel` bajo demanda) por correo a
 * Dueño/Administrador/Contador — antes esto solo se generaba si alguien
 * entraba a la pantalla de Reportes y hacía clic. Corre para toda empresa
 * con `hasAdvancedReports` activo (el mismo flag que gatea `reports:read`),
 * cubriendo los últimos 7 días. Pensado para correr los lunes.
 */
export async function runWeeklyReportCron(): Promise<{ processedCompanies: number; emailsSent: number }> {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const companies = await prisma.company.findMany({
    where: { status: { in: [...OPERATIONAL_STATUSES] }, features: { hasAdvancedReports: true } },
    select: { id: true, businessName: true },
  });

  let processedCompanies = 0;
  let emailsSent = 0;

  for (const company of companies) {
    try {
      const recipients = await prisma.user.findMany({
        where: { companyId: company.id, role: { in: ['OWNER', 'ADMIN', 'ACCOUNTANT'] }, isActive: true },
        select: { email: true },
      });
      if (recipients.length === 0) {
        processedCompanies++;
        continue;
      }

      const dataset = await buildReportDataset(company.id, { from, to });
      const buffer = await buildWorkbook(dataset);

      const email = buildWeeklyReportEmail({
        companyName: company.businessName,
        from,
        to,
        dashboardUrl: `${getAppUrl()}/dashboard/reports`,
      });

      const filename = `reporte-${company.id}-${to.toISOString().slice(0, 10)}.xlsx`;
      for (const recipient of recipients) {
        const delivery = await sendEmail({
          to: recipient.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          attachments: [{ filename, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        });
        if (delivery.status !== 'failed') emailsSent++;
      }

      await createAuditLog({
        companyId: company.id,
        userEmail: 'weekly-report-cron',
        action: 'CREATE',
        entity: 'WeeklyReport',
        entityId: `${company.id}-${to.toISOString().slice(0, 10)}`,
        metadata: { from: from.toISOString(), to: to.toISOString(), recipientCount: recipients.length },
      });

      processedCompanies++;
    } catch (err) {
      console.error(`Error al procesar reporte semanal para empresa ${company.id}:`, err);
    }
  }

  return { processedCompanies, emailsSent };
}
