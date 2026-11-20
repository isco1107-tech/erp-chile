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
 *    píxeles parecidos.
 * 3. Lo parecido al fondo pero ENCERRADO por el logo son «huecos». Un hueco
 *    compacto es el relleno de una letra (la «O», la «A», la «e») y se quita
 *    (`holes`, encendido de fábrica); uno alargado o enrevesado, como una «S»
 *    blanca dentro de un círculo de color, es parte del dibujo y se conserva
 *    (`looksLikeLetterFill`). Los huecos de una misma pieza de tinta se
 *    deciden juntos por mayoría: en un cartel rojo con «SALE» en blanco, la
 *    «L» (un trazo simple que por sí solo parece relleno) sigue a la S, la A
 *    y la E. La persona corrige cualquier hueco tocándolo en la vista previa
 *    (`toggles`): manda sobre lo decidido.
 * 4. El contorno del logo (la primera fila de píxeles junto al fondo) se
 *    «desmezcla» del fondo: queda semitransparente con su color real, así no
 *    deja un halo blanco sobre una tarjeta oscura.
 * 5. Se recortan los márgenes vacíos (con un respiro mínimo) para que el logo
 *    ocupe su espacio en la tarjeta.
 */

export type Rgb = readonly [number, number, number];

/** Un toque de la persona sobre un hueco (en píxeles de la imagen de trabajo): quitarlo o conservarlo. */
export interface HoleToggle {
  x: number;
  y: number;
  remove: boolean;
}

export interface LogoBackgroundOptions {
  /** 0–100: cuánto puede alejarse un color del fondo y seguir contando como fondo. */
  strength: number;
  /** Quitar el relleno de las letras (los huecos compactos que encierra el logo). Apagado, se conservan todos. */
  holes: boolean;
  /** Huecos que la persona tocó: el último toque dentro de un hueco decide. */
  toggles?: readonly HoleToggle[];
}

export const DEFAULT_LOGO_BACKGROUND: LogoBackgroundOptions = { strength: 25, holes: true };

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
  /** Dónde empieza el recorte dentro de la imagen de trabajo (para ubicar un toque en la vista previa). */
  offset: { x: number; y: number };
  /** Huecos encerrados por el logo: cuántos hay y cuántos quedaron transparentes. */
  holes: { total: number; removed: number };
  /** Hueco al que pertenece cada píxel de la imagen de trabajo (0 = ninguno; vacío si no se procesó). */
  holeLabels: Int32Array;
  /** Por hueco (el índice es su número en `holeLabels`): 1 si quedó transparente. */
  holeRemoved: Uint8Array;
}

/**
 * Compacidad mínima (4π·área / perímetro², con el perímetro contado en bordes
 * de píxel: un círculo da ~0,62 y un cuadrado ~0,79) para que un hueco cuente
 * como relleno de letra. La «O», la «A» o la «e» pasan de 0,45; el trazo de
 * una letra blanca (una «S», una «E») queda bajo 0,2.
 */
export const HOLE_COMPACTNESS = 0.3;
/** Huecos de hasta este tamaño (en píxeles) son relleno o ruido: siempre se quitan. */
const TINY_HOLE = 12;

/** ¿Este hueco es el relleno de una letra (y no un trazo blanco del dibujo)? */
export function looksLikeLetterFill(area: number, perimeter: number): boolean {
  if (area <= TINY_HOLE) return true;
  if (perimeter <= 0) return false;
  return (4 * Math.PI * area) / (perimeter * perimeter) >= HOLE_COMPACTNESS;
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
  return { status, data, width, height, background, uneven, removed: 0, offset: { x: 0, y: 0 }, holes: { total: 0, removed: 0 }, holeLabels: new Int32Array(0), holeRemoved: new Uint8Array(0) };
}

/**
 * Cartel o emblema con texto encima (un disco rojo con «TIL 1» en blanco), no
 * letras con relleno: una pieza con al menos 3 huecos, con este múltiplo de
 * tinta respecto de ellos (`EMBLEM_INK_RATIO`) y cuya tinta es mucho más
 * profunda que sus huecos (`EMBLEM_DEPTH_RATIO`: la superficie del disco se
 * aleja de todo borde, mientras que letras muy gruesas que se tocan siguen
 * siendo trazos cerca de sus rellenos).
 */
const EMBLEM_INK_RATIO = 6;
const EMBLEM_DEPTH_RATIO = 3;

/** Distancia (en pasos de 8 vecinos) de cada píxel `inside` al píxel más cercano que no lo es. */
function depthMap(inside: (index: number) => boolean, width: number, height: number): Uint16Array {
  const total = width * height;
  const depth = new Uint16Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < total; index++) {
    if (inside(index)) depth[index] = 65535;
    else queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    const y = (index - x) / width;
    const next = depth[index]! + 1;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((!dx && !dy) || nx < 0 || nx >= width) continue;
        const neighbor = ny * width + nx;
        if (depth[neighbor]! <= next) continue;
        depth[neighbor] = next;
        queue[tail++] = neighbor;
      }
    }
  }
  return depth;
}

/**
 * Decide juntos los huecos de una misma pieza de tinta (8 vecinos). Si la
 * pieza es un cartel o emblema (`EMBLEM_*`), sus huecos son dibujo y
 * se conservan. Si no, manda la mayoría: si la mayoría parece trazo del dibujo
 * (las letras blancas de un cartel), todos se conservan; si parece relleno,
 * todos se quitan. Con empate, o un solo hueco en la pieza, queda lo que dijo
 * su forma. El píxel a la izquierda del primero de cada hueco siempre es tinta
 * (si fuera parecido al fondo, sería del mismo hueco o del fondo de afuera).
 */
function voteByInk(near: Uint8Array, holeLabels: Int32Array, width: number, height: number, holeSeed: readonly number[], holeArea: readonly number[], removeHole: boolean[]): void {
  const total = width * height;
  const ink = new Int32Array(total);
  const queue = new Int32Array(total);
  let label = 0;
  const inkArea: number[] = [0];
  const needed = new Set<number>();
  for (let hole = 1; hole < holeSeed.length; hole++) needed.add(holeSeed[hole]! - 1);
  for (const start of needed) {
    if (start < 0 || near[start] || ink[start]) continue;
    label++;
    let head = 0;
    let tail = 0;
    ink[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((!dx && !dy) || nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (near[next] || ink[next]) continue;
          ink[next] = label;
          queue[tail++] = next;
        }
      }
    }
    inkArea.push(tail);
  }
  const votes = new Map<number, { fill: number; detail: number; area: number; holes: number[] }>();
  for (let hole = 1; hole < holeSeed.length; hole++) {
    const piece = ink[holeSeed[hole]! - 1] ?? 0;
    if (!piece) continue;
    const vote = votes.get(piece) ?? { fill: 0, detail: 0, area: 0, holes: [] };
    if (removeHole[hole]) vote.fill++;
    else vote.detail++;
    vote.area += holeArea[hole]!;
    vote.holes.push(hole);
    votes.set(piece, vote);
  }
  // Profundidad de la tinta de cada pieza y de cada hueco, solo si alguna pieza puede ser un emblema.
  const candidates = [...votes].filter(([piece, vote]) => vote.holes.length >= 3 && inkArea[piece]! >= EMBLEM_INK_RATIO * vote.area);
  const emblems = new Set<number>();
  if (candidates.length > 0) {
    const inkDepth = depthMap((index) => !near[index], width, height);
    const holeDepth = depthMap((index) => holeLabels[index]! > 0, width, height);
    const deepestInk = new Map<number, number>();
    for (let index = 0; index < total; index++) {
      const piece = ink[index]!;
      if (piece) deepestInk.set(piece, Math.max(deepestInk.get(piece) ?? 0, inkDepth[index]!));
    }
    const deepestHole = new Array<number>(holeSeed.length).fill(0);
    for (let index = 0; index < total; index++) {
      const hole = holeLabels[index]!;
      if (hole) deepestHole[hole] = Math.max(deepestHole[hole]!, holeDepth[index]!);
    }
    for (const [piece, vote] of candidates) {
      const holes = Math.max(1, ...vote.holes.map((hole) => deepestHole[hole]!));
      if ((deepestInk.get(piece) ?? 0) >= EMBLEM_DEPTH_RATIO * holes) emblems.add(piece);
    }
  }
  for (const [piece, vote] of votes) {
    if (emblems.has(piece)) {
      for (const hole of vote.holes) removeHole[hole] = false;
      continue;
    }
    if (vote.holes.length < 2 || vote.fill === vote.detail) continue;
    for (const hole of vote.holes) removeHole[hole] = vote.fill > vote.detail;
  }
}

export function removeLogoBackground(source: Uint8ClampedArray, width: number, height: number, options: LogoBackgroundOptions = DEFAULT_LOGO_BACKGROUND): LogoBackgroundResult {
  const total = width * height;
  if (width <= 0 || height <= 0 || source.length < total * 4) return unchanged('nothing-left', source, Math.max(0, width), Math.max(0, height), null, false);

  const detected = detectBackground(source, width, height);
  if (detected.transparentShare >= TRANSPARENT_BORDER_SHARE || !detected.color) return unchanged('already-transparent', source, width, height, null, false);
  const background = detected.color;
  const uneven = detected.share < EVEN_BORDER_SHARE;
  const threshold = strengthThreshold(options.strength);

  // Parecido al fondo (un píxel que ya era transparente también cuenta).
  const near = new Uint8Array(total);
  for (let index = 0; index < total; index++) {
    if (source[index * 4 + 3]! < TRANSPARENT_ALPHA || distance(source, index * 4, background) <= threshold) near[index] = 1;
  }

  // 1 = fondo. Primero el que toca los bordes por un camino de píxeles parecidos.
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const visitOuter = (next: number) => {
    if (mask[next] || !near[next]) return;
    mask[next] = 1;
    queue[tail++] = next;
  };
  for (const index of borderPixels(width, height)) visitOuter(index);
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    if (x > 0) visitOuter(index - 1);
    if (x < width - 1) visitOuter(index + 1);
    if (index >= width) visitOuter(index - width);
    if (index + width < total) visitOuter(index + width);
  }

  // Huecos: lo parecido al fondo que el logo encierra, cada uno con su área y su perímetro.
  const holeLabels = new Int32Array(total);
  const holeArea: number[] = [0];
  const holePerimeter: number[] = [0];
  const holeSeed: number[] = [-1];
  let label = 0;
  const visitHole = (next: number) => {
    if (!near[next] || mask[next] || holeLabels[next]) return;
    holeLabels[next] = label;
    queue[tail++] = next;
  };
  for (let seed = 0; seed < total; seed++) {
    if (!near[seed] || mask[seed] || holeLabels[seed]) continue;
    label = holeArea.length;
    head = 0;
    tail = 0;
    visitHole(seed);
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      if (x > 0) visitHole(index - 1);
      if (x < width - 1) visitHole(index + 1);
      if (index >= width) visitHole(index - width);
      if (index + width < total) visitHole(index + width);
    }
    holeArea.push(tail);
    holePerimeter.push(0);
    holeSeed.push(seed);
  }
  for (let index = 0; index < total; index++) {
    const own = holeLabels[index]!;
    if (!own) continue;
    const x = index % width;
    if (x === 0 || holeLabels[index - 1] !== own) holePerimeter[own]!++;
    if (x === width - 1 || holeLabels[index + 1] !== own) holePerimeter[own]!++;
    if (index < width || holeLabels[index - width] !== own) holePerimeter[own]!++;
    if (index + width >= total || holeLabels[index + width] !== own) holePerimeter[own]!++;
  }

  // Qué hueco se quita: el relleno de letras (si está encendido) y lo que la persona tocó.
  const removeHole = holeArea.map((area, hole) => hole > 0 && options.holes && looksLikeLetterFill(area, holePerimeter[hole]!));
  if (options.holes && holeArea.length > 2) voteByInk(near, holeLabels, width, height, holeSeed, holeArea, removeHole);
  for (const toggle of options.toggles ?? []) {
    const x = Math.floor(toggle.x);
    const y = Math.floor(toggle.y);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const hole = holeLabels[y * width + x]!;
    if (hole) removeHole[hole] = toggle.remove;
  }
  let holesRemoved = 0;
  for (let hole = 1; hole < holeArea.length; hole++) if (removeHole[hole]) holesRemoved++;
  for (let index = 0; index < total; index++) if (holeLabels[index] && removeHole[holeLabels[index]!]) mask[index] = 1;
  const holes = { total: holeArea.length - 1, removed: holesRemoved };
  const holeRemoved = Uint8Array.from(removeHole, (remove) => (remove ? 1 : 0));

  let removedCount = 0;
  for (let index = 0; index < total; index++) removedCount += mask[index]!;
  const removed = removedCount / total;
  if (removedCount === 0 || removed < 0.01) return unchanged('nothing-removed', source, width, height, background, uneven);
  if (removedCount === total) return { ...unchanged('nothing-left', source, width, height, background, uneven), removed, holes, holeLabels, holeRemoved };

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
  if (right < 0 || visible < total * 0.002) return { ...unchanged('nothing-left', source, width, height, background, uneven), removed, holes, holeLabels, holeRemoved };
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
  return { status: 'ok', data: cropped, width: cropWidth, height: cropHeight, background, uneven, removed, offset: { x: left, y: top }, holes, holeLabels, holeRemoved };
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
