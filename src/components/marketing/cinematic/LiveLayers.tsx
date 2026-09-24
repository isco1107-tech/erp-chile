'use client';

import { useEffect, useRef } from 'react';
import { startConstellation } from './constellation';
import s from './v2.module.css';

/** Lo que se puede activar: el cursor se agranda encima. */
const INTERACTIVE = 'a, button, summary, select, label, [role="tab"], [data-cursor]';
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea';

/** Cielo que reacciona al puntero y al dedo (constellation.ts). Va detrás del contenido. */
export function Sky() {
  const sky = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = sky.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hero = document.querySelector<HTMLElement>('[data-cinematic-track]');
    // Mientras el hero cubre la pantalla, su video manda y el cielo no se dibuja.
    // Su borde inferior se mide al cambiar de tamaño, no en cada cuadro.
    let heroBottom = 0;
    const measure = () => { heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 0; };
    measure();
    const observer = new ResizeObserver(measure);
    if (hero) observer.observe(hero);
    const covered = (scroll: number) => scroll + window.innerHeight <= heroBottom;
    const stop = startConstellation(canvas, reduced, covered);
    return () => {
      stop();
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
