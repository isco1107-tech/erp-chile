'use client';

import { useEffect, useRef } from 'react';
import { startConstellation } from './constellation';
import { isLightweightDevice } from './device';
import s from './v2.module.css';

/** Corre `task` cuando el navegador está libre (o a más tardar en 2 s). Devuelve cómo cancelarla. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1200);
  return () => window.clearTimeout(id);
}

/** Lo que se puede activar: el cursor se agranda encima. */
const INTERACTIVE = 'a, button, summary, select, label, [role="tab"], [data-cursor]';
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea';

/** Cielo que reacciona al puntero y al dedo (constellation.ts). Va detrás del contenido. */
export function Sky() {
  const sky = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = sky.current;
    // En modo liviano (device.ts) queda solo el fondo estático del cielo.
    if (!canvas || isLightweightDevice()) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finale = document.querySelector<HTMLElement>('[data-finale-track]');
    // Mientras el cierre con video cubre la pantalla, su video manda y el
    // cielo no se dibuja. Sus bordes se miden al cambiar de tamaño, no en cada cuadro.
    let finaleTop = Number.POSITIVE_INFINITY;
    let finaleBottom = Number.NEGATIVE_INFINITY;
    const measure = () => {
      if (!finale) return;
      finaleTop = finale.offsetTop;
      finaleBottom = finale.offsetTop + finale.offsetHeight;
    };
    measure();
    // El cierre está al final: su posición cambia con el alto de todo lo de arriba.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    const covered = (scroll: number) => scroll >= finaleTop && scroll + window.innerHeight <= finaleBottom;
    // Arranca cuando el navegador queda libre: no compite con la hidratación
    // ni con la primera pintura.
    let stop: (() => void) | null = null;
    const cancel = whenIdle(() => { stop = startConstellation(canvas, reduced, covered); });
    return () => {
      cancel();
      stop?.();
      observer.disconnect();
    };
  }, []);

  return <canvas ref={sky} className={s.sky} aria-hidden="true" />;
}

/**
 * Con mouse, un cursor propio: un punto dorado y un anillo que lo sigue y se
 * abre sobre lo que se puede activar. El cursor del sistema sigue visible;
 * esto lo acompaña, no lo reemplaza. En pantallas táctiles no aparece.
 */
export function Cursor() {
  const cursor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = cursor.current;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!node || !fine.matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const [dot, ring] = [node.children[0] as HTMLElement, node.children[1] as HTMLElement];
    const target = { x: -100, y: -100 };
    const trail = { x: -100, y: -100 };
    let frame = 0;

    const place = (element: HTMLElement, x: number, y: number) => {
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    const tick = () => {
      frame = 0;
      const easing = reduced.matches ? 1 : 0.2;
      trail.x += (target.x - trail.x) * easing;
      trail.y += (target.y - trail.y) * easing;
      place(dot, target.x, target.y);
      place(ring, trail.x, trail.y);
      if (Math.abs(target.x - trail.x) > 0.1 || Math.abs(target.y - trail.y) > 0.1) frame = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = event.clientX;
      target.y = event.clientY;
      const element = event.target instanceof Element ? event.target : null;
      node.toggleAttribute('data-hover', Boolean(element?.closest(INTERACTIVE)));
      node.toggleAttribute('data-text', Boolean(element?.closest(TEXT_ENTRY)));
      node.setAttribute('data-on', '');
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onDown = () => node.setAttribute('data-press', '');
    const onUp = () => node.removeAttribute('data-press');
    const onLeave = () => node.removeAttribute('data-on');

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      node.removeAttribute('data-on');
    };
  }, []);

  return <div ref={cursor} className={s.cursor} aria-hidden="true"><span /><span /></div>;
}
