import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { sniffCertificateType, SNIFFED_CERTIFICATE_EXTENSION } from '@/lib/security/file-signature';
import { captureException } from '@/lib/observability';

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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera los 10 MB' }, { status: 413 });
    }

    // SEG-13: `file.type` lo declara el navegador de quien sube el archivo y
    // es trivial de falsificar — se confirma el formato real por los
    // primeros bytes, mismo sniffer que ya usa `candidates/document-upload`,
    // en vez de confiar en el MIME declarado como hacía esta ruta hasta ahora.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffCertificateType(bytes);
    if (!sniffed) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PDF, PNG, JPG o WEBP' }, { status: 400 });
    }

    const extension = SNIFFED_CERTIFICATE_EXTENSION[sniffed];
    const pathname = `promissory-notes/${session.companyId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const blob = await put(pathname, bytes, {
      access: 'public',
      contentType: sniffed,
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
    captureException(error, { module: 'promissory-notes' });
    return NextResponse.json({ success: false, error: 'No se pudo subir el documento' }, { status: 500 });
  }
}
