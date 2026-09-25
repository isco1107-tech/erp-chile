import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { SNIFFED_IMAGE_EXTENSION, sniffImageType } from '@/lib/security/file-signature';

/**
 * Sube la foto de un producto (catálogo, POS y etiquetas). Route Handler y no
 * Server Action por el límite de 1 MB de cuerpo de estas. El tipo se valida
 * por los primeros bytes del archivo, no por lo que declara el navegador.
 * Devuelve la URL; el producto la guarda al grabarse el formulario.
 */

const MAX_FILE_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:write');
    companyId = session.companyId;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'La imagen supera los 3 MB' }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return NextResponse.json({ success: false, error: 'La foto debe ser JPG, PNG o WEBP' }, { status: 400 });

    const blob = await put(`products/${session.companyId}/${crypto.randomUUID()}.${SNIFFED_IMAGE_EXTENSION[type]}`, Buffer.from(bytes), {
      access: 'public',
      contentType: type,
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: 403 });
    captureException(error, { module: 'inventario', companyId, extra: { reason: 'product-image-upload' } });
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen. Intenta de nuevo.' }, { status: 500 });
  }
}
