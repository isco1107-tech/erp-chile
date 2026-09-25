/**
 * Límites de subida del formulario público de postulación.
 *
 * Vercel corta cualquier request de más de ~4,5 MB antes de que llegue a la
 * ruta (responde 413 en texto plano). Dos fotos de teléfono pesan 3-6 MB
 * cada una, así que sin comprimir la postulación típica nunca llegaba. Las
 * fotos se reducen en el navegador (lado mayor 1.600 px, JPEG) y el total se
 * controla antes de enviar.
 */

/** Tope práctico del cuerpo en Vercel, con margen para los campos de texto. */
export const MAX_REQUEST_BYTES = 4_200_000;
/** Foto original aceptada antes de comprimir (una foto de teléfono moderno). */
export const MAX_ORIGINAL_PHOTO_BYTES = 25 * 1024 * 1024;
/** PDF del certificado: no se puede comprimir, así que tiene su propio tope. */
export const MAX_PDF_BYTES = 2_500_000;
/** Lado mayor de la foto comprimida y calidad JPEG. */
export const MAX_PHOTO_SIDE = 1600;
export const JPEG_QUALITY = 0.82;

/** Dimensiones de destino que conservan la proporción sin pasar de `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Reduce una foto a JPEG de lado mayor `MAX_PHOTO_SIDE`. Si el navegador no
 * puede (formato raro, sin canvas) o el resultado no pesa menos, devuelve el
 * archivo original: el servidor igual valida tipo y tamaño.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_PHOTO_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Mensaje para una respuesta que no es JSON (413 de Vercel, 502, página de error). */
export function uploadFailureMessage(status: number): string {
  if (status === 413) return 'Los archivos adjuntos son demasiado pesados. Si subiste un certificado en PDF, prueba con una foto del documento o quítalo.';
  if (status === 429) return 'Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo.';
  return 'No se pudo enviar tu postulación. Intenta de nuevo en unos minutos — tus datos siguen aquí.';
}
