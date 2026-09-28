import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { del, put } from '@/lib/storage/blob';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { SNIFFED_IMAGE_EXTENSION, sniffImageType } from '@/lib/security/file-signature';
import { MAX_ASSET_BYTES, WebSiteError, assertCanAddAsset, registerAsset } from '@/modules/web-sites/services/web-sites.service';

/**
 * Sube una imagen a la biblioteca de un sitio. Route Handler y no Server
 * Action por el límite de 1 MB de cuerpo de estas. El tipo se valida por los
 * primeros bytes (JPG, PNG o WEBP), nunca por lo que declara el navegador: se
 * excluyen SVG y GIF a propósito (el SVG puede llevar scripts). La ruta del
 * archivo lleva empresa y sitio; el sitio se comprueba contra la empresa de la sesión.
 */
export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const form = await req.formData();
    const siteId = String(form.get('siteId') ?? '');
    const file = form.get('file');
    const alt = String(form.get('alt') ?? '').slice(0, 160);
    if (!siteId) return NextResponse.json({ success: false, error: 'Falta el sitio' }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    if (file.size > MAX_ASSET_BYTES) return NextResponse.json({ success: false, error: `La imagen supera los ${MAX_ASSET_BYTES / (1024 * 1024)} MB. Comprímela e intenta de nuevo.` }, { status: 413 });

    await assertCanAddAsset(session.companyId, siteId, file.size);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return NextResponse.json({ success: false, error: 'La imagen debe ser JPG, PNG o WEBP' }, { status: 400 });

    const blob = await put(`web-sites/${session.companyId}/${siteId}/${crypto.randomUUID()}.${SNIFFED_IMAGE_EXTENSION[type]}`, Buffer.from(bytes), {
      access: 'public',
      contentType: type,
      addRandomSuffix: false,
    });
    try {
      const asset = await registerAsset(session.companyId, siteId, { url: blob.url, fileName: file.name || 'imagen', mimeType: type, sizeBytes: file.size, alt });
      return NextResponse.json({ success: true, data: asset });
    } catch (error) {
      // Si no se pudo registrar, el archivo subido quedaría huérfano y sin dueño.
      await del(blob.url).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: 403 });
    if (error instanceof WebSiteError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    captureException(error, { module: 'sitios-web', companyId, extra: { reason: 'asset-upload' } });
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen. Intenta de nuevo.' }, { status: 500 });
  }
}
