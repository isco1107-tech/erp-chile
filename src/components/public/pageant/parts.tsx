import type { ReactNode } from 'react';

/**
 * Piezas visuales compartidas por el micrositio del certamen y su página de
 * postulación: el cielo nocturno del hero, el marco de esquinas y el
 * encabezado numerado de cada sección. Solo presentación, sin estado.
 */

/** Estrellas del cielo del hero: posiciones deterministas (mismo HTML en servidor y navegador). */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 61 + 7) % 92,
  size: i % 5 === 0 ? 2.4 : i % 3 === 0 ? 1.6 : 1,
  delay: (i % 9) * 0.6,
  duration: 3.2 + (i % 6) * 0.8,
}));

/** Auroras, estrellas, grano y marco de esquinas del hero. Decorativo. */
export function HeroSky() {
  return (
    <>
      <div className="pgs-sky" aria-hidden="true">
        <span className="pgs-aurora is-one" />
        <span className="pgs-aurora is-two" />
        <span className="pgs-aurora is-three" />
        {STARS.map((star, i) => (
          <span
            key={i}
            className="pgs-star"
            style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }}
          />
        ))}
        <span className="pgs-grain" />
      </div>
      <div className="pgs-frame" aria-hidden="true">
        <span className="is-tl" />
        <span className="is-tr" />
        <span className="is-bl" />
        <span className="is-br" />
      </div>
    </>
  );
}

/** Encabezado de sección: "01 —— EL CERTAMEN". */
export function Kicker({ index, children, tone = 'night' }: { index?: string; children: ReactNode; tone?: 'night' | 'paper' }) {
  return (
    <p className={`pgs-kicker is-${tone}`}>
      {index && <span className="pgs-kicker-index">{index}</span>}
      {index && <span className="pgs-kicker-rule" aria-hidden="true" />}
      {children}
    </p>
  );
}

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}
