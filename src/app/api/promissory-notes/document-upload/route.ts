import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';

/**
 * Sube el pagaré firmado (foto o PDF) a Cloudflare R2. Va en un Route Handler,
 * no en una Server Action, por el límite de 1 MB de cuerpo de las Server
 * Actions — mismo motivo que `candidates/photo-upload`.
 *
 * Solo sube el archivo y devuelve la URL; persistir `documentUrl` en el
 * `PromissoryNote` es responsabilidad de `createPromissoryNoteAction` /
 * `updatePromissoryNoteAction`, para que la validación Zod del resto de los
 * campos corra en un solo lugar — mismo patrón que
 * `candidates/document-upload`, necesario acá porque en la creación de un
 * pagaré todavía no existe un `id` contra el cual validar pertenencia.
 */

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PDF, PNG, JPG o WEBP' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera los 10 MB' }, { status: 413 });
    }

    const extension = EXTENSION_BY_TYPE[file.type];
    const pathname = `promissory-notes/${session.companyId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

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
    console.error('Promissory note document upload failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo subir el documento' }, { status: 500 });
  }
}
