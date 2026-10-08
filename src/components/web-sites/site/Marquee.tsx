'use client';

import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cx } from './parts';

/**
 * Cinta que desfila sola (frases o logos). Solo se anima `transform` y la
 * animación se pausa fuera de la pantalla (`data-offscreen`, como el
 * micrositio de certámenes), al pasar el mouse y si la persona pidió menos
 * movimiento (entonces las frases quedan quietas en varias líneas). Cada
 * grupo repite los elementos `repeat` veces (el que llama calcula cuántas
 * hacen falta para cubrir una pantalla de 2560 px); las repeticiones y la
 * copia que hace continuo el giro van con `aria-hidden` e `inert`: un lector
 * de pantalla lee cada elemento una vez y el teclado no pasa por enlaces
 * repetidos.
 */
export default function Marquee({ items, repeat, seconds, className, groupClassName }: { items: ReactNode[]; repeat: number; seconds: number; className?: string; groupClassName?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) el.removeAttribute('data-offscreen');
      else el.setAttribute('data-offscreen', '');
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const copies = items.length === 0 ? 0 : Math.max(0, Math.min(40, Math.ceil(repeat)) - 1);
  const filler = Array.from({ length: copies }, (_, copy) => (
    <span key={`r${copy}`} aria-hidden="true" inert className="ws-marquee-dup contents">
      {items.map((item, index) => (
        <Fragment key={index}>{item}</Fragment>
      ))}
    </span>
  ));
  const group = (
    <>
      {items.map((item, index) => (
        <Fragment key={index}>{item}</Fragment>
      ))}
      {filler}
    </>
  );
  return (
    <div ref={root} className={cx('ws-marquee', className)} style={{ '--ws-mq': `${seconds}s` } as CSSProperties}>
      <span aria-hidden="true" className="ws-marquee-fade ws-marquee-fade-l" />
      <div className="ws-marquee-track">
        <div className={cx('ws-marquee-group flex shrink-0 items-center', groupClassName)}>{group}</div>
        <div aria-hidden="true" inert className={cx('ws-marquee-group ws-marquee-dup flex shrink-0 items-center', groupClassName)}>
          {group}
        </div>
      </div>
      <span aria-hidden="true" className="ws-marquee-fade ws-marquee-fade-r" />
    </div>
  );
}
