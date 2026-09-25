/**
 * Cronología del video de fondo del login, como funciones puras (se prueban
 * sin DOM). El "video" son las dos secuencias de fotogramas de la landing,
 * una tras otra: v1 (cielo de Atacama → galaxia) y v2 (el logo se arma y
 * termina en la imagen "AETHER · ERP SOLUTIONS" sobre fondo claro). Se
 * reproduce cada vez que se abre el login, de fondo, y se queda fijo en el
 * último fotograma de v2.
 */

export type VideoClip = 0 | 1;

export interface VideoFrame {
  clip: VideoClip;
  /** Índice dentro del clip (0 = primer fotograma). */
  index: number;
}

/**
 * Tras cuánto tiempo esperando un fotograma que no llega se salta directo al
 * final (si el último ya está listo): con una conexión lenta es mejor mostrar
 * la imagen final que dejar el fondo congelado a mitad del video.
 */
export const STALL_JUMP_MS = 12000;
/** Descargas simultáneas: en orden, para que lo primero en verse llegue primero. */
export const LOAD_CONCURRENCY = 6;

/** Índices de un clip con un `stride` (el último siempre entra). */
export function strideIndices(count: number, stride: number): number[] {
  if (count <= 0) return [];
  const step = Math.max(1, Math.floor(stride));
  const indices: number[] = [];
  for (let index = 0; index < count; index += step) indices.push(index);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
  return indices;
}

/** Fotogramas de v1 seguidos de los de v2, en orden de reproducción. */
export function videoFrames(counts: readonly [number, number], stride: number): VideoFrame[] {
  return [
    ...strideIndices(counts[0], stride).map((index) => ({ clip: 0 as const, index })),
    ...strideIndices(counts[1], stride).map((index) => ({ clip: 1 as const, index })),
  ];
}

/**
 * Posición (0 a `total - 1`) para un tiempo de reproducción. `fps` es el del
 * set original: con `stride` 3 cada fotograma dura tres cuadros, así el video
 * dura lo mismo en modo liviano.
 */
export function positionAt(playedMs: number, fps: number, stride: number, total: number): number {
  if (total <= 0) return 0;
  const perFrameMs = (1000 / fps) * Math.max(1, Math.floor(stride));
  // El épsilon evita que 1000 / (1000 / 6) caiga en 5,999… por redondeo binario.
  return Math.min(total - 1, Math.max(0, Math.floor(playedMs / perFrameMs + 1e-9)));
}

/**
 * Orden de descarga: primero el primer fotograma (lo primero que se ve) y el
 * último (la imagen final, por si hay que saltar a ella), después el resto en
 * orden de reproducción.
 */
export function loadOrder(total: number): number[] {
  if (total <= 0) return [];
  if (total === 1) return [0];
  const order = [0, total - 1];
  for (let position = 1; position < total - 1; position += 1) order.push(position);
  return order;
}

export interface CoverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dónde dibujar un fotograma para cubrir el lienzo como `object-fit: cover`, centrado. */
export function coverRect(frameWidth: number, frameHeight: number, canvasWidth: number, canvasHeight: number): CoverRect {
  const scale = Math.max(canvasWidth / frameWidth, canvasHeight / frameHeight);
  const width = frameWidth * scale;
  const height = frameHeight * scale;
  return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}
