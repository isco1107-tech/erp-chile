import { z } from 'zod';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { escapeHtml } from '@/lib/email/templates';
import { formatCurrency } from '@/lib/chile/tax';
import { PRICED_MODULES, PRICING_PLANS } from './catalog';
import { buildQuote, type Quote } from './quote';

/**
 * Solicitud de contratación de módulos o de cambio de plan, enviada por una
 * empresa que ya es cliente. Aether no activa nada solo: la solicitud llega al
 * correo de ventas y un ejecutivo (o el superadmin) enciende los módulos. Por
 * eso el servidor vuelve a cotizar: el cliente manda ids, nunca montos.
 */

export const moduleRequestSchema = z
  .object({
    itemIds: z.array(z.string().min(1).max(64)).max(PRICED_MODULES.length),
    planId: z.enum(PRICING_PLANS.map((p) => p.id) as [string, ...string[]]).nullable().optional(),
    message: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine((v) => v.itemIds.length > 0 || Boolean(v.planId), { message: 'Elige al menos un módulo o un plan' });

export type ModuleRequestInput = z.infer<typeof moduleRequestSchema>;

export interface ModuleRequestContext {
  businessName: string;
  rut: string;
  userName: string;
  userEmail: string;
}

export function buildModuleRequestEmail(
  quote: Quote,
  ctx: ModuleRequestContext,
  message: string | undefined,
  receivedAt: Date = new Date()
): { subject: string; text: string; html: string } {
  const when = receivedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' });
  const lines: { label: string; amount: number }[] = [
    ...(quote.plan ? [{ label: `Plan ${quote.plan.label}`, amount: quote.plan.price }] : []),
    ...quote.items.map((m) => ({ label: m.label, amount: m.price })),
  ];
  const note = message?.trim() || '—';

  const text = [
    `Solicitud de contratación desde el panel (${when}).`,
    '',
    `Empresa: ${ctx.businessName} (${ctx.rut})`,
    `Solicita: ${ctx.userName} <${ctx.userEmail}>`,
    '',
    ...lines.map((l) => `- ${l.label}: ${formatCurrency(l.amount)}/mes + IVA`),
    '',
    `Neto mensual: ${formatCurrency(quote.net)}`,
    `IVA: ${formatCurrency(quote.iva)}`,
    `Total mensual: ${formatCurrency(quote.total)}`,
    '',
    `Mensaje: ${note}`,
    '',
    'Responde a este correo para coordinar. Los módulos se activan desde el panel de superadmin.',
  ].join('\n');

  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f0ec">${escapeHtml(l.label)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f0ec;text-align:right;white-space:nowrap">${escapeHtml(formatCurrency(l.amount))}</td></tr>`
    )
    .join('');

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12161f">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5df;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5df">
<p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a5d1c">Solicitud de contratación</p>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:600">${escapeHtml(ctx.businessName)}</h1>
<p style="margin:6px 0 0;font-size:13px;color:#65676e">${escapeHtml(ctx.rut)} · ${escapeHtml(when)}</p>
</td></tr>
<tr><td style="padding:12px 28px 24px">
<p style="margin:0 0 8px;font-size:14px">Solicita <strong>${escapeHtml(ctx.userName)}</strong> (${escapeHtml(ctx.userEmail)}):</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">${rows}
<tr><td style="padding:8px 0;color:#65676e">Neto mensual</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatCurrency(quote.net))}</td></tr>
<tr><td style="padding:8px 0;color:#65676e">IVA</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatCurrency(quote.iva))}</td></tr>
<tr><td style="padding:8px 0;font-weight:600">Total mensual</td><td style="padding:8px 0;text-align:right;font-weight:600">${escapeHtml(formatCurrency(quote.total))}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:14px;white-space:pre-wrap"><span style="color:#65676e">Mensaje:</span> ${escapeHtml(note)}</p>
</td></tr></table></body></html>`;

  return { subject: `Contratación de módulos: ${ctx.businessName}`, text, html };
}

/** Cotiza lo pedido contra lo que la empresa ya tiene; `null` si no queda nada que contratar. */
export function quoteModuleRequest(input: ModuleRequestInput, features: CompanyFeatureFlags): Quote | null {
  const quote = buildQuote(input.itemIds, input.planId ?? null, features);
  return quote.plan || quote.items.length > 0 ? quote : null;
}
