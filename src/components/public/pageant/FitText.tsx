'use client';

import { useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

/**
 * Texto de una sola línea que SIEMPRE cabe en su contenedor. El tamaño que
 * define el CSS (con su heurística por cantidad de letras) es el máximo: si al
 * medir el texto real —con la fuente ya cargada— es más ancho que el espacio,
 * se reduce lo justo. Sirve para los títulos gigantes ("Temuco/Longuimay",
 * "Superextraordinariamente") que ninguna regla fija puede acomodar en todas
 * las pantallas. Nunca agranda: en el servidor y sin JavaScript se ve con el
 * tamaño del CSS.
 */
export function FitText({
  as: Tag = 'span',
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const available = el.clientWidth;
      const needed = el.scrollWidth;
      if (available > 0 && needed > available) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        // 2% de margen: el trazo del contorno y el espaciado entre letras no deben rozar el borde.
        el.style.fontSize = `${Math.max(8, (size * available) / needed) * 0.98}px`;
      }
    };
    fit();
    const parent = el.parentElement;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    if (parent) observer?.observe(parent);
    // Las fuentes se cargan después del primer pintado: se vuelve a medir con la fuente real.
    void document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [children]);

  return (
    <Tag ref={ref} className={className} style={style} {...rest}>
      {children}
    </Tag>
  );
}
