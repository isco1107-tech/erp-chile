import { put } from '@/lib/storage/blob';
import { sniffImageType } from '@/lib/security/file-signature';
import { WAREHOUSE_PHOTO_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { fail, ok, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { MAX_PHOTO_BYTES } from '@/modules/warehouse-mobile/photo';
import { clientOpIdSchema } from '@/modules/warehouse-mobile/schema';
import { InvalidImageError, prepareJpeg } from '@/modules/warehouse-mobile/services/image.service';

/**
 * Sube la foto con la que se da de alta un producto nuevo desde el celular.
 *
 * El nombre del archivo sale de la clave de la operación y se sobrescribe: si el
 * celular reintenta la subida (cola sin señal), reemplaza el mismo archivo y no
 * deja copias huérfanas. La prefijo `products/{companyId}/` es el mismo de las
 * fotos del catálogo, y el alta la exige al guardar el producto.
 */
export async function POST(req: Request) {
  return withBodegaAuth({ permission: 'products:write', limit: WAREHOUSE_PHOTO_RATE_LIMIT }, async (context) => {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES + 50_000) return fail('La foto es demasiado grande', 413);

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const opId = clientOpIdSchema.safeParse(form?.get('clientOpId'));
    if (!(file instanceof File) || file.size === 0) return fail('Adjunta una foto', 400);
    if (!opId.success) return fail('Falta la clave de la operación', 400);
    if (file.size > MAX_PHOTO_BYTES) return fail('La foto es demasiado grande', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImageType(bytes)) return fail('La foto debe ser JPG, PNG o WEBP', 400);

    try {
      const jpeg = await prepareJpeg(bytes);
      const blob = await put(`products/${context.companyId}/bodega-${opId.data}.jpg`, jpeg, {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return ok({ url: blob.url });
    } catch (error) {
      if (error instanceof InvalidImageError) return fail(error.message, 400);
      throw error;
    }
  });
}
