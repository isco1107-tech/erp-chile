/**
 * Reduce una foto antes de guardarla y enviarla. Una foto de cámara pesa 3–8 MB;
 * a 1024 px de lado mayor pesa ~150 KB, que es lo que la IA necesita para leer
 * una etiqueta y lo que aguanta una señal débil de bodega.
 *
 * Solo navegador.
 */

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export const PHOTO_SIDE = 1024;
export const PHOTO_QUALITY = 0.8;

function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto'))), 'image/jpeg', quality);
  });
}

function drawTo(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxSide: number): HTMLCanvasElement {
  const size = fitWithin(sourceWidth, sourceHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la foto');
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

/** Foto ya tomada (archivo de la cámara del teléfono). Respeta la orientación EXIF. */
export async function prepareFromFile(file: Blob, maxSide = PHOTO_SIDE, quality = PHOTO_QUALITY): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const canvas = drawTo(bitmap, bitmap.width, bitmap.height, maxSide);
    return { blob: await canvasToJpeg(canvas, quality), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

/** Fotograma actual del video de la cámara en vivo. */
export async function prepareFromVideo(video: HTMLVideoElement, maxSide = PHOTO_SIDE, quality = PHOTO_QUALITY): Promise<PreparedPhoto> {
  if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error('La cámara todavía no está lista');
  const canvas = drawTo(video, video.videoWidth, video.videoHeight, maxSide);
  return { blob: await canvasToJpeg(canvas, quality), width: canvas.width, height: canvas.height };
}
