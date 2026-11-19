'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * Textura «Pétalos»: pétalos que caen girando y destellos dorados que
 * titilan detrás del contenido de una sección. Solo se anima `transform` y
 * `opacity` (nada de `filter` ni mezclas sobre capas grandes), la animación
 * se pausa fuera de la pantalla (`data-offscreen`, igual que la cinta) y con
 * «menos movimiento» los pétalos quedan quietos, repartidos por la franja.
 *
 * Las posiciones son fijas (nunca `Math.random`): el HTML del servidor y la
 * hidratación coinciden y todos ven la misma composición.
 */
const PETALS: ReadonlyArray<{ x: number; y: number; size: number; delay: number; duration: number; drift: number; tone: 0 | 1 | 2 }> = [
  { x: 4, y: 12, size: 21, delay: 0, duration: 16, drift: 60, tone: 0 },
  { x: 13, y: 64, size: 16, delay: -7, duration: 19, drift: -40, tone: 1 },
  { x: 22, y: 30, size: 24, delay: -3, duration: 14, drift: 80, tone: 2 },
  { x: 31, y: 82, size: 18, delay: -11, duration: 21, drift: 50, tone: 0 },
  { x: 40, y: 8, size: 15, delay: -5, duration: 17, drift: -70, tone: 1 },
  { x: 49, y: 52, size: 22, delay: -13, duration: 15, drift: 40, tone: 0 },
  { x: 58, y: 22, size: 17, delay: -2, duration: 20, drift: -55, tone: 2 },
  { x: 67, y: 74, size: 20, delay: -9, duration: 18, drift: 65, tone: 1 },
  { x: 75, y: 40, size: 16, delay: -15, duration: 16, drift: -35, tone: 0 },
  { x: 83, y: 90, size: 23, delay: -6, duration: 22, drift: 45, tone: 2 },
  { x: 91, y: 18, size: 18, delay: -10, duration: 15, drift: -60, tone: 1 },
  { x: 97, y: 58, size: 15, delay: -4, duration: 19, drift: -30, tone: 0 },
];

const GLINTS: ReadonlyArray<{ x: number; y: number; delay: number }> = [
  { x: 8, y: 40, delay: 0 },
  { x: 19, y: 15, delay: -1.6 },
  { x: 35, y: 58, delay: -3.1 },
  { x: 52, y: 28, delay: -0.8 },
  { x: 63, y: 70, delay: -2.4 },
  { x: 79, y: 12, delay: -3.8 },
  { x: 88, y: 48, delay: -1.2 },
  { x: 95, y: 80, delay: -2.9 },
];

export default function PetalField() {
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

  return (
    <div ref={root} aria-hidden="true" className="ws-petals" data-offscreen="">
      {PETALS.map((p, i) => (
        <span
          key={`p${i}`}
          className={`ws-petal ws-petal-${p.tone}`}
          style={{ '--x': `${p.x}%`, '--y': p.y, '--s': `${p.size}px`, '--d': `${p.delay}s`, '--t': `${p.duration}s`, '--dx': `${p.drift}px` } as CSSProperties}
        />
      ))}
      {GLINTS.map((g, i) => (
        <span key={`g${i}`} className="ws-glint" style={{ '--x': `${g.x}%`, '--y': `${g.y}%`, '--d': `${g.delay}s` } as CSSProperties} />
      ))}
    </div>
  );
}
