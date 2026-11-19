import type { CSSProperties, ReactNode } from 'react';
import { headingSize, type PageantTitle } from '@/lib/events/pageant-site';

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

/** Polvo dorado que sube lento por el hero (bokeh). Posiciones deterministas. */
const DUST = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 43 + 5) % 100,
  size: 3 + (i % 4) * 2.5,
  delay: (i * 1.3) % 14,
  duration: 14 + (i % 5) * 3,
  drift: ((i % 7) - 3) * 12,
}));

/** Focos de escenario, reflejos dorados, polvo, auroras, estrellas, grano y marco de esquinas del hero. Decorativo. */
export function HeroSky() {
  return (
    <>
      <div className="pgs-sky" aria-hidden="true">
        <span className="pgs-sheen" />
        <span className="pgs-beam is-left" />
        <span className="pgs-beam is-right" />
        <span className="pgs-beam is-center" />
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
        {DUST.map((dust, i) => (
          <span
            key={`d${i}`}
            className="pgs-dust"
            style={
              {
                left: `${dust.left}%`,
                width: dust.size,
                height: dust.size,
                animationDelay: `${dust.delay}s`,
                animationDuration: `${dust.duration}s`,
                '--pgs-drift': `${dust.drift}px`,
              } as CSSProperties
            }
          />
        ))}
        <span className="pgs-stage" />
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

/**
 * Encabezado y texto de «El certamen». Los usan el micrositio y la vista previa
 * del panel (Sitio público → «Sobre el certamen»): así lo que se ve al escribir
 * es exactamente lo que se publica.
 */
export function AboutHeading({ title, index, titleId, reveal = false }: { title: PageantTitle; index?: string; titleId?: string; reveal?: boolean }) {
  const shortName = [title.lead, title.main].filter(Boolean).join(' ');
  return (
    <div className="pgs-about-head" data-reveal={reveal ? '' : undefined}>
      <Kicker index={index} tone="paper">
        El certamen
      </Kicker>
      <h2 id={titleId} className={`pgs-h2 is-ink ${headingSize(shortName)}`.trim()}>
        {title.lead ? (
          <>
            {title.lead} <em>{title.main}</em>
          </>
        ) : (
          <em>{title.main}</em>
        )}
      </h2>
    </div>
  );
}

export function AboutProse({ paragraphs, reveal = false }: { paragraphs: string[]; reveal?: boolean }) {
  return (
    <div className="pgs-prose" data-reveal={reveal ? '' : undefined}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i === 0 ? 'is-lead' : undefined}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}
