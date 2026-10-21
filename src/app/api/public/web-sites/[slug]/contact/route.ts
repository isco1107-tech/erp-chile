import { NextResponse, after } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { checkRateLimit, WEB_SITE_CONTACT_RATE_LIMIT, WEB_SITE_CONTACT_SITE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { WEB_SITE_HONEYPOT_FIELD } from '@/lib/web-sites/constants';
import { DESTINATION_INFO, PURPOSE_LABELS, destinationHref } from '@/lib/web-sites/forms';
import { publicFormSubmissionSchema, publicWebSiteMessageSchema } from '@/modules/web-sites/schema';
import { submitPublicForm, type PublicFormInput } from '@/modules/web-sites/services/web-site-forms.service';
import { countRecentMessages, getPublicWebSite } from '@/modules/web-sites/services/web-sites.service';

/** Un formulario largo (16 preguntas con texto largo) cabe holgado; el límite corta cuerpos gigantes antes de leerlos. */
const MAX_BODY_BYTES = 64 * 1024;
/** Tope por sitio y por hora, contado en la base de datos: el límite en memoria no se comparte entre instancias serverless. */
const MAX_MESSAGES_PER_SITE_PER_HOUR = 60;

/**
 * Envío de un formulario de un sitio publicado (sección «Formulario» o el del
 * bloque «Contacto»): sin sesión, resuelto por el slug. La empresa sale
 * SIEMPRE del sitio, nunca del cuerpo, y las respuestas se validan contra el
 * formulario PUBLICADO. Blindaje igual al de los demás formularios públicos:
 * límite por IP y por sitio, campo señuelo y Zod. El envío queda en la bandeja
 * del sitio y, según el destino del formulario, también en el CRM, la academia
 * o las tareas del equipo. El aviso llega a la campanita y al motor de
 * automatizaciones (el correo lo arma cada empresa con una regla; no se manda
 * correo desde acá a direcciones que el usuario del sitio escribió).
 *
 * Acepta además el cuerpo de antes (`name`, `email`, `phone`, `message`) de
 * quien tenga la página abierta desde antes del cambio: va al formulario de
 * contacto del sitio.
 */

function jsonError(message: string, status: number, headers?: Record<string, string>, fieldId?: string) {
  return NextResponse.json({ success: false, error: message, ...(fieldId ? { fieldId } : {}) }, { status, headers });
}

/** Cuerpo nuevo (`formId` + `answers`) o el de antes, ya convertido al nuevo. */
function readSubmission(body: unknown): { ok: true; input: PublicFormInput } | { ok: false; error: string } {
  if (body && typeof body === 'object' && 'answers' in body) {
    const parsed = publicFormSubmissionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'Revisa los datos del formulario' };
    return { ok: true, input: parsed.data };
  }
  const legacy = publicWebSiteMessageSchema.safeParse(body);
  if (!legacy.success) return { ok: false, error: legacy.error.issues[0]?.message ?? 'Revisa los datos del formulario' };
  return { ok: true, input: { formId: null, answers: { name: legacy.data.name, email: legacy.data.email, phone: legacy.data.phone ?? '', message: legacy.data.message } } };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const ipLimit = checkRateLimit(clientIp, WEB_SITE_CONTACT_RATE_LIMIT);
  if (!ipLimit.allowed) {
    const retryAfter = ipLimit.retryAfterMs ? Math.max(1, Math.ceil((ipLimit.retryAfterMs - Date.now()) / 1000)) : 3600;
    return jsonError('Recibimos varios envíos desde esta conexión. Intenta de nuevo más tarde.', 429, { 'Retry-After': String(retryAfter) });
  }

  let body: unknown;
  try {
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return jsonError('El formulario es demasiado largo', 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError('El formulario es demasiado largo', 413);
    body = JSON.parse(raw);
  } catch {
    return jsonError('Solicitud inválida', 400);
  }

  // Señuelo: un bot completa el campo oculto. Se responde "ok" sin registrar nada.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)[WEB_SITE_HONEYPOT_FIELD] === 'string' && (body as Record<string, string>)[WEB_SITE_HONEYPOT_FIELD] !== '') {
    return NextResponse.json({ success: true, data: null });
  }

  const submission = readSubmission(body);
  if (!submission.ok) return jsonError(submission.error, 400);

  try {
    const site = await getPublicWebSite(slug);
    if (!site || !site.acceptsMessages) return jsonError('Este formulario ya no está disponible', 404);

    const siteLimit = checkRateLimit(site.id, WEB_SITE_CONTACT_SITE_RATE_LIMIT);
    if (!siteLimit.allowed || (await countRecentMessages(site.companyId, site.id, 60)) >= MAX_MESSAGES_PER_SITE_PER_HOUR) {
      return jsonError('Este sitio recibió muchos envíos seguidos. Intenta de nuevo en un rato.', 429);
    }

    const result = await submitPublicForm(site, submission.input);
    if (!result.ok) return jsonError(result.error, result.status, undefined, result.fieldId);

    // Después de guardar y de responder: la campanita, el push y las automatizaciones
    // son I/O externo y no pueden impedir que el envío quede registrado.
    after(async () => {
      const purpose = PURPOSE_LABELS[result.form.purpose];
      const routedHref = result.routed?.id ? destinationHref(result.routed.kind, result.routed.id) : null;
      const where = result.routed?.id ? ` Quedó en ${DESTINATION_INFO[result.routed.kind].where}.` : '';
      const isContact = result.form.purpose === 'contact';
      try {
        await notifyCompany(site.companyId, {
          severity: 'INFO',
          title: isContact ? 'Nuevo mensaje desde tu sitio web' : `${purpose}: nuevo envío desde tu sitio web`,
          message: (isContact ? `${result.name} escribió desde "${site.name}": ${result.message}${where}` : `${result.name} completó «${result.form.title}» en "${site.name}".${where} ${result.summary}`).slice(0, 500),
          // El push se ve en la pantalla bloqueada: sin correo, teléfono ni respuestas.
          pushMessage: isContact ? `${result.name} escribió desde "${site.name}".` : `${result.name} completó «${result.form.title}» en "${site.name}".`,
          href: routedHref ?? `/dashboard/web-sites/${site.id}?tab=messages`,
        });
      } catch (error) {
        captureException(error, { module: 'sitios-web', companyId: site.companyId, extra: { reason: 'form-notification' } });
      }
      void emitWorkflowEvent(site.companyId, 'WEB_SITE_MESSAGE_RECEIVED', {
        siteId: site.id,
        siteName: site.name,
        senderName: result.name,
        senderEmail: result.email ?? '',
        senderPhone: result.phone ?? '',
        message: (isContact ? result.message : result.summary).slice(0, 1000),
        messageId: result.messageId,
        formTitle: result.form.title,
        purpose,
        destination: DESTINATION_INFO[result.routed?.kind ?? 'inbox'].label,
        tag: result.form.tag,
      });
    });

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    captureException(error, { module: 'sitios-web', extra: { reason: 'public-form', slug } });
    return jsonError('No pudimos enviar el formulario. Intenta de nuevo en unos minutos.', 500);
  }
}
