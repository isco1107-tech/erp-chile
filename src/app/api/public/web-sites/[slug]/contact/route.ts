import { NextResponse, after } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { checkRateLimitShared } from '@/lib/security/rate-limiter-shared';
import { WEB_SITE_CONTACT_RATE_LIMIT, WEB_SITE_CONTACT_SITE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { WEB_SITE_HONEYPOT_FIELD } from '@/lib/web-sites/constants';
import { publicWebSiteMessageSchema } from '@/modules/web-sites/schema';
import { countRecentMessages, createPublicMessage, getPublicWebSite } from '@/modules/web-sites/services/web-sites.service';

/** Un mensaje legítimo pesa unos cientos de bytes; el límite corta cuerpos gigantes antes de leerlos. */
const MAX_BODY_BYTES = 16 * 1024;
/** Tope por sitio y por hora, contado en la base de datos: el límite en memoria no se comparte entre instancias serverless. */
const MAX_MESSAGES_PER_SITE_PER_HOUR = 60;

/**
 * Formulario de contacto de un sitio publicado: sin sesión, resuelto por el
 * slug. La empresa sale SIEMPRE del sitio, nunca del cuerpo. Blindaje igual al
 * de los demás formularios públicos: límite por IP y por sitio, campo señuelo
 * y Zod. Solo se acepta si el sitio publicado tiene de verdad un formulario
 * activo. El aviso llega a la campanita del panel y al motor de automatizaciones
 * (el correo lo arma cada empresa con una regla; no se manda correo desde acá
 * a direcciones que el usuario del sitio escribió).
 */

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ success: false, error: message }, { status, headers });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const ipLimit = await checkRateLimitShared(clientIp, WEB_SITE_CONTACT_RATE_LIMIT);
  if (!ipLimit.allowed) {
    const retryAfter = ipLimit.retryAfterMs ? Math.max(1, Math.ceil((ipLimit.retryAfterMs - Date.now()) / 1000)) : 3600;
    return jsonError('Recibimos varios mensajes desde esta conexión. Intenta de nuevo más tarde.', 429, { 'Retry-After': String(retryAfter) });
  }

  let body: unknown;
  try {
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return jsonError('El mensaje es demasiado largo', 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError('El mensaje es demasiado largo', 413);
    body = JSON.parse(raw);
  } catch {
    return jsonError('Solicitud inválida', 400);
  }

  // Señuelo: un bot completa el campo oculto. Se responde "ok" sin registrar nada.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)[WEB_SITE_HONEYPOT_FIELD] === 'string' && (body as Record<string, string>)[WEB_SITE_HONEYPOT_FIELD] !== '') {
    return NextResponse.json({ success: true, data: null });
  }

  const parsed = publicWebSiteMessageSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario', 400);

  try {
    const site = await getPublicWebSite(slug);
    if (!site || !site.acceptsMessages) return jsonError('Este formulario ya no está disponible', 404);

    const siteLimit = await checkRateLimitShared(site.id, WEB_SITE_CONTACT_SITE_RATE_LIMIT);
    if (!siteLimit.allowed || (await countRecentMessages(site.companyId, site.id, 60)) >= MAX_MESSAGES_PER_SITE_PER_HOUR) {
      return jsonError('Este sitio recibió muchos mensajes seguidos. Intenta de nuevo en un rato.', 429);
    }

    const message = await createPublicMessage(site, parsed.data);

    // Después de guardar y de responder: la campanita, el push y las automatizaciones
    // son I/O externo y no pueden impedir que el mensaje quede registrado.
    after(async () => {
      try {
        await notifyCompany(site.companyId, {
          severity: 'INFO',
          title: 'Nuevo mensaje desde tu sitio web',
          message: `${parsed.data.name} escribió desde "${site.name}": ${parsed.data.message}`.slice(0, 500),
          pushMessage: `${parsed.data.name} escribió desde "${site.name}".`,
          href: `/dashboard/web-sites/${site.id}?tab=messages`,
        });
      } catch (error) {
        captureException(error, { module: 'sitios-web', companyId: site.companyId, extra: { reason: 'contact-notification' } });
      }
      void emitWorkflowEvent(site.companyId, 'WEB_SITE_MESSAGE_RECEIVED', {
        siteId: site.id,
        siteName: site.name,
        senderName: parsed.data.name,
        senderEmail: parsed.data.email,
        senderPhone: parsed.data.phone || '',
        message: parsed.data.message.slice(0, 1000),
        messageId: message.id,
      });
    });

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    captureException(error, { module: 'sitios-web', extra: { reason: 'public-contact', slug } });
    return jsonError('No pudimos enviar tu mensaje. Intenta de nuevo en unos minutos.', 500);
  }
}
