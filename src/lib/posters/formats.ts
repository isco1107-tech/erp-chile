/**
 * Formatos de salida del motor de afiches. Todo el diseño se escala con
 * `unit` (1 = un lado corto de 1080 px), así que un formato nuevo solo
 * necesita su tamaño y su orientación.
 */

export const POSTER_FORMATS = ['feed', 'story', 'square', 'landscape', 'print'] as const;
export type PosterFormat = (typeof POSTER_FORMATS)[number];

export type PosterOrientation = 'portrait' | 'square' | 'landscape';

export interface PosterFormatSpec {
  width: number;
  height: number;
  label: string;
  hint: string;
  orientation: PosterOrientation;
  /** El QR viene encendido por defecto donde alguien lo puede escanear con otro teléfono: pantalla e impresión. */
  qrByDefault: boolean;
}

export const POSTER_FORMAT_SPECS: Record<PosterFormat, PosterFormatSpec> = {
  feed: { width: 1080, height: 1350, label: 'Feed', hint: '4:5 · publicación de Instagram', orientation: 'portrait', qrByDefault: false },
  story: { width: 1080, height: 1920, label: 'Story', hint: '9:16 · historia o reel', orientation: 'portrait', qrByDefault: false },
  square: { width: 1080, height: 1080, label: 'Cuadrado', hint: '1:1 · feed o WhatsApp', orientation: 'square', qrByDefault: false },
  landscape: { width: 1920, height: 1080, label: 'Horizontal', hint: '16:9 · pantalla LED, Facebook, YouTube', orientation: 'landscape', qrByDefault: true },
  print: { width: 1654, height: 2339, label: 'Impresión A4', hint: 'A4 a 200 ppp · para imprimir', orientation: 'portrait', qrByDefault: true },
};

export function isPosterFormat(value: string | null | undefined): value is PosterFormat {
  return (POSTER_FORMATS as readonly string[]).includes(value ?? '');
}

/** Escala del diseño: 1 en los formatos de 1080 px de lado corto. */
export function posterUnit(format: PosterFormat): number {
  const { width, height } = POSTER_FORMAT_SPECS[format];
  return Math.min(width, height) / 1080;
}
