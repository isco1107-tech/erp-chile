/**
 * Cronología de la intro en video del login, como funciones puras (se prueban
 * sin DOM). El "video" es la secuencia de fotogramas v1 de la landing (cielo
 * de Atacama → galaxia): ya está en caché para quien llega desde la landing y
 * se sirve inmutable un año (ver next.config.js).
 */

/** Clave de sessionStorage: la intro se ve una vez por sesión del navegador. */
export const LOGIN_INTRO_SEEN_KEY = 'aether:login-intro-seen';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Script que corre antes de la primera pintura (lo inserta el layout del
 * login, un componente de servidor — por eso vive acá y no en el componente
 * cliente): si la intro ya se vio en esta sesión o la persona pidió menos
 * movimiento, oculta el velo antes de que se vea, así quien vuelve al login
 * no ve un parpadeo oscuro mientras React hidrata.
 */
export const LOGIN_INTRO_GATE_SCRIPT = `try{if(sessionStorage.getItem('${LOGIN_INTRO_SEEN_KEY}')==='1'||matchMedia('${REDUCED_MOTION_QUERY}').matches){var s=document.createElement('style');s.textContent='[data-login-intro]{display:none!important}';document.head.appendChild(s)}}catch(e){}`;

/** Fracción de fotogramas que debe estar lista antes de empezar a reproducir. */
export const START_BUFFER = 0.35;
/** Si en este tiempo no se juntó el buffer inicial, la intro se salta. */
export const MAX_WAIT_MS = 4000;
/** Duración del fundido final, cuando el video se abre hacia el login. */
export const EXIT_FADE_MS = 1100;
/** Desde qué avance del video aparece el logo encima (para enlazar con el fondo del login). */
export const LOGO_REVEAL_FROM = 0.72;

/** Índices de fotograma que se usan con un `stride` (el último siempre entra). */
export function introFrames(count: number, stride: number): number[] {
  if (count <= 0) return [];
  const step = Math.max(1, Math.floor(stride));
  const frames: number[] = [];
  for (let index = 0; index < count; index += step) frames.push(index);
  if (frames[frames.length - 1] !== count - 1) frames.push(count - 1);
  return frames;
}

/**
 * Posición (0 a `total - 1`) dentro de la lista de fotogramas para un tiempo
 * de reproducción. `fps` es el del set original: con `stride` 3 cada
 * fotograma dura tres cuadros, así la intro dura lo mismo en modo liviano.
 */
export function positionAt(playedMs: number, fps: number, stride: number, total: number): number {
  if (total <= 0) return 0;
  const perFrameMs = (1000 / fps) * Math.max(1, Math.floor(stride));
  // El épsilon evita que 1000 / (1000 / 6) caiga en 5,999… por redondeo binario.
  return Math.min(total - 1, Math.max(0, Math.floor(playedMs / perFrameMs + 1e-9)));
}

/** Duración total de la intro en milisegundos. */
export function introDurationMs(total: number, fps: number, stride: number): number {
  return total * (1000 / fps) * Math.max(1, Math.floor(stride));
}

/** Cuántos fotogramas consecutivos desde el inicio ya están listos. */
export function readyPrefix(ready: readonly boolean[]): number {
  let count = 0;
  while (count < ready.length && ready[count]) count += 1;
  return count;
}

/** Si ya se puede empezar: buffer inicial listo, o todo listo. */
export function canStart(ready: readonly boolean[]): boolean {
  if (ready.length === 0) return false;
  const prefix = readyPrefix(ready);
  return prefix === ready.length || prefix >= Math.ceil(ready.length * START_BUFFER);
}

/** Opacidad del logo superpuesto según el avance del video (0 a 1). */
export function logoOpacity(progress: number): number {
  if (progress <= LOGO_REVEAL_FROM) return 0;
  const t = Math.min(1, (progress - LOGO_REVEAL_FROM) / (1 - LOGO_REVEAL_FROM));
  return t * t * (3 - 2 * t);
}
