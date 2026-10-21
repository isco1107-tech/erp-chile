import { NextResponse } from 'next/server';
import { AuthError, requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import {
  createProductPhotoDraft,
  isProductPhotoScanConfigured,
  MAX_PRODUCT_PHOTOS,
  NOT_CONFIGURED_MESSAGE,
  PRODUCT_PHOTO_COMPANY_RATE_LIMIT,
  PRODUCT_PHOTO_USER_RATE_LIMIT,
  ProductPhotoError,
  validateProductPhotos,
} from '@/modules/import/services/product-photo.service';

/**
 * Alta rápida de producto por foto: recibe de 1 a 3 fotos del producto o de su
 * etiqueta y devuelve un BORRADOR para revisar. No guarda nada: crear el
 * producto es `confirmProductFromPhotoAction`, después de que una persona
 * corrigió y aprobó los datos.
 *
 * Route Handler y no Server Action por el límite de 1 MB de cuerpo de estas
 * (mismo motivo que `/api/import` y `/api/products/image-upload`).
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    // El permiso de crear productos: el borrador existe solo para dar de alta uno.
    const session = await requireAuthWithPermission('products:write');
    companyId = session.companyId;

    // Sin clave de Gemini se responde claro y antes de leer las fotos ni gastar cupo.
    if (!isProductPhotoScanConfigured()) {
      return NextResponse.json({ success: false, error: NOT_CONFIGURED_MESSAGE, code: 'NOT_CONFIGURED' }, { status: 503 });
    }

    const byUser = checkRateLimit(session.id, PRODUCT_PHOTO_USER_RATE_LIMIT);
    const byCompany = byUser.allowed ? checkRateLimit(session.companyId, PRODUCT_PHOTO_COMPANY_RATE_LIMIT) : byUser;
    if (!byUser.allowed || !byCompany.allowed) {
      const retryAt = byCompany.retryAfterMs ?? Date.now() + 60_000;
      const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
      return NextResponse.json(
        { success: false, error: 'Hiciste muchas lecturas seguidas. Espera un momento e inténtalo de nuevo.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const form = await req.formData();
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (files.length > MAX_PRODUCT_PHOTOS) {
      return NextResponse.json({ success: false, error: `Máximo ${MAX_PRODUCT_PHOTOS} fotos por producto` }, { status: 400 });
    }
    const photos = validateProductPhotos(
      await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
    );

    const draft = await createProductPhotoDraft(session.companyId, photos);
    return NextResponse.json({ success: true, data: draft });
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: error instanceof AuthError ? error.status : 403 });
    if (error instanceof ProductPhotoError) {
      const status = error.code === 'INVALID_IMAGE' ? 400 : error.code === 'NOT_CONFIGURED' ? 503 : 502;
      if (error.code === 'MODEL_FAILED') captureException(error, { module: 'importacion', companyId, extra: { reason: 'product-photo-model' } });
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    captureException(error, { module: 'importacion', companyId, extra: { reason: 'product-photo' } });
    return NextResponse.json({ success: false, error: 'No se pudo leer la foto. Intenta de nuevo o crea el producto a mano.' }, { status: 500 });
  }
}
