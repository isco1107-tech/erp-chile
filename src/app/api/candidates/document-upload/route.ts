import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

/**
 * Sube el archivo de un documento/contrato de imagen de candidata a Vercel
 * Blob. Va en un Route Handler (no Server Action) por el límite de 1 MB de
 * cuerpo de las Server Actions — mismo patrón que `candidates/photo-upload`.
 * Solo sube el archivo y devuelve la URL; guardar el `CandidateDocument` es
 * responsabilidad de `addDocumentAction`, para que la validación Zod del
 * resto de los campos (título, fechas) corra en un solo lugar.
 */

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('candidates:write');

    const form = await req.formData();
    const candidateId = String(form.get('candidateId') ?? '');
    const file = form.get('file');

    if (!candidateId) {
      return NextResponse.json({ success: false, error: 'Falta el identificador de la candidata' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PDF, PNG o JPG' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera los 10 MB' }, { status: 413 });
    }

    const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId: session.companyId } });
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidata no encontrada' }, { status: 404 });
    }

    const extension = EXTENSION_BY_TYPE[file.type];
    const pathname = `candidates/${session.companyId}/documents/${candidateId}-${Date.now()}.${extension}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Candidate document upload failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo subir el documento' }, { status: 500 });
  }
}
