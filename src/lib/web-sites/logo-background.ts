/**
 * Quita el fondo liso de un logo (el típico JPG con fondo blanco o de un color
 * parejo) y lo deja listo para guardarse como PNG transparente.
 *
 * Es puro: trabaja sobre los píxeles RGBA de un `<canvas>` (`ImageData.data`),
 * así se prueba sin navegador. El editor (`LogoBackgroundTool`) lo corre en el
 * navegador con vista previa en vivo y sube el resultado por el mismo camino
 * que cualquier imagen de la biblioteca.
 *
 * Cómo decide:
 * 1. El color de fondo es el que domina en el borde de la imagen. Si el borde
 *    ya es transparente, el logo ya está listo (`already-transparent`).
 * 2. Es fondo todo píxel que se parece a ese color (distancia por canal ≤ un
 *    umbral que sube con la intensidad) y que toca el borde por un camino de
 *    píxeles parecidos. Con `holes`, también los encerrados (el blanco dentro
 *    de una «O»); sin él, un texto blanco sobre un círculo rojo queda intacto.
 * 3. El contorno del logo (la primera fila de píxeles junto al fondo) se
 *    «desmezcla» del fondo: queda semitransparente con su color real, así no
 *    deja un halo blanco sobre una tarjeta oscura.
 * 4. Se recortan los márgenes vacíos (con un respiro mínimo) para que el logo
 *    ocupe su espacio en la tarjeta.
 */

export type Rgb = readonly [number, number, number];

export interface LogoBackgroundOptions {
  /** 0–100: cuánto puede alejarse un color del fondo y seguir contando como fondo. */
  strength: number;
  /** Quitar también el fondo encerrado (dentro de letras como la «O»), no solo el que toca los bordes. */
  holes: boolean;
}

export const DEFAULT_LOGO_BACKGROUND: LogoBackgroundOptions = { strength: 25, holes: false };

export type LogoBackgroundStatus =
  /** Se quitó el fondo. */
  | 'ok'
  /** El borde ya es transparente: no hay nada que quitar. */
  | 'already-transparent'
  /** No se encontró un fondo parejo que quitar (¿una foto?). */
  | 'nothing-removed'
  /** Con esta intensidad se borra el logo entero. */
  | 'nothing-left';

export interface LogoBackgroundResult {
  status: LogoBackgroundStatus;
  /** Píxeles RGBA del resultado (recortado). Con un estado distinto de `ok`, los originales. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Color de fondo detectado (`null` si el borde ya era transparente o la imagen está vacía). */
  background: Rgb | null;
  /** El borde no es de un solo color: puede que se haya llevado partes del logo o dejado restos. */
  uneven: boolean;
  /** Fracción de la imagen que pasó a transparente (0–1). */
  removed: number;
}

/** Bajo este alfa un píxel ya cuenta como transparente. */
const TRANSPARENT_ALPHA = 16;
/** Un borde con al menos esta fracción de píxeles transparentes es un logo que ya viene sin fondo. */
const TRANSPARENT_BORDER_SHARE = 0.5;
/** Si el color dominante cubre menos que esto del borde, el fondo no es parejo. */
const EVEN_BORDER_SHARE = 0.6;
/** Cercanía (por canal) para agrupar el borde alrededor del color dominante. */
const BORDER_CLUSTER = 24;

/** Umbral de distancia por canal (0–255) que corresponde a una intensidad 0–100. */
export function strengthThreshold(strength: number): number {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(strength) ? strength : DEFAULT_LOGO_BACKGROUND.strength));
  return Math.round(6 + clamped * 1.3);
}

function distance(data: Uint8ClampedArray, offset: number, color: Rgb): number {
  return Math.max(Math.abs(data[offset]! - color[0]), Math.abs(data[offset + 1]! - color[1]), Math.abs(data[offset + 2]! - color[2]));
}

/** Índices (de píxel) del contorno de la imagen, sin repetir las esquinas. */
function borderPixels(width: number, height: number): number[] {
  const indices: number[] = [];
  for (let x = 0; x < width; x++) {
    indices.push(x);
    if (height > 1) indices.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    indices.push(y * width);
    if (width > 1) indices.push(y * width + width - 1);
  }
  return indices;
}

/** Color que domina el borde, cuánto del borde cubre y cuánto del borde ya es transparente. */
export function detectBackground(data: Uint8ClampedArray, width: number, height: number): { color: Rgb | null; share: number; transparentShare: number } {
  const border = borderPixels(width, height);
  if (border.length === 0) return { color: null, share: 0, transparentShare: 0 };
  const opaque: number[] = [];
  for (const index of border) if (data[index * 4 + 3]! >= TRANSPARENT_ALPHA) opaque.push(index);
  const transparentShare = 1 - opaque.length / border.length;
  if (opaque.length === 0) return { color: null, share: 0, transparentShare };

  // Moda gruesa (16 niveles por canal) y luego el promedio de lo que está cerca de ella.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const index of opaque) {
    const o = index * 4;
    const key = ((data[o]! >> 4) << 8) | ((data[o + 1]! >> 4) << 4) | (data[o + 2]! >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += data[o]!;
    bucket.g += data[o + 1]!;
    bucket.b += data[o + 2]!;
    buckets.set(key, bucket);
  }
  let best = { count: 0, r: 0, g: 0, b: 0 };
  for (const bucket of buckets.values()) if (bucket.count > best.count) best = bucket;
  const seed: Rgb = [best.r / best.count, best.g / best.count, best.b / best.count];

  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of opaque) {
    const o = index * 4;
    if (distance(data, o, seed) > BORDER_CLUSTER) continue;
    count++;
    r += data[o]!;
    g += data[o + 1]!;
    b += data[o + 2]!;
  }
  const color: Rgb = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  return { color, share: count / opaque.length, transparentShare };
}

/**
 * Separa un píxel del fondo (como «color a alfa»): la menor opacidad con la que
 * un color real, pintado sobre el fondo, da el color visto. Devuelve el alfa
 * (0–1) y deja el color real en `out`.
 */
function unmix(data: Uint8ClampedArray, offset: number, background: Rgb, out: number[]): number {
  let alpha = 0;
  for (let channel = 0; channel < 3; channel++) {
    const seen = data[offset + channel]!;
    const bg = background[channel]!;
    const a = seen > bg ? (bg < 255 ? (seen - bg) / (255 - bg) : 0) : seen < bg ? (bg > 0 ? (bg - seen) / bg : 0) : 0;
    if (a > alpha) alpha = a;
  }
  alpha = Math.min(1, alpha);
  for (let channel = 0; channel < 3; channel++) {
    const bg = background[channel]!;
    out[channel] = alpha > 0 ? Math.round(Math.min(255, Math.max(0, (data[offset + channel]! - bg) / alpha + bg))) : bg;
  }
  return alpha;
}

function unchanged(status: LogoBackgroundStatus, data: Uint8ClampedArray, width: number, height: number, background: Rgb | null, uneven: boolean): LogoBackgroundResult {
  return { status, data, width, height, background, uneven, removed: 0 };
}

export function removeLogoBackground(source: Uint8ClampedArray, width: number, height: number, options: LogoBackgroundOptions = DEFAULT_LOGO_BACKGROUND): LogoBackgroundResult {
  const total = width * height;
  if (width <= 0 || height <= 0 || source.length < total * 4) return unchanged('nothing-left', source, Math.max(0, width), Math.max(0, height), null, false);

  const detected = detectBackground(source, width, height);
  if (detected.transparentShare >= TRANSPARENT_BORDER_SHARE || !detected.color) return unchanged('already-transparent', source, width, height, null, false);
  const background = detected.color;
  const uneven = detected.share < EVEN_BORDER_SHARE;
  const threshold = strengthThreshold(options.strength);

  // 1 = fondo. Un píxel que ya era transparente también cuenta como fondo.
  const isNear = (index: number) => source[index * 4 + 3]! < TRANSPARENT_ALPHA || distance(source, index * 4, background) <= threshold;
  const mask = new Uint8Array(total);
  if (options.holes) {
    for (let index = 0; index < total; index++) if (isNear(index)) mask[index] = 1;
  } else {
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    for (const index of borderPixels(width, height)) {
      if (mask[index] || !isNear(index)) continue;
      mask[index] = 1;
      queue[tail++] = index;
    }
    const visit = (next: number) => {
      if (mask[next] || !isNear(next)) return;
      mask[next] = 1;
      queue[tail++] = next;
    };
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index + width < total) visit(index + width);
    }
  }

  let removedCount = 0;
  for (let index = 0; index < total; index++) removedCount += mask[index]!;
  const removed = removedCount / total;
  if (removedCount === 0 || removed < 0.01) return unchanged('nothing-removed', source, width, height, background, uneven);
  if (removedCount === total) return { ...unchanged('nothing-left', source, width, height, background, uneven), removed };

  const data = new Uint8ClampedArray(source);
  const color = [0, 0, 0];
  for (let index = 0; index < total; index++) {
    const o = index * 4;
    if (mask[index]) {
      data[o + 3] = 0;
      continue;
    }
    // Contorno: toca el fondo (8 vecinos). Se desmezcla para no dejar halo.
    const x = index % width;
    const y = (index - x) / width;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) {
          edge = true;
          break;
        }
      }
    }
    if (!edge) continue;
    const alpha = unmix(source, o, background, color);
    data[o] = color[0]!;
    data[o + 1] = color[1]!;
    data[o + 2] = color[2]!;
    data[o + 3] = Math.round(alpha * source[o + 3]!);
  }

  // Recorte de los márgenes vacíos, con un respiro del 2% (mínimo 2 px).
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let visible = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! <= 10) continue;
      visible++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0 || visible < total * 0.002) return { ...unchanged('nothing-left', source, width, height, background, uneven), removed };
  const pad = Math.max(2, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.02));
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const cropped = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y++) {
    const from = ((top + y) * width + left) * 4;
    cropped.set(data.subarray(from, from + cropWidth * 4), y * cropWidth * 4);
  }
  return { status: 'ok', data: cropped, width: cropWidth, height: cropHeight, background, uneven, removed };
}

/** Lado más largo con que se procesa un logo: se muestra a lo más a ~220 px, así que 1200 sobra y el PNG queda liviano. */
export const LOGO_PROCESS_MAX_SIDE = 1200;

/** Tamaño de trabajo de una imagen: igual o achicada para que su lado más largo no pase de `maxSide`. */
export function processingSize(width: number, height: number, maxSide = LOGO_PROCESS_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Nombre del PNG que queda en la biblioteca: el del original con «-sin-fondo». */
export function transparentLogoFileName(original: string): string {
  const base = (original.split('/').pop() ?? '').replace(/\?.*$/, '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  const safe = base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${safe || 'logo'}-sin-fondo.png`;
}
