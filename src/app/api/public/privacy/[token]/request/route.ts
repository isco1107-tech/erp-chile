import { NextResponse, after } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimitShared } from '@/lib/security/rate-limiter-shared';
import { PRIVACY_REQUEST_EMAIL_RATE_LIMIT, PRIVACY_REQUEST_RATE_LIMIT, PRIVACY_REQUEST_TOKEN_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile';
import { publicDataSubjectRequestSchema } from '@/lib/privacy/schema';
import { REQUEST_TYPE_LABELS } from '@/lib/privacy/constants';
import { createDataSubjectRequest, resolvePrivacyPortal } from '@/modules/data-protection/services/requests.service';
import { createAuditLog } from '@/lib/auth/audit';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { sendEmail } from '@/lib/email/mailer';
import { buildDataSubjectRequestAckEmail } from '@/lib/email/templates';
import { captureException } from '@/lib/observability';

/**
 * Formulario público para ejercer derechos sobre datos personales. Sin
 * sesión: la empresa sale del token de la URL, nunca del cuerpo. Es un trámite,
 * no una consulta: tope bajo por IP, honeypot y Turnstile (si está activo). El
 * acuse de recibo sale con la cuenta de correo de la empresa y no contiene
 * datos personales más allá del nombre que escribió quien pidió.
 */

const MAX_BODY_BYTES = 16 * 1024;
const HONEYPOT_FIELD = 'website';

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clientIp = extractClientIp(req) ?? 'unknown';

  const rl = await checkRateLimitShared(clientIp, PRIVACY_REQUEST_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.max(1, Math.ceil((rl.retryAfterMs - Date.now()) / 1000)) : 3600;
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const contentLength = Number(req.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) return jsonError('El formulario supera el tamaño máximo permitido', 413);

  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await req.json();
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) return jsonError('No se pudo leer el formulario enviado', 400);
    body = parsedBody as Record<string, unknown>;
  } catch {
    return jsonError('No se pudo leer el formulario enviado', 400);
  }

  // Honeypot: una persona real nunca completa este campo oculto; un bot sí. Se descarta en silencio con 200.
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') return NextResponse.json({ success: true, data: { received: true } });

  const human = await verifyTurnstile(body[TURNSTILE_FIELD], clientIp !== 'unknown' ? clientIp : null, 'privacy-request');
  if (!human.ok) return jsonError(human.error, 403);

  const parsed = publicDataSubjectRequestSchema.safeParse({
    type: body.type,
    requesterName: body.requesterName,
    requesterEmail: body.requesterEmail,
    requesterRut: typeof body.requesterRut === 'string' && body.requesterRut.trim() !== '' ? body.requesterRut : undefined,
    details: typeof body.details === 'string' && body.details.trim() !== '' ? body.details : undefined,
    acceptsIdentityCheck: body.acceptsIdentityCheck,
  });
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);

  const portal = await resolvePrivacyPortal(token);
  if (!portal) return jsonError('Este enlace no es válido o ya no está disponible', 404);

  // Por enlace: frena un ataque repartido en muchas IP contra una misma empresa.
  if (!(await checkRateLimitShared(token, PRIVACY_REQUEST_TOKEN_RATE_LIMIT)).allowed) {
    return jsonError('Estamos recibiendo muchas solicitudes. Intenta de nuevo más tarde.', 429);
  }
  // Por correo: nadie puede usar este formulario para llenar de correos a un tercero. Pasado el tope se
  // responde igual que si se hubiera recibido, para no revelar el límite ni confirmar que el correo existe.
  if (!(await checkRateLimitShared(parsed.data.requesterEmail, PRIVACY_REQUEST_EMAIL_RATE_LIMIT)).allowed) {
    return NextResponse.json({ success: true, data: { received: true } });
  }

  try {
    const { type, requesterName, requesterEmail, requesterRut, details } = parsed.data;
    const request = await createDataSubjectRequest(portal.companyId, { type, requesterName, requesterEmail, requesterRut, details }, 'PUBLIC_FORM');
    const typeLabel = REQUEST_TYPE_LABELS[request.type];

    // Fuera de la respuesta: un fallo de correo o de aviso nunca deshace la solicitud ya guardada.
    after(async () => {
      await createAuditLog({
        companyId: portal.companyId,
        userEmail: 'sistema (formulario público de derechos)',
        action: 'CREATE',
        entity: 'DataSubjectRequest',
        entityId: request.id,
        metadata: { type: request.type, source: 'PUBLIC_FORM' },
      });
      await notifyCompany(portal.companyId, {
        severity: 'WARNING',
        title: 'Nueva solicitud de derechos sobre datos personales',
        message: `Solicitud de ${typeLabel.toLowerCase()}. Hay un plazo legal para responderla.`,
        href: '/dashboard/settings/privacy',
      }).catch((error) => captureException(error, { module: 'proteccion-datos', companyId: portal.companyId, extra: { reason: 'aviso-solicitud' } }));

      const ack = buildDataSubjectRequestAckEmail({
        companyName: portal.companyName,
        typeLabel,
        dueDateLabel: request.dueAt.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long', year: 'numeric' }),
        contactEmail: portal.contactEmail,
      });
      await sendEmail({
        to: request.requesterEmail,
        companyId: portal.companyId,
        ...ack,
        ...(portal.contactEmail ? { replyTo: portal.contactEmail } : {}),
      }).catch((error) => captureException(error, { module: 'proteccion-datos', companyId: portal.companyId, extra: { reason: 'acuse-de-recibo' } }));
    });

    return NextResponse.json({ success: true, data: { received: true } });
  } catch (error) {
    captureException(error, { module: 'proteccion-datos', companyId: portal.companyId });
    return jsonError('No pudimos registrar tu solicitud. Intenta de nuevo más tarde.', 500);
  }
}
