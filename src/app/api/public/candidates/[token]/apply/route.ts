import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateSelfRegistrationSchema, CANDIDATE_HONEYPOT_FIELD } from '@/modules/candidates/schema';
import {
  submitCandidateRegistration,
  RegistrationNotFoundError,
  RegistrationNotOpenError,
  RegistrationFullError,
  BelowMinimumAgeError,
  DuplicateApplicationError,
} from '@/modules/candidates/services/candidates.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, peekRateLimit, CANDIDATE_APPLICATION_ATTEMPT_RATE_LIMIT, CANDIDATE_APPLICATION_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { pageantContact } from '@/lib/events/pageant-contact';
import { buildCandidateApplicationConfirmationEmail, buildNewCandidateApplicationNoticeEmail } from '@/lib/email/templates';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { captureException } from '@/lib/observability';
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile';

/**
 * Endpoint público de postulación: sin autenticación, accesible desde
 * internet. Recibe los 8 datos de la inscripción en JSON (nombre, RUT, edad,
 * comuna, teléfono, correo, Instagram y motivación); sin archivos, así que
 * el cuerpo es chico y se acota a `MAX_BODY_BYTES`. La empresa y el certamen
 * salen SIEMPRE del token del link, nunca del cuerpo.
 */

const MAX_BODY_BYTES = 32 * 1024;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  // Dos topes: intentos (holgado, cuenta todo) y postulaciones enviadas
  // (estricto, se consulta acá y se registra solo al tener éxito, más abajo).
  const attempts = checkRateLimit(clientIp, CANDIDATE_APPLICATION_ATTEMPT_RATE_LIMIT);
  const rl = attempts.allowed ? peekRateLimit(clientIp, CANDIDATE_APPLICATION_RATE_LIMIT) : attempts;
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 3600;
    return NextResponse.json(
      { success: false, error: 'Demasiados envíos desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const contentLength = Number(req.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
    return jsonError('El formulario supera el tamaño máximo permitido', 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await req.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return jsonError('No se pudo leer el formulario enviado', 400);
    body = parsedBody as Record<string, unknown>;
  } catch {
    return jsonError('No se pudo leer el formulario enviado', 400);
  }

  // Honeypot: campo oculto que una persona real nunca completa. Un bot que
  // llena todos los inputs sí lo hace — se descarta en silencio con 200.
  const honeypot = body[CANDIDATE_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { folio: 'OK' } });
  }

  // Cloudflare Turnstile (solo si está configurado).
  const human = await verifyTurnstile(body[TURNSTILE_FIELD], clientIp !== 'unknown' ? clientIp : null, 'candidate-application');
  if (!human.ok) return jsonError(human.error, 403);

  const parsed = candidateSelfRegistrationSchema.safeParse({
    fullName: body.fullName,
    rut: body.rut,
    age: typeof body.age === 'string' && body.age.trim() !== '' ? Number(body.age) : body.age,
    comuna: body.comuna,
    phone: body.phone,
    email: body.email,
    instagram: body.instagram,
    motivacion: body.motivacion,
    guardianName: typeof body.guardianName === 'string' && body.guardianName.trim() !== '' ? body.guardianName : undefined,
    guardianRut: typeof body.guardianRut === 'string' && body.guardianRut.trim() !== '' ? body.guardianRut : undefined,
    aceptaTratamientoDatos: body.aceptaTratamientoDatos,
  });
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  const project = await prisma.project.findUnique({ where: { candidateRegistrationToken: token }, select: { companyId: true } });
  if (!project) return jsonError('Link de inscripción inválido o expirado', 403);
  const companyId = project.companyId;

  try {
    const { candidate, folio } = await submitCandidateRegistration(token, parsed.data, {
      ipOrigen: clientIp !== 'unknown' ? clientIp : undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    checkRateLimit(clientIp, CANDIDATE_APPLICATION_RATE_LIMIT);

    // Fuera de la transacción a propósito: un fallo de SMTP no revierte la
    // postulación. Con `after()` para que Vercel no congele la función antes
    // de que salga el correo.
    after(async () => {
      // Aviso en la campanita del panel, con enlace a la ficha de la postulante.
      await prisma.workflowNotification
        .create({
          data: {
            companyId,
            severity: 'INFO',
            title: 'Nueva postulación de candidata',
            message: `${candidate.fullName} postuló (folio ${folio}).`.slice(0, 500),
            href: `/dashboard/candidates/${candidate.id}`,
          },
        })
        .catch((error) => captureException(error, { module: 'candidates', companyId, extra: { reason: 'bell-notification' } }));
      await sendConfirmationEmails(candidate, folio, companyId).catch((error) =>
        captureException(error, { module: 'candidates', companyId, extra: { reason: 'confirmation-emails' } })
      );
      await emitCandidateRegisteredEvent(candidate, companyId).catch((error) =>
        captureException(error, { module: 'candidates', companyId, extra: { reason: 'workflow-event' } })
      );
    });

    return NextResponse.json({ success: true, data: { folio } });
  } catch (error) {
    if (error instanceof RegistrationNotFoundError) return jsonError(error.message, 403);
    if (error instanceof RegistrationNotOpenError) return jsonError(error.message, 403);
    if (error instanceof RegistrationFullError) return jsonError(error.message, 403);
    if (error instanceof BelowMinimumAgeError) return jsonError(error.message, 403);
    if (error instanceof DuplicateApplicationError) return jsonError(error.message, 409);
    captureException(error, { module: 'candidates', companyId });
    return jsonError('No se pudo enviar la inscripción. Intenta de nuevo más tarde.', 500);
  }
}

async function sendConfirmationEmails(
  candidate: { id: string; fullName: string; email: string | null; comuna: string | null; projectId: string },
  folio: string,
  companyId: string
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: candidate.projectId },
    select: { name: true, publicContactEmail: true, publicWhatsapp: true, instagramHandle: true, company: { select: { businessName: true } } },
  });
  if (!project) return;

  if (candidate.email) {
    const contact = pageantContact(project);
    const confirmation = buildCandidateApplicationConfirmationEmail({
      fullName: candidate.fullName,
      projectName: project.name,
      companyName: project.company.businessName,
      folio,
      contact,
    });
    // Si la postulante responde el correo, la respuesta llega al certamen, no a la plataforma.
    await sendEmail({ to: candidate.email, ...confirmation, ...(contact.email ? { replyTo: contact.email } : {}) });
  }

  const owners = await prisma.user.findMany({ where: { companyId, role: 'OWNER', isActive: true }, select: { email: true } });
  if (owners.length === 0) return;
  const notice = buildNewCandidateApplicationNoticeEmail({
    projectName: project.name,
    folio,
    comuna: candidate.comuna ?? '—',
    dashboardUrl: `${getAppUrl()}/dashboard/candidates`,
  });
  await Promise.all(owners.map((owner) => sendEmail({ to: owner.email, ...notice })));
}

async function emitCandidateRegisteredEvent(candidate: { id: string; fullName: string; projectId: string }, companyId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: candidate.projectId }, select: { name: true } });
  await emitWorkflowEvent(companyId, 'CANDIDATE_REGISTERED', {
    candidateId: candidate.id,
    fullName: candidate.fullName,
    projectId: candidate.projectId,
    projectName: project?.name ?? null,
  });
}
