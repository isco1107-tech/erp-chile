import { z } from 'zod';
import { escapeHtml } from '@/lib/email/templates';
import { SALES_LEAD_HONEYPOT_FIELD, SALES_LEAD_SOLUTIONS, SALES_LEAD_TEAM_SIZES } from './sales-lead-options';

/**
 * Solicitud de demo/cotización del landing. Antes el formulario abría un
 * `mailto:` y dependía de que la persona terminara de enviar el correo desde
 * su propio cliente (muchos no tienen uno configurado): una parte de los
 * interesados se perdía sin dejar rastro. Ahora se valida y se envía al
 * correo de ventas desde el servidor; el `mailto:` queda solo como respaldo.
 */

export { SALES_LEAD_SOLUTIONS, SALES_LEAD_TEAM_SIZES, SALES_LEAD_HONEYPOT_FIELD };

export const salesLeadSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre').max(120),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido').max(160),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s()-]*$/, 'El teléfono solo puede tener números, espacios y +')
    .optional()
    .or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  teamSize: z.enum(SALES_LEAD_TEAM_SIZES),
  solutions: z.array(z.enum(SALES_LEAD_SOLUTIONS)).max(SALES_LEAD_SOLUTIONS.length),
  message: z.string().trim().max(1500).optional().or(z.literal('')),
});

export type SalesLead = z.infer<typeof salesLeadSchema>;

export function buildSalesLeadEmail(lead: SalesLead, receivedAt: Date = new Date()): { subject: string; text: string; html: string } {
  const company = lead.company?.trim() || 'Empresa sin indicar';
  const areas = lead.solutions.length ? lead.solutions.join(', ') : 'Necesita orientación';
  const when = receivedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' });
  const rows: [string, string][] = [
    ['Nombre', lead.name],
    ['Correo', lead.email],
    ['Teléfono', lead.phone?.trim() || '—'],
    ['Empresa', company],
    ['Equipo', lead.teamSize],
    ['Áreas de interés', areas],
    ['Mensaje', lead.message?.trim() || '—'],
  ];

  const text = [`Nueva solicitud de demo desde el sitio de Aether (${when}).`, '', ...rows.map(([label, value]) => `${label}: ${value}`), '', 'Responde directamente a este correo para contactar a la persona.'].join('\n');

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12161f">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5df;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5df">
<p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a5d1c">Nueva solicitud de demo</p>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:600">${escapeHtml(company)}</h1>
<p style="margin:6px 0 0;font-size:13px;color:#65676e">${escapeHtml(when)}</p>
</td></tr>
<tr><td style="padding:12px 28px 24px"><table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:10px 0;border-bottom:1px solid #f1f0ec;color:#65676e;width:150px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #f1f0ec;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
  )
  .join('')}
</table>
<p style="margin:20px 0 0;font-size:13px;color:#65676e">Responde a este correo para escribirle directamente a ${escapeHtml(lead.name)}.</p>
</td></tr></table></body></html>`;

  return { subject: `Solicitud de demo: ${company} (${lead.teamSize})`, text, html };
}
