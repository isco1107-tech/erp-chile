/**
 * Rueda del mouse con deslizamiento suave en la landing. Cada clic de la rueda
 * salta ~100 px de golpe (y más aún con las animaciones de Windows apagadas,
 * que también apagan el desplazamiento suave de Chrome): aquí el salto se
 * reparte en unos cuadros, así el video del hero y las entradas de cada
 * sección avanzan continuos en vez de a tirones.
 *
 * Solo toma la rueda de un mouse. El trackpad y el táctil ya traen su propia
 * inercia y se dejan pasar, igual que el zoom (Ctrl), el desplazamiento
 * lateral (Shift), lo que tenga su propio scroll adentro y un diálogo abierto.
 * El teclado, la barra de scroll y las anclas no pasan por aquí; si la
 * persona los usa a mitad de un deslizamiento, este se detiene y no pelea.
 */

/** Constante de tiempo en segundos: cuánto tarda en recorrer ~63 % del salto. */
export const WHEEL_TAU = 0.11;
/** Línea de la rueda (Firefox la informa en líneas) en px. */
const LINE_PX = 40;
/** Tras un evento de trackpad, cuánto se sigue tratando la rueda como trackpad (ms). */
const TOUCHPAD_HOLD = 400;

/**
 * ¿Parece el clic de la rueda de un mouse? Los mouse informan saltos grandes
 * (≈100 px por clic, o en líneas); un trackpad manda muchos deltas chicos.
 */
export function isWheelNotch(deltaMode: number, deltaY: number): boolean {
  return deltaMode !== 0 || Math.abs(deltaY) >= 50;
}

/** El delta de la rueda en px, sea cual sea la unidad en que llegó. */
export function wheelPixels(deltaMode: number, deltaY: number, viewport: number): number {
  if (deltaMode === 1) return deltaY * LINE_PX;
  if (deltaMode === 2) return deltaY * viewport;
  return deltaY;
}

/** Acercamiento exponencial independiente de los cuadros por segundo. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return current;
  return target + (current - target) * Math.exp(-dt / tau);
}

/** ¿Algún contenedor bajo el puntero puede desplazarse en esa dirección por su cuenta? */
function scrollsInside(start: EventTarget | null, deltaY: number): boolean {
  for (let node = start instanceof Element ? start : null; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight + 1) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
  }
  return false;
}

function modalOpen(): boolean {
  try {
    return document.querySelector('dialog:modal') !== null;
  } catch {
    return document.querySelector('dialog[open]') !== null;
  }
}

export function startSmoothWheel(): () => void {
  let position = 0;
  let target = 0;
  let limit = 0;
  let written = Number.NaN;
  let active = false;
  let frame = 0;
  let last = 0;
  let touchpadUntil = 0;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    active = false;
    last = 0;
  }

  // Solo escribe: las lecturas se hicieron en el evento de la rueda.
  function step(now: number) {
    frame = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    position = approach(position, target, dt, WHEEL_TAU);
    if (Math.abs(target - position) < 0.5) position = target;
    written = position;
    window.scrollTo({ top: position, behavior: 'instant' });
    if (position !== target) frame = requestAnimationFrame(step);
    else stop();
  }

  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.shiftKey || event.deltaY === 0) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (!isWheelNotch(event.deltaMode, event.deltaY)) touchpadUntil = event.timeStamp + TOUCHPAD_HOLD;
    if (event.timeStamp < touchpadUntil || modalOpen() || scrollsInside(event.target, event.deltaY)) {
      if (active) stop();
      return;
    }
    event.preventDefault();
    const viewport = window.innerHeight;
    limit = Math.max(0, document.documentElement.scrollHeight - viewport);
    if (!active) position = target = window.scrollY;
    target = Math.min(limit, Math.max(0, target + wheelPixels(event.deltaMode, event.deltaY, viewport)));
    active = true;
    if (!frame) frame = requestAnimationFrame(step);
  };

  // Si el scroll llegó a otro lugar que el escrito (teclado, barra, ancla), se suelta.
  const onScroll = () => {
    if (active && Math.abs(window.scrollY - written) > 2) stop();
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    stop();
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScroll);
  };
}
