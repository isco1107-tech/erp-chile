import { z } from 'zod';
import { calculateIva, formatCurrency } from '@/lib/chile/tax';
import { escapeHtml } from '@/lib/email/templates';
import { BASE_PLATFORM, PRICED_MODULES, PRICING_PLANS, type PricedModule, type PricingPlan } from '@/lib/pricing/catalog';
import { QUOTABLE_MODULE_IDS } from './module-showcase';

/**
 * Cotización desde la vitrina de módulos de la landing: la persona marca los
 * módulos que le interesan (carrito) y deja sus datos. Llega como correo a
 * ventas, que responde con la cotización. El navegador manda solo ids: el
 * servidor descarta los desconocidos y calcula los montos de referencia con el
 * tarifario (que la landing no publica, por eso solo van en el correo interno).
 */

export const MODULE_QUOTE_HONEYPOT_FIELD = 'website';

export const moduleQuoteSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre').max(120),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido').max(160),
  phone: z
    .string()
    .trim()
    .min(8, 'Ingresa un teléfono o WhatsApp de contacto')
    .max(30)
    .regex(/^[+\d\s()-]+$/, 'El teléfono solo puede tener números, espacios y +'),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
  moduleIds: z.array(z.string().min(1).max(64)).min(1, 'Elige al menos un módulo').max(PRICED_MODULES.length * 2),
});

export type ModuleQuoteRequest = z.infer<typeof moduleQuoteSchema>;

export interface ModuleQuoteEstimate {
  modules: PricedModule[];
  /** Plataforma base + módulos, CLP/mes sin IVA. */
  net: number;
  iva: number;
  total: number;
  /** El plan más barato que incluye todo lo pedido, si sale más conveniente que sumar módulos sueltos. */
  suggestedPlan: PricingPlan | null;
}

/** Módulos pedidos que existen en el tarifario, sin repetir y en el orden del tarifario. */
export function selectedModules(ids: readonly string[]): PricedModule[] {
  const wanted = new Set(ids.filter((id) => QUOTABLE_MODULE_IDS.has(id)));
  return PRICED_MODULES.filter((m) => wanted.has(m.id));
}

export function estimateModuleQuote(ids: readonly string[]): ModuleQuoteEstimate {
  const modules = selectedModules(ids);
  const net = BASE_PLATFORM.price + modules.reduce((sum, m) => sum + m.price, 0);
  const iva = calculateIva(net);
  const covering = PRICING_PLANS.filter((plan) => modules.every((m) => plan.moduleIds.includes(m.id)) && plan.price < net);
  const suggestedPlan = covering.reduce<PricingPlan | null>((best, plan) => (!best || plan.price < best.price ? plan : best), null);
  return { modules, net, iva, total: net + iva, suggestedPlan };
}

export function buildModuleQuoteEmail(
  request: ModuleQuoteRequest,
  estimate: ModuleQuoteEstimate,
  receivedAt: Date = new Date()
): { subject: string; text: string; html: string } {
  const when = receivedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' });
  const company = request.company?.trim() || '—';
  const note = request.message?.trim() || '—';
  const contact: [string, string][] = [
    ['Nombre', request.name],
    ['Correo', request.email],
    ['Teléfono', request.phone],
    ['Empresa', company],
  ];
  const lines: { label: string; amount: number }[] = [
    { label: `Plataforma base (incluye ${BASE_PLATFORM.includedUsers} usuarios)`, amount: BASE_PLATFORM.price },
    ...estimate.modules.map((m) => ({ label: m.label, amount: m.price })),
  ];
  const plan = estimate.suggestedPlan;
  const planText = plan ? `Plan ${plan.label} (${formatCurrency(plan.price)}/mes + IVA, ${plan.includedUsers} usuarios) incluye todo lo pedido y sale más conveniente.` : null;

  const text = [
    `Nueva solicitud de cotización de módulos desde el sitio de Aether (${when}).`,
    '',
    ...contact.map(([label, value]) => `${label}: ${value}`),
    '',
    'Módulos de interés (precio de lista de referencia, mensual + IVA):',
    ...lines.map((l) => `- ${l.label}: ${formatCurrency(l.amount)}`),
    '',
    `Neto mensual: ${formatCurrency(estimate.net)}`,
    `IVA: ${formatCurrency(estimate.iva)}`,
    `Total mensual: ${formatCurrency(estimate.total)}`,
    ...(planText ? ['', planText] : []),
    '',
    `Mensaje: ${note}`,
    '',
    'Responde a este correo para enviarle la cotización directamente.',
  ].join('\n');

  const cell = 'padding:8px 0;border-bottom:1px solid #f1f0ec';
  const contactRows = contact
    .map(([label, value]) => `<tr><td style="${cell};color:#65676e;width:110px;vertical-align:top">${escapeHtml(label)}</td><td style="${cell}">${escapeHtml(value)}</td></tr>`)
    .join('');
  const moduleRows = lines
    .map((l) => `<tr><td style="${cell}">${escapeHtml(l.label)}</td><td style="${cell};text-align:right;white-space:nowrap">${escapeHtml(formatCurrency(l.amount))}</td></tr>`)
    .join('');

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12161f">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5df;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5df">
<p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a5d1c">Cotización de módulos</p>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:600">${escapeHtml(request.company?.trim() || request.name)}</h1>
<p style="margin:6px 0 0;font-size:13px;color:#65676e">${escapeHtml(when)} · ${estimate.modules.length} ${estimate.modules.length === 1 ? 'módulo' : 'módulos'}</p>
</td></tr>
<tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">${contactRows}</table></td></tr>
<tr><td style="padding:16px 28px 24px">
<p style="margin:0 0 8px;font-size:13px;color:#65676e">Precio de lista de referencia, mensual + IVA:</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">${moduleRows}
<tr><td style="padding:8px 0;color:#65676e">Neto mensual</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatCurrency(estimate.net))}</td></tr>
<tr><td style="padding:8px 0;color:#65676e">IVA</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatCurrency(estimate.iva))}</td></tr>
<tr><td style="padding:8px 0;font-weight:600">Total mensual</td><td style="padding:8px 0;text-align:right;font-weight:600">${escapeHtml(formatCurrency(estimate.total))}</td></tr>
</table>
${planText ? `<p style="margin:14px 0 0;padding:10px 12px;border-radius:8px;background:#faf5e6;font-size:13px">${escapeHtml(planText)}</p>` : ''}
<p style="margin:16px 0 0;font-size:14px;white-space:pre-wrap"><span style="color:#65676e">Mensaje:</span> ${escapeHtml(note)}</p>
<p style="margin:20px 0 0;font-size:13px;color:#65676e">Responde a este correo para enviarle la cotización a ${escapeHtml(request.name)}.</p>
</td></tr></table></body></html>`;

  const who = request.company?.trim() || request.name;
  return { subject: `Cotización de módulos: ${who} (${estimate.modules.length})`, text, html };
}
