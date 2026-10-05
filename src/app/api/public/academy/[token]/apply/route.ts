import { NextResponse, after } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { ACADEMY_APPLICATION_COMPANY_RATE_LIMIT, ACADEMY_APPLICATION_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { ACADEMY_HONEYPOT_FIELD, publicApplicationSchema } from '@/modules/academy/schema';
import { countRecentApplications, resolveEnrollment, submitApplication } from '@/modules/academy/services/academy-enrollment.service';

/** Una inscripción legítima pesa unos cientos de bytes; el límite corta cuerpos gigantes antes de leerlos. */
const MAX_BODY_BYTES = 16 * 1024;
/** Tope por empresa y por hora, contado en la base de datos: el límite en memoria no se comparte entre instancias serverless. */
const MAX_APPLICATIONS_PER_COMPANY_PER_HOUR = 60;

/**
 * Inscripción pública a la academia: sin sesión, resuelta por el token del
 * enlace. La empresa sale SIEMPRE del token, nunca del cuerpo. Blindaje igual
 * al de los demás formularios públicos: límite por IP y por empresa, campo
 * señuelo y Zod. La inscripción queda pendiente de revisión; el aviso llega a
 * la campanita (no se manda correo a direcciones que escribió el visitante).
 */

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ success: false, error: message }, { status, headers });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const ipLimit = checkRateLimit(clientIp, ACADEMY_APPLICATION_RATE_LIMIT);
  if (!ipLimit.allowed) {
    const retryAfter = ipLimit.retryAfterMs ? Math.max(1, Math.ceil((ipLimit.retryAfterMs - Date.now()) / 1000)) : 3600;
    return jsonError('Recibimos varias inscripciones desde esta conexión. Intenta de nuevo más tarde.', 429, { 'Retry-After': String(retryAfter) });
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
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)[ACADEMY_HONEYPOT_FIELD] === 'string' && (body as Record<string, string>)[ACADEMY_HONEYPOT_FIELD] !== '') {
    return NextResponse.json({ success: true, data: null });
  }

  const parsed = publicApplicationSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario', 400);

  try {
    const resolved = await resolveEnrollment(token);
    if (!resolved) return jsonError('Este enlace de inscripción ya no está disponible', 404);

    const companyLimit = checkRateLimit(resolved.companyId, ACADEMY_APPLICATION_COMPANY_RATE_LIMIT);
    if (!companyLimit.allowed || (await countRecentApplications(resolved.companyId, 60)) >= MAX_APPLICATIONS_PER_COMPANY_PER_HOUR) {
      return jsonError('Recibimos muchas inscripciones seguidas. Intenta de nuevo en un rato.', 429);
    }

    const result = await submitApplication(resolved, parsed.data);

    // Después de guardar y de responder: la campanita y el push son I/O externo
    // y no pueden impedir que la inscripción quede registrada. El push es discreto
    // (sin nombre), porque se ve en la pantalla bloqueada.
    if (result.created) {
      after(async () => {
        try {
          await notifyCompany(resolved.companyId, {
            severity: 'INFO',
            title: 'Nueva inscripción a la academia',
            message: `${parsed.data.fullName} se inscribió desde el formulario. Revísala en Academia → Inscripciones.`,
            pushMessage: 'Llegó una nueva inscripción a la academia.',
            href: '/dashboard/academy',
          });
        } catch (error) {
          captureException(error, { module: 'academia', companyId: resolved.companyId, extra: { reason: 'application-notification' } });
        }
      });
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    captureException(error, { module: 'academia', extra: { reason: 'public-application' } });
    return jsonError('No pudimos enviar tu inscripción. Intenta de nuevo en unos minutos.', 500);
  }
}
