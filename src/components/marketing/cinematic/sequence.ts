import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';

/**
 * Coreografía de las dos escenas con video de la landing (`/`), como
 * funciones puras.
 *
 * Cada escena es una pista larga con un escenario fijo y su propio video:
 * el hero recorre v1 (cielo de Atacama → Vía Láctea → galaxia) y el cierre
 * recorre v2 (la galaxia se arma en el logo). P es el progreso de la pista
 * (0 a 1); el fotograma y los textos se derivan de ese único número, así que
 * se puede probar sin DOM.
 *
 * Antes los dos videos iban seguidos en el hero: la página partía con todo el
 * movimiento, terminaba en un logo sobre fondo blanco y caía de golpe a
 * secciones oscuras y quietas. Repartidos, el video abre y cierra la página,
 * y ambos tramos terminan oscuros, como el resto.
 */

/**
 * Inercia del avance del video, en segundos: cuánto tarda en alcanzar al
 * scroll. Es un resorte con amortiguación crítica (ver smoothDamp), así que
 * no depende de los cuadros por segundo de la pantalla y nunca se pasa.
 */
export const SMOOTH_TIME = 0.24;
/**
 * Mientras la persona no hace scroll solo se piden los fotogramas hasta este
 * tanto más allá del actual: quien lee el titular y se va no descarga el
 * video entero.
 */
export const IDLE_AHEAD = 18;

/** Ritmo de un video dentro de su pista: pares [P, tiempo del video], ambos de 0 a 1. */
export type Timing = readonly (readonly [number, number])[];

/**
 * Hero: v1 de punta a punta. El último fotograma (la galaxia) llega al 90 %
 * de la pista y se sostiene, así que «Ahora, estás dentro.» se lee quieto.
 */
export const HERO_TIMING: Timing = [[0, 0], [0.9, 1], [1, 1]];
/**
 * Cierre: v2 hasta el logo sobre el cielo oscuro. El logo queda armado al
 * 78 % y se sostiene mientras aparece «Dale Aether.».
 */
export const FINALE_TIMING: Timing = [[0, 0], [0.78, 1], [1, 1]];
/**
 * El cierre se corta este tanto antes de que v2 empiece a aclararse (su final
 * es el logo sobre fondo blanco): el último cuadro que se ve es oscuro.
 */
export const FINALE_MARGIN_SECONDS = 0.6;

export type Clip = 0 | 1;

export function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** Interpolación de Hermite entre dos bordes: arranca y termina suave. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Tiempo del video (0 a 1) para un progreso de la pista, según su ritmo (tramos lineales). */
export function videoTime(progress: number, timing: Timing): number {
  const x = clamp01(progress);
  for (let index = 1; index < timing.length; index += 1) {
    const [x1, y1] = timing[index];
    if (x <= x1) {
      const [x0, y0] = timing[index - 1];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

/**
 * Posición continua en el video: tiene decimales (12.4 es el fotograma 12
 * con 40 % del 13 encima). Permite mezclar fotogramas vecinos. `last` es el
 * último fotograma que usa la escena.
 */
export function framePoint(progress: number, timing: Timing, last: number): number {
  return videoTime(progress, timing) * Math.max(0, last);
}

/** Fotograma que corresponde a un progreso. */
export function frameAt(progress: number, timing: Timing, last: number): number {
  return Math.min(Math.max(0, last), Math.round(framePoint(progress, timing, last)));
}

/**
 * Último fotograma del cierre: el anterior al primer tramo claro de v2 (lo
 * mide el generador), con FINALE_MARGIN_SECONDS de margen. Sin tramo claro, el video entero.
 */
export function finaleLastFrame(count: number, fps: number, light: readonly (readonly number[])[]): number {
  if (light.length === 0) return Math.max(0, count - 1);
  const firstLight = light.reduce((first, [start]) => Math.min(first, start), count);
  return Math.max(0, Math.min(count - 1, firstLight - 1 - Math.round(FINALE_MARGIN_SECONDS * fps)));
}

/**
 * Fotograma de abajo, el de arriba y cuánto del de arriba se ve (0 a 1). Entre
 * dos fotogramas del video el canvas funde ambos: con la rueda del mouse el
 * cuadro avanza de a poco en vez de saltar de uno en uno.
 */
export function frameBlend(point: number, last: number): { lower: number; upper: number; mix: number } {
  const index = Math.max(0, Math.min(last, point));
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
  // Llega cuando la galaxia ya ocupa el cuadro (v1 ≈ 62 % a 75 %) y se queda:
  // el hero termina con esa frase sobre el último fotograma, sin nada claro detrás.
  const arriving = smoothstep(0.56, 0.68, p);
  return {
    intro: 1 - leaving,
    introShift: -40 * leaving,
    inside: arriving,
    insideShift: 28 * (1 - arriving),
    line: p,
    lineOpacity: 1 - smoothstep(0.96, 1, p),
  };
}

/** Coreografía del cierre: el titular de arriba está desde el comienzo; «Dale Aether.» y el botón llegan con el logo. */
export interface FinaleChoreography {
  /** Opacidad de «Dale Aether.» y del botón. */
  close: number;
  /** Desplazamiento vertical del mismo bloque, en px (sube al llegar). */
  closeShift: number;
}

export function finaleChoreography(progress: number): FinaleChoreography {
  const arriving = smoothstep(0.68, 0.82, clamp01(progress));
  return { close: arriving, closeShift: 24 * (1 - arriving) };
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

/** La guía se apaga al final, sobre la galaxia; «Desliza para entrar» apenas empieza el scroll. */
export function hudOpacity(progress: number): { guide: number; cue: number } {
  const p = clamp01(progress);
  return { guide: 1 - clamp01((p - 0.93) * 20), cue: 1 - clamp01(p * 18) };
}

/**
 * Salida del hero: cuánto sube el degradado a #0b0e14 desde el borde inferior
 * del escenario, según cuánto se alejó ya el escenario (`exit`, 0 a 1 de su
 * alto). Es 0 mientras la pista está fija, así que el último fotograma se ve
 * limpio, y cubre todo cuando el escenario subió la mitad: la unión con la
 * sección siguiente nunca es un corte.
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
