import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, SPONSOR_LEAD_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { publicSponsorLeadSchema, SPONSOR_LEAD_HONEYPOT_FIELD } from '@/modules/crm/schema';
import { createInboundSponsorLead } from '@/modules/crm/services/crm.service';
import { resolveSponsorLeadTarget } from '@/modules/projects/services/public-site.service';

/**
 * "Quiero auspiciar" del micrositio de un certamen: sin sesión, resuelto por
 * el slug público. La empresa y el certamen salen SIEMPRE del slug, nunca del
 * cuerpo. Mismo blindaje que el resto de los endpoints públicos (límite por
 * IP + honeypot + Zod). El prospecto queda en el CRM con una tarea para
 * responder mañana y un aviso en la campanita del panel.
 */

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, SPONSOR_LEAD_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 3600;
    return NextResponse.json(
      { success: false, error: 'Recibimos varias solicitudes desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Solicitud inválida', 400);
  }

  // Honeypot: un bot completa el campo oculto. Se responde "ok" para no
  // enseñarle qué lo delató, pero no se registra nada.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)[SPONSOR_LEAD_HONEYPOT_FIELD] === 'string' && (body as Record<string, string>)[SPONSOR_LEAD_HONEYPOT_FIELD] !== '') {
    return NextResponse.json({ success: true, data: null });
  }

  const parsed = publicSponsorLeadSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario', 400);

  try {
    const target = await resolveSponsorLeadTarget(slug);
    if (!target) return jsonError('Este formulario ya no está disponible', 404);

    const lead = await createInboundSponsorLead(target.companyId, target.project, parsed.data);

    if (!lead.deduplicated) {
      await prisma.workflowNotification.create({
        data: {
          companyId: target.companyId,
          severity: 'INFO',
          title: 'Nueva marca interesada en auspiciar',
          message: `${parsed.data.companyName} (${parsed.data.contactName}) escribió desde el sitio de ${target.project.name}.`,
          href: `/dashboard/crm?open=${lead.opportunityId}`,
        },
      });
      // Después de confirmar el registro, nunca dentro de la transacción.
      void emitWorkflowEvent(target.companyId, 'CRM_LEAD_RECEIVED', {
        opportunityId: lead.opportunityId,
        projectName: target.project.name,
        companyName: parsed.data.companyName,
        contactName: parsed.data.contactName,
        contactEmail: parsed.data.email,
        packageName: '',
      });
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    captureException(error, { module: 'crm', extra: { reason: 'public-sponsor-lead', slug } });
    return jsonError('No pudimos registrar tu solicitud. Intenta de nuevo en unos minutos.', 500);
  }
}
