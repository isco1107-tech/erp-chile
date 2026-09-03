/**
 * Extrae hasta 3 colores "vívidos" de un logo directamente en el navegador
 * (Canvas 2D), sin subir nada al servidor ni depender de una librería de
 * procesamiento de imágenes (el proyecto no trae `sharp` como dependencia
 * directa). Se usa antes de subir el logo, para acompañar la subida con la
 * paleta que va a personalizar el panel (`deriveThemeFromPalette`).
 *
 * Descarta píxeles transparentes y píxeles cuasi blancos/negros/grises (fondo
 * y trazos de un logo típico). El ganador NO se elige por conteo puro: un
 * fondo casi-blanco que se cuela por el borde del filtro de neutros (blanco
 * cálido, poca saturación) suele tener muchísimos más píxeles que el detalle
 * de color real del logo, así que el ranking pondera saturación además de
 * frecuencia — si no, "gana" el casi-blanco y la paleta detectada termina
 * siendo, en la práctica, blanco.
 */

const SAMPLE_SIZE = 32;
const QUANTIZE_STEP = 24;
const MIN_QUALIFYING_PIXELS = 6;
const MAX_COLORS = 3;
/** Distancia mínima en RGB (0-441 posible) entre colores de la paleta, para no devolver 3 variantes del mismo tono. */
const MIN_COLOR_DISTANCE = 60;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

function isNearNeutral(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 235 && min > 200) return true; // cuasi blanco
  if (max < 24) return true; // cuasi negro
  return max - min < 18; // baja saturación (gris)
}

function saturationOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 100;
}

function colorDistance(a: Bucket, b: Bucket): number {
  const ar = a.r / a.count;
  const ag = a.g / a.count;
  const ab = a.b / a.count;
  const br = b.r / b.count;
  const bg = b.g / b.count;
  const bb = b.b / b.count;
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function bucketToHex(bucket: Bucket): string {
  const r = Math.round(bucket.r / bucket.count);
  const g = Math.round(bucket.g / bucket.count);
  const b = Math.round(bucket.b / bucket.count);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export async function extractBrandPalette(file: File): Promise<string[]> {
  if (typeof document === 'undefined') return [];

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen'));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const buckets = new Map<string, Bucket>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      if (isNearNeutral(r, g, b)) continue;

      const key = `${Math.round(r / QUANTIZE_STEP)},${Math.round(g / QUANTIZE_STEP)},${Math.round(b / QUANTIZE_STEP)}`;
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }

    const totalQualifying = [...buckets.values()].reduce((sum, b) => sum + b.count, 0);
    if (totalQualifying < MIN_QUALIFYING_PIXELS) return [];

    // Rankear por vivacidad, no por conteo puro: un bucket minoritario pero
    // saturado le gana a un casi-blanco mayoritario que se coló por el borde
    // del filtro de neutros.
    const ranked = [...buckets.values()].sort((a, b) => {
      const scoreA = a.count * (0.3 + 0.7 * (saturationOf(a.r / a.count, a.g / a.count, a.b / a.count) / 100));
      const scoreB = b.count * (0.3 + 0.7 * (saturationOf(b.r / b.count, b.g / b.count, b.b / b.count) / 100));
      return scoreB - scoreA;
    });

    const chosen: Bucket[] = [];
    for (const candidate of ranked) {
      if (chosen.length >= MAX_COLORS) break;
      const tooClose = chosen.some((c) => colorDistance(c, candidate) < MIN_COLOR_DISTANCE);
      if (tooClose) continue;
      chosen.push(candidate);
    }

    return chosen.map(bucketToHex);
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
