'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Contenedor con desplazamiento horizontal que parte mostrando el final: en
 * una serie de tiempo lo más reciente está a la derecha y es lo que se mira
 * primero. Si todo cabe, no hace nada.
 */
export function ScrollToEnd({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
