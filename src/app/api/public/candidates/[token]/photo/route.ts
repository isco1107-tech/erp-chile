import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { put } from '@/lib/storage/blob';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, CANDIDATE_PHOTO_UPLOAD_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { sniffImageType, SNIFFED_IMAGE_EXTENSION } from '@/lib/security/file-signature';
import { applicationPhotoPrefix } from '@/lib/events/registration-requirements';
import { captureException } from '@/lib/observability';

/**
 * Foto de la postulante, subida desde el formulario público de inscripción
 * cuando el certamen la exige. Sin sesión: la empresa y el certamen salen del
 * token del link, nunca del cuerpo. El tipo se valida por los primeros bytes
 * del archivo (no por lo que declara el navegador) y la subida solo funciona
 * si la convocatoria pide foto. El archivo queda en
 * `candidates/{companyId}/applications/`, y el envío del formulario solo acepta
 * URLs de esa carpeta (`submitCandidateRegistration`).
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ success: false, error: message }, { status, headers });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, CANDIDATE_PHOTO_UPLOAD_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 3600;
    return jsonError('Demasiadas fotos subidas desde esta conexión. Intenta de nuevo más tarde.', 429, { 'Retry-After': String(retryAfter) });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { candidateRegistrationToken: token },
      select: { companyId: true, registrationStatus: true, requireCandidatePhoto: true },
    });
    if (!project) return jsonError('Link de inscripción inválido o expirado', 403);
    if (project.registrationStatus !== 'OPEN') return jsonError('Esta convocatoria no está recibiendo postulaciones por el momento.', 403);
    if (!project.requireCandidatePhoto) return jsonError('Este certamen no pide foto en la inscripción.', 400);

    const contentLength = Number(req.headers.get('content-length') ?? NaN);
    // Un poco de holgura sobre el tope por el envoltorio multipart.
    if (!Number.isFinite(contentLength) || contentLength > MAX_FILE_BYTES + 64 * 1024) return jsonError('La foto supera los 5 MB', 413);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('Adjunta una foto', 400);
    if (file.size === 0) return jsonError('El archivo está vacío', 400);
    if (file.size > MAX_FILE_BYTES) return jsonError('La foto supera los 5 MB', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return jsonError('La foto debe ser JPG, PNG o WEBP', 400);

    const pathname = `${applicationPhotoPrefix(project.companyId)}${Date.now()}-${crypto.randomUUID()}.${SNIFFED_IMAGE_EXTENSION[sniffed]}`;
    const blob = await put(pathname, new Blob([bytes], { type: sniffed }), { access: 'public', contentType: sniffed, addRandomSuffix: false });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    captureException(error, { module: 'candidates', extra: { reason: 'public-photo-upload' } });
    return jsonError('No se pudo subir la foto. Intenta de nuevo.', 500);
  }
}
