import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';

/**
 * Coreografía de la secuencia del hero de /landing-v2, como funciones puras.
 *
 * P es el progreso global de la pista (0 a 1). v1 ocupa P 0 a V1_END y v2
 * el resto; los textos se derivan del mismo P, así que todo lo que se ve
 * depende de un solo número (y se puede probar sin DOM).
 */

export const V1_END = 0.55;
/**
 * Inercia del avance del video, en segundos: cuánto tarda en alcanzar al
 * scroll. Es un resorte con amortiguación crítica (ver smoothDamp), así que
 * no depende de los cuadros por segundo de la pantalla y nunca se pasa.
 */
export const SMOOTH_TIME = 0.24;
/** A partir de este P empiezan a descargarse los fotogramas de v2. */
export const V2_PRELOAD_FROM = 0.3;
/**
 * Mientras la persona no hace scroll solo se piden los fotogramas hasta este
 * tanto más allá del actual: quien lee el titular y se va no descarga el
 * video entero (en escritorio eran ~14 MB en 12 s).
 */
export const IDLE_AHEAD = 18;
/**
 * Ritmo de v2 dentro de su tramo: pares [avance del tramo, tiempo del video],
 * ambos de 0 a 1. Los primeros 2 s (la galaxia, 25 % del video) ocupan el
 * 35 % del tramo para que «Ahora, estás dentro.» se alcance a leer. El último
 * fotograma (el logo sobre fondo claro) llega al 90 % y se sostiene hasta el
 * final de la pista, así que el scroll siempre termina en él.
 */
export const V2_TIMING: readonly (readonly [number, number])[] = [[0, 0], [0.35, 0.25], [0.9, 1], [1, 1]];

export type Clip = 0 | 1;

export interface FramePosition {
  clip: Clip;
  index: number;
}

export function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** Interpolación de Hermite entre dos bordes: arranca y termina suave. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Tiempo de v2 (0 a 1) para un avance de su tramo (0 a 1), según V2_TIMING. */
export function v2Time(stretch: number): number {
  const x = clamp01(stretch);
  for (let index = 1; index < V2_TIMING.length; index += 1) {
    const [x1, y1] = V2_TIMING[index];
    if (x <= x1) {
      const [x0, y0] = V2_TIMING[index - 1];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

/**
 * Posición continua dentro de un video: `index` tiene decimales (12.4 es
 * el fotograma 12 con 40 % del 13 encima). Permite mezclar fotogramas vecinos.
 */
export function framePoint(progress: number, counts: readonly [number, number]): FramePosition {
  const p = clamp01(progress);
  if (p < V1_END) return { clip: 0, index: (p / V1_END) * (counts[0] - 1) };
  return { clip: 1, index: v2Time((p - V1_END) / (1 - V1_END)) * (counts[1] - 1) };
}

/** Qué video y qué fotograma corresponden a un progreso. */
export function frameAt(progress: number, counts: readonly [number, number]): FramePosition {
  const { clip, index } = framePoint(progress, counts);
  return { clip, index: Math.min(counts[clip] - 1, Math.round(index)) };
}

/**
 * Fotograma de abajo, el de arriba y cuánto del de arriba se ve (0 a 1). Entre
 * dos fotogramas del video el canvas funde ambos: con la rueda del mouse el
 * cuadro avanza de a poco en vez de saltar de uno en uno.
 */
export function frameBlend(point: FramePosition, last: number): { lower: number; upper: number; mix: number } {
  const index = Math.max(0, Math.min(last, point.index));
  const lower = Math.floor(index);
  const upper = Math.min(last, lower + 1);
  return { lower, upper, mix: upper === lower ? 0 : index - lower };
}

/**
 * Resorte con amortiguación crítica (el SmoothDamp de los motores de juego):
 * acelera y frena sin cortes, aunque el objetivo salte de a 100 px por cada
 * clic de la rueda. Devuelve el valor nuevo y su velocidad (unidades por segundo).
 */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): [value: number, velocity: number] {
  if (dt <= 0) return [current, velocity];
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  let nextVelocity = (velocity - omega * temp) * decay;
  let value = target + (change + temp) * decay;
  // Nunca se pasa del objetivo: si lo cruzó, se queda en él.
  if ((target - current > 0) === (value > target)) {
    value = target;
    nextVelocity = 0;
  }
  return [value, nextVelocity];
}

/**
 * Con `stride` > 1 (modo liviano) solo se usan los fotogramas múltiplos de
 * `stride` y el último, que es el que se sostiene al final de la pista.
 */
export function snapIndex(index: number, last: number, stride: number): number {
  if (stride <= 1) return index;
  return Math.min(last, Math.round(index / stride) * stride);
}

export function usesFrame(index: number, last: number, stride: number): boolean {
  return stride <= 1 || index === last || index % stride === 0;
}

/** Posición en una numeración continua v1 → v2, útil para medir distancias. */
export function globalIndex(position: FramePosition, counts: readonly [number, number]): number {
  return position.clip === 0 ? position.index : counts[0] + position.index;
}

export function fromGlobal(global: number, counts: readonly [number, number]): FramePosition {
  return global < counts[0] ? { clip: 0, index: global } : { clip: 1, index: global - counts[0] };
}

export interface Choreography {
  /** Opacidad del titular, párrafo, botones y cifras. */
  intro: number;
  /** Desplazamiento vertical del mismo bloque, en px (sube al irse). */
  introShift: number;
  /** Opacidad de «Ahora, estás dentro.» */
  inside: number;
  insideShift: number;
  /** Largo de la línea dorada de progreso (escala 0 a 1). */
  line: number;
  /** La línea se apaga al final para no marcar la unión con la sección siguiente. */
  lineOpacity: number;
}

export function choreography(progress: number): Choreography {
  const p = clamp01(progress);
  const leaving = smoothstep(0, 0.22, p);
  const arriving = smoothstep(0.45, 0.56, p);
  // Se va sobre la galaxia, antes de que se arme el logo (v2 la deja en P ≈ .71):
  // el titular y el logo, ambos al centro, nunca quedan uno encima del otro.
  const departing = smoothstep(0.64, 0.7, p);
  return {
    intro: 1 - leaving,
    introShift: -40 * leaving,
    inside: arriving * (1 - departing),
    insideShift: 28 * (1 - arriving) - 28 * departing,
    line: p,
    lineOpacity: 1 - smoothstep(0.96, 1, p),
  };
}

/** Estado de un capítulo de la guía del hero para un progreso: cuánto se llenó y si está encendido. */
export function chapterState(progress: number, from: number, to: number): { fill: number; on: number } {
  const p = clamp01(progress);
  return {
    fill: clamp01((p - from) / (to - from)),
    // Se enciende al entrar a su tramo y se apaga al salir, con un borde corto (1/80 de P).
    on: clamp01((p - from) * 80 + 1) * clamp01((to - p) * 80),
  };
}

/** La guía se apaga al final, sobre el logo; «Desliza para entrar» apenas empieza el scroll. */
export function hudOpacity(progress: number): { guide: number; cue: number } {
  const p = clamp01(progress);
  return { guide: 1 - clamp01((p - 0.93) * 20), cue: 1 - clamp01(p * 18) };
}

/**
 * Salida del hero: cuánto sube el degradado a #0b0e14 desde el borde inferior
 * del escenario, según cuánto se alejó ya el escenario (`exit`, 0 a 1 de su
 * alto). Es 0 mientras la pista está fija, así que el último fotograma se ve
 * limpio, y cubre todo cuando el escenario subió la mitad: la unión con la
 * sección siguiente nunca es un corte de claro a oscuro.
 */
export function exitShade(exit: number): number {
  return smoothstep(0, 0.5, exit);
}

/**
 * Orden de descarga: primero el fotograma actual y luego los más cercanos,
 * con prioridad para los que vienen en la dirección del scroll.
 */
export function loadOrder(center: number, total: number, direction: 1 | -1 = 1): number[] {
  const order: number[] = [];
  const start = Math.max(0, Math.min(total - 1, center));
  if (total <= 0) return order;
  order.push(start);
  for (let distance = 1; order.length < total; distance += 1) {
    const ahead = start + distance * direction;
    const behind = start - distance * direction;
    if (ahead >= 0 && ahead < total) order.push(ahead);
    if (behind >= 0 && behind < total) order.push(behind);
  }
  return order;
}

/** Ventana de fotogramas decodificados alrededor del actual (índices globales). */
export function decodeWindow(center: number, total: number, direction: 1 | -1, ahead = 10, behind = 6): [first: number, last: number] {
  const before = direction === 1 ? behind : ahead;
  const after = direction === 1 ? ahead : behind;
  return [Math.max(0, center - before), Math.min(total - 1, center + after)];
}

/** Ruta de un fotograma. `?v=` cambia al regenerarlos, así se pueden cachear un año. */
export function frameUrl(clip: Clip, prefix: 'd' | 'm', index: number): string {
  return `/marketing/cinematic/seq/v${clip + 1}/${prefix}_${String(index + 1).padStart(3, '0')}.webp?v=${manifest.version}`;
}
