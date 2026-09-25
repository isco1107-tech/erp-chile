import { NextResponse, after } from 'next/server';
import { put, del } from '@/lib/storage/blob';
import { prisma } from '@/lib/prisma';
import { candidateSelfRegistrationSchema, CANDIDATE_HONEYPOT_FIELD } from '@/modules/candidates/schema';
import {
  submitCandidateRegistration,
  RegistrationNotFoundError,
  RegistrationNotOpenError,
  RegistrationFullError,
  BelowMinimumAgeError,
  DuplicateApplicationError,
  type UploadedApplicationPhoto,
} from '@/modules/candidates/services/candidates.service';
import { sniffImageType, SNIFFED_IMAGE_EXTENSION, sniffCertificateType, SNIFFED_CERTIFICATE_EXTENSION } from '@/lib/security/file-signature';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, peekRateLimit, CANDIDATE_APPLICATION_ATTEMPT_RATE_LIMIT, CANDIDATE_APPLICATION_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { pageantContact } from '@/lib/events/pageant-contact';
import { buildCandidateApplicationConfirmationEmail, buildNewCandidateApplicationNoticeEmail } from '@/lib/email/templates';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { captureException } from '@/lib/observability';
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile';
import crypto from 'crypto';

/**
 * Endpoint público de postulación (Sección 3 del módulo): sin autenticación,
 * accesible desde internet, `multipart/form-data`. Va en un Route Handler
 * (no una Server Action) porque incluye 2 fotografías de hasta 5 MB cada
 * una — el límite de body de una Server Action es 1 MB.
 *
 * El prompt original pedía la ruta `POST /postular/{token}`. Se adaptó a
 * `POST /api/public/candidates/{token}/apply` porque en este proyecto TODAS
 * las rutas de servidor viven bajo `/api/` (convención de Next.js App
 * Router ya establecida por el resto del código, ej.
 * `/api/candidates/photo-upload`) — crear una ruta fuera de `/api/` habría
 * sido un patrón nuevo sin motivo.
 */

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BODY_BYTES = 20 * 1024 * 1024; // 2 fotos + certificado médico opcional + campos de texto, con margen.

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function sniffAndValidatePhoto(file: File, label: string): Promise<{ bytes: Uint8Array; mimeType: string; extension: string } | { error: string }> {
  if (file.size === 0) return { error: `Adjunta la fotografía de ${label}` };
  if (file.size > MAX_PHOTO_BYTES) return { error: `La fotografía de ${label} supera los 5 MB` };

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(buffer);
  if (!sniffed) return { error: `La fotografía de ${label} debe ser JPG o PNG (el archivo no corresponde a ninguno de esos formatos)` };

  return { bytes: buffer, mimeType: sniffed, extension: SNIFFED_IMAGE_EXTENSION[sniffed] };
}

/** El certificado médico es opcional (a diferencia de las 2 fotografías) y
 * además de JPG/PNG acepta PDF (un escaneo del papel). */
async function sniffAndValidateCertificate(file: File): Promise<{ bytes: Uint8Array; mimeType: string; extension: string } | { error: string }> {
  if (file.size === 0) return { error: 'El certificado médico está vacío' };
  if (file.size > MAX_PHOTO_BYTES) return { error: 'El certificado médico supera los 5 MB' };

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffCertificateType(buffer);
  if (!sniffed) return { error: 'El certificado médico debe ser JPG, PNG o PDF' };

  return { bytes: buffer, mimeType: sniffed, extension: SNIFFED_CERTIFICATE_EXTENSION[sniffed] };
}

/** Recorta strings vacíos de FormData a `undefined` para que los campos
 * opcionales del schema Zod los trate como "no enviado", no como "" inválido. */
function formValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== 'string') return undefined;
  return value.trim() === '' ? undefined : value;
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

  // Un `fetch` normal con `FormData` SIEMPRE manda `Content-Length` (no usa
  // chunked transfer) — que falte es en sí mismo sospechoso, así que se
  // rechaza en vez de asumir 0 y dejar pasar un body de tamaño arbitrario
  // antes de que `req.formData()` (línea de abajo) empiece a parsearlo.
  const contentLengthHeader = req.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (!Number.isFinite(contentLength) || contentLength > MAX_TOTAL_BODY_BYTES) {
    return jsonError('El formulario supera el tamaño máximo permitido', 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('No se pudo leer el formulario enviado', 400);
  }

  // Honeypot: campo oculto que una persona real nunca completa. Un bot que
  // llena todos los inputs del DOM sí lo hace — se descarta en silencio con
  // 200, sin dar pistas de que fue detectado (Sección 3 del módulo).
  const honeypot = form.get(CANDIDATE_HONEYPOT_FIELD);
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { folio: 'OK' } });
  }

  // Cloudflare Turnstile (solo si está configurado): antes de validar datos y
  // de subir fotos, para que un bot no gaste almacenamiento ni cupos.
  const human = await verifyTurnstile(form.get(TURNSTILE_FIELD), clientIp !== 'unknown' ? clientIp : null, 'candidate-application');
  if (!human.ok) return jsonError(human.error, 403);

  const heightCmRaw = formValue(form, 'heightCm');
  const rawInput = {
    rut: formValue(form, 'rut'),
    fullName: formValue(form, 'fullName'),
    stageName: formValue(form, 'stageName'),
    email: formValue(form, 'email'),
    phone: formValue(form, 'phone'),
    birthDate: formValue(form, 'birthDate'),
    dressSize: formValue(form, 'dressSize'),
    shoeSize: formValue(form, 'shoeSize'),
    heightCm: heightCmRaw ? Number(heightCmRaw) : undefined,
    emergencyContactName: formValue(form, 'emergencyContactName'),
    emergencyContactPhone: formValue(form, 'emergencyContactPhone'),
    guardianName: formValue(form, 'guardianName'),
    guardianRut: formValue(form, 'guardianRut'),
    comuna: formValue(form, 'comuna'),
    direccion: formValue(form, 'direccion'),
    ocupacion: formValue(form, 'ocupacion'),
    instagram: formValue(form, 'instagram'),
    idiomas: formValue(form, 'idiomas'),
    experiencia: formValue(form, 'experiencia'),
    motivacion: formValue(form, 'motivacion'),
    causaSocial: formValue(form, 'causaSocial'),
    condicionesMedicas: formValue(form, 'condicionesMedicas'),
    aceptaRequisitos: form.get('aceptaRequisitos') === 'true',
    aceptaTratamientoDatos: form.get('aceptaTratamientoDatos') === 'true',
    aceptaBases: form.get('aceptaBases') === 'true',
    aceptaMarketing: form.get('aceptaMarketing') === 'true',
  };

  const parsed = candidateSelfRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  const photoFaceFile = form.get('photoFace');
  const photoFullBodyFile = form.get('photoFullBody');
  if (!(photoFaceFile instanceof File) || !(photoFullBodyFile instanceof File)) {
    return jsonError('Adjunta ambas fotografías: rostro y cuerpo entero', 400);
  }

  const faceCheck = await sniffAndValidatePhoto(photoFaceFile, 'rostro');
  if ('error' in faceCheck) return jsonError(faceCheck.error, 400);
  const bodyCheck = await sniffAndValidatePhoto(photoFullBodyFile, 'cuerpo entero');
  if ('error' in bodyCheck) return jsonError(bodyCheck.error, 400);

  // Certificado médico: opcional, a diferencia de las 2 fotografías de arriba.
  const medicalCertificateFile = form.get('medicalCertificate');
  let certificateCheck: { bytes: Uint8Array; mimeType: string; extension: string } | null = null;
  if (medicalCertificateFile instanceof File && medicalCertificateFile.size > 0) {
    const check = await sniffAndValidateCertificate(medicalCertificateFile);
    if ('error' in check) return jsonError(check.error, 400);
    certificateCheck = check;
  }

  // Confirma que el token resuelva a un proyecto antes de subir nada a Blob
  // — evita gastar storage en un link inválido.
  const projectExists = await prisma.project.findUnique({ where: { candidateRegistrationToken: token }, select: { companyId: true } });
  if (!projectExists) return jsonError('Link de inscripción inválido o expirado', 403);

  // Subida a Blob ANTES de la transacción de base de datos: Blob no participa
  // de una transacción de Postgres, así que el orden que evita una
  // "postulación huérfana sin fotos" es subir el archivo primero y crear la
  // fila de la candidata después, nunca al revés (ver comentario en
  // `submitCandidateRegistration`).
  const uploadedUrls: string[] = [];
  let photos: UploadedApplicationPhoto[];
  try {
    const uploadOne = async (
      file: File,
      check: { bytes: Uint8Array; mimeType: string; extension: string },
      documentType: 'PHOTO_FACE' | 'PHOTO_FULL_BODY' | 'MEDICAL_CERTIFICATE'
    ): Promise<UploadedApplicationPhoto> => {
      const uuid = crypto.randomUUID();
      const pathname = `candidate-applications/${projectExists.companyId}/${uuid}.${check.extension}`;
      const blob = await put(pathname, Buffer.from(check.bytes), {
        access: 'public',
        contentType: check.mimeType,
        addRandomSuffix: false,
      });
      uploadedUrls.push(blob.url);
      return {
        documentType,
        fileUrl: blob.url,
        mimeType: check.mimeType,
        fileSizeBytes: check.bytes.byteLength,
        sha256Hash: crypto.createHash('sha256').update(check.bytes).digest('hex'),
        // Nunca se persiste el nombre original tal cual en la ruta (Sección
        // 3: "renombra a un UUID; nunca uses el nombre original en la ruta"),
        // pero sí se guarda como metadato de trazabilidad interna.
        originalFileName: file.name.slice(0, 200),
      };
    };

    photos = [
      await uploadOne(photoFaceFile, faceCheck, 'PHOTO_FACE'),
      await uploadOne(photoFullBodyFile, bodyCheck, 'PHOTO_FULL_BODY'),
    ];
    if (certificateCheck && medicalCertificateFile instanceof File) {
      photos.push(await uploadOne(medicalCertificateFile, certificateCheck, 'MEDICAL_CERTIFICATE'));
    }
  } catch (error) {
    captureException(error, { module: 'candidates', companyId: projectExists.companyId, extra: { reason: 'photo-upload' } });
    if (uploadedUrls.length > 0) await del(uploadedUrls).catch(() => undefined);
    return jsonError('No se pudieron subir las fotografías. Intenta de nuevo.', 500);
  }

  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    const { candidate, folio } = await submitCandidateRegistration(token, parsed.data, photos, {
      ipOrigen: clientIp !== 'unknown' ? clientIp : undefined,
      userAgent,
    });

    checkRateLimit(clientIp, CANDIDATE_APPLICATION_RATE_LIMIT);

    // Fuera de la transacción a propósito (Sección 3: "un fallo de SMTP no
    // debe revertir la postulación"). Nunca debe tumbar la respuesta 200 al
    // postulante si el correo falla — se registra y se sigue. Con `after()`
    // (no un `void` suelto): Vercel puede congelar la función apenas se
    // envía la respuesta, y el correo que promete la pantalla de éxito no
    // alcanzaba a salir.
    after(async () => {
      await sendConfirmationEmails(candidate, folio, projectExists.companyId).catch((error) =>
        captureException(error, { module: 'candidates', companyId: projectExists.companyId, extra: { reason: 'confirmation-emails' } })
      );
      await emitCandidateRegisteredEvent(candidate, projectExists.companyId).catch((error) =>
        captureException(error, { module: 'candidates', companyId: projectExists.companyId, extra: { reason: 'workflow-event' } })
      );
    });

    return NextResponse.json({ success: true, data: { folio } });
  } catch (error) {
    // La candidata NUNCA se creó (la transacción de la DB falló o fue
    // rechazada antes de intentarla) — los blobs ya subidos quedarían
    // huérfanos si no se limpian acá.
    await del(uploadedUrls).catch(() => undefined);

    if (error instanceof RegistrationNotFoundError) return jsonError(error.message, 403);
    if (error instanceof RegistrationNotOpenError) return jsonError(error.message, 403);
    if (error instanceof RegistrationFullError) return jsonError(error.message, 403);
    if (error instanceof BelowMinimumAgeError) return jsonError(error.message, 403);
    if (error instanceof DuplicateApplicationError) return jsonError(error.message, 409);
    captureException(error, { module: 'candidates', companyId: projectExists.companyId });
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
