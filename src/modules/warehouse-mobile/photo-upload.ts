import { put } from '@/lib/storage/blob';
import { sniffImageType } from '@/lib/security/file-signature';
import { fail, ok } from './http';
import { MAX_PHOTO_BYTES } from './photo';
import { clientOpIdSchema } from './schema';
import { InvalidImageError, prepareJpeg } from './services/image.service';

/**
 * Subida de una foto desde el celular, común a la foto de un producto nuevo y a
 * la foto de respaldo de una salida. Quien llama ya validó sesión y permiso.
 *
 * El nombre del archivo sale de la clave de la operación y se sobrescribe: si el
 * celular reintenta la subida (cola sin señal), reemplaza el mismo archivo y no
 * deja copias huérfanas. Siempre se vuelve a codificar: descarta el EXIF (la
 * ubicación GPS de la bodega no debe quedar en la foto) y acota el tamaño.
 */
export async function receivePhoto(req: Request, folder: string): Promise<Response> {
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
    const blob = await put(`${folder}/bodega-${opId.data}.jpg`, jpeg, {
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
}
