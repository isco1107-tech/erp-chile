import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/mailer';
import { createAuditLog } from '@/lib/auth/audit';
import { getCalendarData } from './calendar.service';

export interface ReminderDeliveryResult {
  sent: boolean;
  recipient: string;
  eventsCount: number;
  birthdaysCount: number;
  message: string;
}

/** Genera la plantilla HTML para el recordatorio de certámenes y cumpleaños. */
export function buildEventReminderEmail(params: {
  companyName: string;
  adminEmail: string;
  upcomingEvents: Array<{ title: string; dateFormatted: string; googleCalendarUrl: string }>;
  upcomingBirthdays: Array<{ name: string; age: number; dateFormatted: string; daysUntil: number; googleCalendarUrl: string }>;
  dashboardCalendarUrl: string;
}): { subject: string; html: string; text: string } {
  const totalCount = params.upcomingEvents.length + params.upcomingBirthdays.length;
  const subject = `[Recordatorio] ${totalCount} evento(s) y cumpleaños próximos — ${params.companyName}`;

  const eventsHtml = params.upcomingEvents.length > 0
    ? `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1e3a5f; margin-bottom: 12px; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          🏆 Certámenes y Eventos Próximos
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${params.upcomingEvents.map((ev) => `
            <tr style="border-bottom: 1px solid #edf2f7;">
              <td style="padding: 10px 0; font-weight: 600; color: #2d3748;">${ev.title}</td>
              <td style="padding: 10px 12px; color: #718096; white-space: nowrap;">${ev.dateFormatted}</td>
              <td style="padding: 10px 0; text-align: right;">
                <a href="${ev.googleCalendarUrl}" target="_blank" style="background-color: #2b6cb0; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-block;">
                  + Google Calendar
                </a>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    `
    : '<p style="color: #a0aec0; font-size: 13px; margin-bottom: 20px;">Sin certámenes u obras agendadas para los próximos 7 días.</p>';

  const birthdaysHtml = params.upcomingBirthdays.length > 0
    ? `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #b7791f; margin-bottom: 12px; font-size: 16px; border-bottom: 2px solid #feebc8; padding-bottom: 6px;">
          🎂 Cumpleaños de Candidatas (Misses)
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${params.upcomingBirthdays.map((b) => `
            <tr style="border-bottom: 1px solid #fffaf0;">
              <td style="padding: 10px 0; font-weight: 600; color: #744210;">
                ${b.name} <span style="font-weight: normal; color: #a0aec0; font-size: 12px;">(Cumple ${b.age} años)</span>
              </td>
              <td style="padding: 10px 12px; color: #975a16; white-space: nowrap;">
                ${b.daysUntil === 0 ? '<strong style="color: #c53030;">¡HOY!</strong>' : b.daysUntil === 1 ? 'Mañana' : `En ${b.daysUntil} días (${b.dateFormatted})`}
              </td>
              <td style="padding: 10px 0; text-align: right;">
                <a href="${b.googleCalendarUrl}" target="_blank" style="background-color: #d69e2e; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-block;">
                  + Google Calendar
                </a>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    `
    : '<p style="color: #a0aec0; font-size: 13px; margin-bottom: 20px;">No hay cumpleaños de candidatas en los próximos 7 días.</p>';

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; padding: 24px; color: #2d3748;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
          <div style="background-color: #1a365d; color: #ffffff; padding: 20px 24px;">
            <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #bee3f8;">${params.companyName} · Certámenes & Eventos</p>
            <h1 style="margin: 4px 0 0 0; font-size: 20px; font-weight: 700;">Recordatorio Periódico de Actividades</h1>
          </div>
          <div style="padding: 24px;">
            <p style="margin-top: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
              Hola, este es tu boletín automatizado de actividades próximas. Puedes sincronizarlas con Google Calendar o revisarlas en el panel del ERP.
            </p>
            ${eventsHtml}
            ${birthdaysHtml}
            <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
              <a href="${params.dashboardCalendarUrl}" style="background-color: #1a365d; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
                Ver Calendario Completo en el ERP
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Recordatorio de Actividades — ${params.companyName}\n\nEventos próximos: ${params.upcomingEvents.length}\nCumpleaños próximos: ${params.upcomingBirthdays.length}\n\nRevisa los detalles en: ${params.dashboardCalendarUrl}`;

  return { subject, html, text };
}

/** Envía el recordatorio periódico por correo al administrador de la empresa. */
export async function sendUpcomingEventsReminder(
  companyId: string,
  baseUrl: string,
  targetEmailOverride?: string
): Promise<ReminderDeliveryResult> {
  const data = await getCalendarData(companyId, baseUrl);
  const recipient = targetEmailOverride || data.adminEmail;

  if (!recipient) {
    return {
      sent: false,
      recipient: '',
      eventsCount: 0,
      birthdaysCount: 0,
      message: 'No hay correo de administrador configurado para recibir recordatorios.',
    };
  }

  // Filtrar eventos de los próximos 7 días
  const now = new Date();
  const horizonMs = 7 * 24 * 3600 * 1000;
  const horizonDate = new Date(now.getTime() + horizonMs);

  const filterEvents = data.upcomingEvents
    .filter((e) => e.startDate >= now && e.startDate <= horizonDate)
    .map((e) => ({
      title: e.title,
      dateFormatted: e.startDate.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      googleCalendarUrl: e.googleCalendarUrl,
    }));

  const filterBirthdays = data.upcomingBirthdays
    .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 7)
    .map((b) => ({
      name: b.stageName ? `${b.stageName} (${b.fullName})` : b.fullName,
      age: b.turningAge,
      dateFormatted: `${b.birthDate.getUTCDate()}/${b.birthDate.getUTCMonth() + 1}`,
      daysUntil: b.daysUntil,
      googleCalendarUrl: data.items.find((it) => it.id === `bday-${b.id}`)?.googleCalendarUrl || '',
    }));

  const emailContent = buildEventReminderEmail({
    companyName: data.companyName,
    adminEmail: recipient,
    upcomingEvents: filterEvents,
    upcomingBirthdays: filterBirthdays,
    dashboardCalendarUrl: `${baseUrl.replace(/\/$/, '')}/dashboard/calendar`,
  });

  const delivery = await sendEmail({
    to: recipient,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  await createAuditLog({
    companyId,
    userEmail: recipient,
    action: 'CREATE',
    entity: 'EventReminder',
    entityId: companyId,
    metadata: {
      recipient,
      eventsCount: filterEvents.length,
      birthdaysCount: filterBirthdays.length,
      deliveryStatus: delivery.status,
    },
  });

  return {
    sent: delivery.status !== 'failed',
    recipient,
    eventsCount: filterEvents.length,
    birthdaysCount: filterBirthdays.length,
    message: delivery.status === 'failed'
      ? 'No se pudo enviar el correo vía Brevo. Revisa las credenciales.'
      : `Recordatorio enviado con éxito a ${recipient}`,
  };
}

/** Ejecuta recordatorios automáticos para todas las empresas activas (usado por el Cron diario). */
export async function runDailyRemindersCron(baseUrl: string): Promise<{ processedCompanies: number }> {
  const companies = await prisma.company.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { id: true },
  });

  let count = 0;
  for (const c of companies) {
    try {
      await sendUpcomingEventsReminder(c.id, baseUrl);
      count++;
    } catch (err) {
      console.error(`Error al enviar recordatorios periódicos para empresa ${c.id}:`, err);
    }
  }

  return { processedCompanies: count };
}
