'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './parts';

/**
 * Pestañas accesibles (patrón de WAI-ARIA): flechas, Inicio y Fin cambian de
 * pestaña. Todos los paneles vienen pintados desde el servidor (buscadores y
 * lectores los encuentran); los que no están activos llevan `hidden`.
 */
export default function SiteTabs({ labels, panels, variant }: { labels: string[]; panels: ReactNode[]; variant: 'top' | 'side' | 'pills' }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focus = (index: number) => {
    const next = (index + labels.length) % labels.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = variant === 'side' ? 'ArrowDown' : 'ArrowRight';
    const back = variant === 'side' ? 'ArrowUp' : 'ArrowLeft';
    if (event.key === forward) focus(index + 1);
    else if (event.key === back) focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(labels.length - 1);
    else return;
    event.preventDefault();
  };

  const list = (
    <div
      role="tablist"
      aria-orientation={variant === 'side' ? 'vertical' : 'horizontal'}
      className={cx(
        variant === 'top' && 'ws-noscroll flex gap-1 overflow-x-auto border-b border-[color:var(--s-line)]',
        variant === 'pills' && 'flex flex-wrap justify-center gap-2',
        variant === 'side' && 'ws-noscroll flex gap-1 overflow-x-auto @3xl:flex-col @3xl:overflow-visible'
      )}
    >
      {labels.map((label, index) => (
        <button
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={`${base}-tab-${index}`}
          type="button"
          role="tab"
          aria-selected={index === active}
          aria-controls={`${base}-panel-${index}`}
          tabIndex={index === active ? 0 : -1}
          onClick={() => setActive(index)}
          onKeyDown={(event) => onKey(event, index)}
          className={cx(
            'ws-tab shrink-0 text-left font-semibold',
            variant === 'top' && 'px-4 py-3 whitespace-nowrap',
            variant === 'pills' && 'rounded-full border border-[color:var(--s-line)] px-5 py-2.5',
            variant === 'side' && 'rounded-[min(var(--ws-radius),.75rem)] px-4 py-3 whitespace-nowrap @3xl:whitespace-normal'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cx(variant === 'side' && 'grid gap-8 @3xl:grid-cols-[14rem_minmax(0,1fr)] @3xl:gap-12')}>
      {list}
      <div className={cx(variant !== 'side' && 'mt-8')}>
        {panels.map((panel, index) => (
          <div key={index} id={`${base}-panel-${index}`} role="tabpanel" aria-labelledby={`${base}-tab-${index}`} hidden={index !== active} tabIndex={0} className="outline-none">
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
