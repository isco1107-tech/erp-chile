/**
 * Movimiento de /landing-v2 fuera del hero, como funciones puras.
 *
 * Todo se deriva de la posición del elemento en la ventana, no del tiempo:
 * lo mueve el scroll de la persona. Por eso sigue activo con movimiento
 * reducido (igual que el video del hero), mientras que lo que se anima solo
 * (el titilar de las estrellas) respeta esa preferencia en CSS.
 */
import { clamp01, smoothstep } from './sequence';

/** Donde empieza la entrada (fracción del alto de la ventana, medido desde arriba). */
export const ENTER_FROM = 0.98;
/** Cuánto scroll (fracción del alto de la ventana) dura la entrada. */
export const ENTER_SPAN = 0.24;
/** Retraso de cada hermano en una grilla (fracción del alto de la ventana). */
export const STAGGER = 0.035;
/** Más allá de este orden todos los hermanos entran juntos. */
export const MAX_STAGGER = 5;

/**
 * Entrada de 0 a 1: 0 mientras el borde superior está bajo `ENTER_FROM` de la
 * ventana, 1 cuando ya subió `ENTER_SPAN`. `order` retrasa a los hermanos de
 * una grilla para que entren en cascada.
 */
export function enterProgress(top: number, viewport: number, order = 0): number {
  if (viewport <= 0) return 1;
  const delay = Math.min(order, MAX_STAGGER) * STAGGER * viewport;
  return smoothstep(0, 1, (viewport * ENTER_FROM - top - delay) / (viewport * ENTER_SPAN));
}

/**
 * Paso por la ventana de 0 a 1: 0 cuando el elemento asoma por abajo, .5 con
 * su centro en el centro de la ventana y 1 cuando termina de salir por arriba.
 */
export function viewProgress(top: number, height: number, viewport: number): number {
  const travel = viewport + height;
  return travel > 0 ? clamp01((viewport - top) / travel) : 0.5;
}
