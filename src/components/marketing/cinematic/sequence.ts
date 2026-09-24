/**
 * Coreografía de la secuencia del hero de /landing-v2, como funciones puras.
 *
 * P es el progreso global de la pista (0 a 1). v1 ocupa P 0 a V1_END y v2
 * el resto; los textos se derivan del mismo P, así que todo lo que se ve
 * depende de un solo número (y se puede probar sin DOM).
 */

export const V1_END = 0.55;
/** Suavizado por cuadro de animación: le da inercia al avance del video. */
export const LERP = 0.12;
/** A partir de este P empiezan a descargarse los fotogramas de v2. */
export const V2_PRELOAD_FROM = 0.3;
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

/** Qué video y qué fotograma corresponden a un progreso. */
export function frameAt(progress: number, counts: readonly [number, number]): FramePosition {
  const p = clamp01(progress);
  if (p < V1_END) {
    const last = counts[0] - 1;
    return { clip: 0, index: Math.min(last, Math.round((p / V1_END) * last)) };
  }
  const last = counts[1] - 1;
  return { clip: 1, index: Math.min(last, Math.round(v2Time((p - V1_END) / (1 - V1_END)) * last)) };
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

export function frameUrl(clip: Clip, prefix: 'd' | 'm', index: number): string {
  return `/marketing/cinematic/seq/v${clip + 1}/${prefix}_${String(index + 1).padStart(3, '0')}.webp`;
}
