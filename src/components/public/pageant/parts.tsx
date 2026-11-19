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

/** Encabezado de sección: "01 —— EL CERTAMEN". En el editor visual el texto se puede editar con doble clic (`editable`). */
export function Kicker({ index, children, tone = 'night', editable = false }: { index?: string; children: ReactNode; tone?: 'night' | 'paper'; editable?: boolean }) {
  return (
    <p className={`pgs-kicker is-${tone}`}>
      {index && <span className="pgs-kicker-index">{index}</span>}
      {index && <span className="pgs-kicker-rule" aria-hidden="true" />}
      {editable ? <span data-edit-field="kicker">{children}</span> : children}
    </p>
  );
}

/**
 * Título de dos partes de las secciones del micrositio: la normal y la palabra
 * en cursiva («Conoce a *las candidatas*»). Cualquiera puede venir vacía. En el
 * editor visual cada parte se marca para editarla con doble clic.
 */
export function HeadingText({ lead, accent, editable = false }: { lead: string; accent: string; editable?: boolean }) {
  return (
    <>
      {lead ? editable ? <span data-edit-field="title">{lead}</span> : lead : null}
      {lead && accent ? ' ' : null}
      {accent ? <em {...(editable ? { 'data-edit-field': 'titleAccent' } : {})}>{accent}</em> : null}
    </>
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
export function AboutHeading({
  title,
  index,
  titleId,
  reveal = false,
  kicker = 'El certamen',
  lead,
  accent,
  editable = false,
}: {
  title: PageantTitle;
  index?: string;
  titleId?: string;
  reveal?: boolean;
  /** Textos propios del editor visual; sin ellos, «El certamen» y el nombre del certamen. */
  kicker?: string;
  lead?: string;
  accent?: string;
  editable?: boolean;
}) {
  const shownLead = lead ?? title.lead;
  const shownAccent = accent ?? title.main;
  return (
    <div className="pgs-about-head" data-reveal={reveal ? '' : undefined}>
      {(index || kicker) && (
        <Kicker index={index} tone="paper" editable={editable}>
          {kicker}
        </Kicker>
      )}
      {(shownLead || shownAccent) && (
        <h2 id={titleId} className={`pgs-h2 is-ink ${headingSize([shownLead, shownAccent].filter(Boolean).join(' '))}`.trim()}>
          <HeadingText lead={shownLead} accent={shownAccent} editable={editable} />
        </h2>
      )}
    </div>
  );
}

export function AboutProse({ paragraphs, reveal = false, editable = false }: { paragraphs: string[]; reveal?: boolean; editable?: boolean }) {
  return (
    <div className="pgs-prose" data-reveal={reveal ? '' : undefined} {...(editable ? { 'data-edit-field': 'description' } : {})}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i === 0 ? 'is-lead' : undefined}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}
