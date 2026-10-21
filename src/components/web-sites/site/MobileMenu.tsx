'use client';

import { Menu, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

/**
 * Menú desplegable del encabezado en pantallas angostas. Es un `<details>`:
 * abre y cierra sin JavaScript. El script solo suma dos comodidades: se cierra
 * al elegir un enlace (un ancla de la misma página no recarga la página) y con
 * la tecla Escape.
 */
export default function MobileMenu({ className, panelClassName, children }: { className?: string; panelClassName: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={ref}
      className={`group ${className ?? ''}`}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a, [role="link"]')) ref.current?.removeAttribute('open');
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !ref.current?.open) return;
        ref.current.removeAttribute('open');
        ref.current.querySelector('summary')?.focus();
      }}
    >
      <summary className="ws-navlink flex size-11 cursor-pointer list-none items-center justify-center !p-0 [&::-webkit-details-marker]:hidden">
        <Menu className="size-6 group-open:hidden" aria-hidden="true" />
        <X className="hidden size-6 group-open:block" aria-hidden="true" />
        <span className="sr-only">Menú</span>
      </summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
