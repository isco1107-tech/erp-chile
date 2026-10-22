import sharp from 'sharp';

/**
 * Fotos que llegan del celular: se reducen y se vuelven a codificar en el
 * servidor. El celular ya las achica, pero no se confía en eso: una foto
 * gigante gastaría memoria y tokens, y re-codificar descarta los metadatos EXIF
 * (la ubicación GPS de la bodega no debe quedar guardada en la foto del producto).
 */

/** Lado mayor de lo que se manda a la IA y se guarda como foto del producto. */
export const PHOTO_MAX_SIDE = 1280;

/** Tope de píxeles de entrada (una foto de 48 MP son ~48 M): protege la memoria. */
const MAX_INPUT_PIXELS = 60_000_000;

export class InvalidImageError extends Error {
  constructor() {
    super('La imagen no se pudo leer. Vuelve a sacar la foto.');
  }
}

export async function prepareJpeg(bytes: Uint8Array): Promise<Buffer> {
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new InvalidImageError();
  }
}
