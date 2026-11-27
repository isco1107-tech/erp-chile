import 'server-only';
import sharp from 'sharp';
import { captureException } from '@/lib/observability';
import { sniffImageType } from '@/lib/security/file-signature';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { extractPalette, type PageantPalette } from './pageant-palette';

/**
 * Los tres colores de la portada, leídos en el servidor. El navegador no puede
 * hacerlo por sí solo para una imagen ya subida (el almacenamiento es de otro
 * origen y sin CORS el `<canvas>` queda bloqueado), y hacerlo acá deja un solo
 * camino para la subida y para «Detectar desde la portada».
 *
 * La imagen se reduce a unos miles de píxeles antes de analizarla: es
 * suficiente para saber qué colores tiene y no depende de lo pesada que sea.
 */

/** Lado mayor del muestreo. */
const SAMPLE_SIZE = 96;
/** Igual que la subida de portadas (6 MB). */
const MAX_BYTES = 6 * 1024 * 1024;

/** Paleta de los bytes de una imagen JPG, PNG o WEBP; `null` si no hay píxeles visibles o no se pudo leer. */
export async function paletteFromImageBytes(bytes: Uint8Array): Promise<PageantPalette | null> {
  try {
    const { data } = await sharp(bytes, { failOn: 'none' })
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return extractPalette(data);
  } catch (error) {
    // Una portada que se subió bien pero no se puede analizar no debe frenar nada: sin paleta, el sitio sigue con su acento.
    captureException(error, { module: 'projects', extra: { reason: 'palette-from-image' } });
    return null;
  }
}

/**
 * Paleta de una imagen que ya está en NUESTRO almacenamiento (el servidor
 * nunca descarga direcciones arbitrarias ni sigue redirecciones). Quien llama
 * verifica además que la imagen sea de la empresa de la sesión.
 */
export async function paletteFromStoredImage(url: string): Promise<PageantPalette | null> {
  if (!isAllowedBlobUrl(url)) return null;
  try {
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES || !sniffImageType(bytes)) return null;
    return paletteFromImageBytes(bytes);
  } catch (error) {
    captureException(error, { module: 'projects', extra: { reason: 'palette-from-stored-image' } });
    return null;
  }
}
