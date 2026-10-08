'use client';

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './parts';

/**
 * Fila que se desliza de lado (galería, tarjetas, testimonios…). Funciona sin
 * JavaScript con el dedo o la rueda (desplazamiento con "imán"); las flechas
 * aparecen al montar y solo si hay más contenido a los lados. La región es
 * enfocable para recorrerla con el teclado.
 */
export default function Carousel({ label, children, className, itemClassName, controls = 'end' }: { label: string; children: ReactNode; className?: string; itemClassName: string; controls?: 'end' | 'center' }) {
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ prev: false, next: true, overflow: true });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setState({ prev: el.scrollLeft > 4, next: el.scrollLeft < max - 4, overflow: max > 4 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const move = (dir: -1 | 1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      <div ref={track} role="region" aria-label={label} tabIndex={0} onScroll={update} className="ws-noscroll -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto scroll-smooth px-5 pb-2 @2xl:mx-0 @2xl:scroll-px-0 @2xl:px-0">
        {Children.map(children, (child) => (
          <div className={cx('min-w-0 shrink-0 snap-start', itemClassName)}>{child}</div>
        ))}
      </div>
      {state.overflow && (
        <div className={cx('mt-5 flex gap-2', controls === 'center' ? 'justify-center' : 'justify-end')}>
          <button type="button" className="ws-cbtn" aria-label="Anterior" disabled={!state.prev} onClick={() => move(-1)}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className="ws-cbtn" aria-label="Siguiente" disabled={!state.next} onClick={() => move(1)}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
