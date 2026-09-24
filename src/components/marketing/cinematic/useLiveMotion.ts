import { useEffect, type RefObject } from 'react';
import { enterProgress, viewProgress } from './live';

/**
 * Motor de movimiento de /landing-v2 fuera del hero. Escribe en cada elemento
 * dos variables CSS y el CSS decide qué hacer con ellas:
 *   --in    entrada, de 0 (aún bajo la ventana) a 1 (ya entró)
 *   --view  paso por la ventana, de 0 (asoma abajo) a 1 (sale arriba)
 *   --pin   solo en `[data-pin]` (escenas fijas): avance dentro de la escena
 * Elementos que lo reciben: `[data-reveal]`, `[data-live]`, `[data-pin]` y
 * las clases que se pasen en `classes` (titulares y antetítulos).
 *
 * Además da brillo, inclinación e imán a `[data-spot]`, `[data-tilt]` y
 * `[data-magnetic]`, y mueve con el puntero el halo dorado del fondo. En pantallas táctiles, sin puntero que
 * pase por encima, la tarjeta más cercana al centro recibe `data-focus`.
 *
 * Nada pasa por el estado de React: todo se escribe en requestAnimationFrame,
 * y en cada cuadro primero se leen todas las posiciones y después se escribe
 * (intercalar lecturas y escrituras obliga al navegador a recalcular el diseño).
 * Sin JavaScript las variables no existen y el CSS usa `var(--in, 1)`: todo
 * se ve completo.
 */
export function useLiveMotion(
  root: RefObject<HTMLElement | null>,
  cosmos: RefObject<HTMLElement | null>,
  classes: readonly string[],
) {
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const selector = ['[data-reveal]', '[data-live]', '[data-pin]', ...classes.map(name => `.${CSS.escape(name)}`)].join(', ');
    const targets = [...node.querySelectorAll<HTMLElement>(selector)].filter(target => !target.closest('[data-cinematic-track]'));
    const members = new Set<Element>(targets);
    const order = new Map<HTMLElement, number>();
    const written = new WeakMap<HTMLElement, string>();
    const active = new Set<HTMLElement>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touch = window.matchMedia('(hover: none)');
    let focused: HTMLElement | null = null;
    let frame = 0;
    let spot: HTMLElement | null = null;
    let tilt: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;

    /**
     * Hermanos de una misma fila (mismo borde superior) entran en cascada. Se
     * calcula recién al medir el elemento, cuando el diseño ya está al día:
     * hacerlo para los ~80 elementos al montar forzaba un diseño completo
     * durante la hidratación.
     */
    function orderOf(target: HTMLElement): number {
      const cached = order.get(target);
      if (cached !== undefined) return cached;
      let count = 0;
      for (let sibling = target.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (members.has(sibling) && Math.abs((sibling as HTMLElement).offsetTop - target.offsetTop) < 4) count += 1;
      }
      order.set(target, count);
      return count;
    }

    function write(target: HTMLElement, enter: number, view: number) {
      const value = `${enter.toFixed(3)}|${view.toFixed(3)}`;
      if (written.get(target) === value) return;
      written.set(target, value);
      target.style.setProperty('--in', enter.toFixed(3));
      target.style.setProperty('--view', view.toFixed(3));
    }

    function apply(target: HTMLElement, rect: DOMRect, viewport: number, atEnd: boolean) {
      const enter = atEnd ? 1 : enterProgress(rect.top, viewport, order.get(target) ?? 0);
      write(target, enter, viewProgress(rect.top, rect.height, viewport));
      if (target.hasAttribute('data-pin')) {
        const travel = rect.height - viewport;
        target.style.setProperty('--pin', (travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0).toFixed(4));
      }
    }

    /** En pantallas táctiles, la tarjeta más cercana al centro de la ventana (solo lee). */
    function nearestCard(viewport: number): HTMLElement | null {
      let best: HTMLElement | null = null;
      let bestDistance = viewport * 0.3;
      for (const card of node?.querySelectorAll<HTMLElement>('[data-spot]') ?? []) {
        const rect = card.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > viewport) continue;
        const distance = Math.hypot(rect.left + rect.width / 2 - window.innerWidth / 2, rect.top + rect.height / 2 - viewport / 2);
        if (distance < bestDistance) {
          best = card;
          bestDistance = distance;
        }
      }
      return best;
    }

    /** Lecturas del cuadro: se hacen en el evento de scroll, con el diseño al día. */
    let measured: { viewport: number; atEnd: boolean; rects: (readonly [HTMLElement, DOMRect])[]; nearest: HTMLElement | null } | null = null;

    function read() {
      const viewport = window.innerHeight;
      // Al fondo de la página lo que queda abajo ya no puede subir más: entra completo.
      const atEnd = window.scrollY + viewport >= document.documentElement.scrollHeight - 2;
      measured = {
        viewport,
        atEnd,
        rects: [...active].map(target => {
          orderOf(target);
          return [target, target.getBoundingClientRect()] as const;
        }),
        nearest: touch.matches ? nearestCard(viewport) : focused,
      };
    }

    /** Escrituras del cuadro (requestAnimationFrame). */
    function update() {
      frame = 0;
      if (!measured) read();
      if (!measured) return;
      const { viewport, atEnd, rects, nearest } = measured;
      measured = null;
      for (const [target, rect] of rects) apply(target, rect, viewport, atEnd);
      if (nearest !== focused) {
        focused?.removeAttribute('data-focus');
        nearest?.setAttribute('data-focus', '');
        focused = nearest;
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    const onScroll = () => {
      read();
      schedule();
    };

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          active.add(target);
        } else {
          active.delete(target);
          // Fuera de la ventana queda en su estado final: entero si ya pasó, oculto si viene.
          const above = entry.boundingClientRect.top < 0;
          write(target, above ? 1 : 0, above ? 1 : 0);
        }
      }
      if (entries.some(entry => entry.isIntersecting)) schedule();
    }, { rootMargin: '30% 0px 30% 0px' });

    function reset(element: HTMLElement | null, ...properties: string[]) {
      for (const property of properties) element?.style.removeProperty(property);
    }

    // Puntero: en el evento solo se lee (con el diseño al día) y en
    // requestAnimationFrame se escribe una vez por cuadro, aunque el mouse
    // mande varios eventos entre cuadro y cuadro.
    interface PointerRead {
      x: number;
      y: number;
      spot: HTMLElement | null;
      spotRect?: DOMRect;
      tilt: HTMLElement | null;
      tiltRect?: DOMRect;
      magnet: HTMLElement | null;
      magnetRect?: DOMRect;
    }
    let pointerRead: PointerRead | null = null;
    let pointerFrame = 0;

    const writePointer = () => {
      pointerFrame = 0;
      const read = pointerRead;
      pointerRead = null;
      if (!read) return;
      if (read.spot !== spot) reset(spot, '--mx', '--my');
      spot = read.spot;
      if (spot && read.spotRect) {
        spot.style.setProperty('--mx', `${Math.round(read.x - read.spotRect.left)}px`);
        spot.style.setProperty('--my', `${Math.round(read.y - read.spotRect.top)}px`);
      }
      if (read.tilt !== tilt) reset(tilt, '--tx', '--ty');
      tilt = read.tilt;
      if (tilt && read.tiltRect) {
        tilt.style.setProperty('--tx', (((read.x - read.tiltRect.left) / read.tiltRect.width - 0.5) * 6).toFixed(2));
        tilt.style.setProperty('--ty', ((0.5 - (read.y - read.tiltRect.top) / read.tiltRect.height) * 6).toFixed(2));
      }
      if (read.magnet !== magnet) reset(magnet, '--mgx', '--mgy');
      magnet = read.magnet;
      if (magnet && read.magnetRect) {
        const dx = Math.max(-8, Math.min(8, (read.x - read.magnetRect.left - read.magnetRect.width / 2) * 0.16));
        const dy = Math.max(-6, Math.min(6, (read.y - read.magnetRect.top - read.magnetRect.height / 2) * 0.3));
        magnet.style.setProperty('--mgx', `${dx.toFixed(1)}px`);
        magnet.style.setProperty('--mgy', `${dy.toFixed(1)}px`);
      }
      cosmos.current?.style.setProperty('--gx', `${Math.round(read.x)}px`);
      cosmos.current?.style.setProperty('--gy', `${Math.round(read.y)}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const element = event.target instanceof Element ? event.target : null;
      const nextSpot = element?.closest<HTMLElement>('[data-spot]') ?? null;
      const nextTilt = element?.closest<HTMLElement>('[data-tilt]') ?? null;
      const nextMagnet = element?.closest<HTMLElement>('[data-magnetic]') ?? null;
      pointerRead = {
        x: event.clientX,
        y: event.clientY,
        spot: nextSpot,
        spotRect: nextSpot?.getBoundingClientRect(),
        tilt: nextTilt,
        tiltRect: nextTilt?.getBoundingClientRect(),
        magnet: nextMagnet,
        magnetRect: nextMagnet?.getBoundingClientRect(),
      };
      if (!pointerFrame) pointerFrame = requestAnimationFrame(writePointer);
    };
    const onPointerLeave = () => {
      reset(spot, '--mx', '--my');
      reset(tilt, '--tx', '--ty');
      reset(magnet, '--mgx', '--mgy');
      spot = tilt = magnet = null;
    };
    const onResize = () => {
      order.clear();
      schedule();
    };

    for (const target of targets) observer.observe(target);
    node.setAttribute('data-live-ready', '');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pointerFrame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      focused?.removeAttribute('data-focus');
      node.removeAttribute('data-live-ready');
      for (const target of targets) {
        target.style.removeProperty('--in');
        target.style.removeProperty('--view');
        target.style.removeProperty('--pin');
      }
    };
  }, [root, cosmos, classes]);
}
