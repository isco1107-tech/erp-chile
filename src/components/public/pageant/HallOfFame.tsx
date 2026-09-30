'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { Chevron, Crown } from './icons';
import { Kicker } from './parts';

type Winner = PublicPageantSite['pastWinners'][number];

/**
 * Salón de la fama: ganadoras de ediciones anteriores. La más reciente va
 * destacada (foto grande, el año como numeral de contorno y el pie de foto en
 * la tipografía de gala); el resto en un carrusel horizontal con tarjetas
 * verticales que se desliza con el dedo, el teclado o las flechas.
 *
 * Todo texto viene del panel del certamen (nombre, título, año, nota), así
 * que se muestra tal cual y nunca se inventa: sin año, no hay numeral.
 */

function caption(w: Winner): string {
  return [w.title, w.year].filter(Boolean).join(' ');
}

function Photo({ winner, eager = false }: { winner: Winner; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={winner.photoUrl} alt={`${winner.name}, ${caption(winner)}`} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  );
}

export function HallOfFame({ winners, index }: { winners: Winner[]; index: string }) {
  const [lead, ...others] = winners;
  const rail = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [measure, others.length]);

  if (!lead) return null;

  const years = winners.map((w) => w.year).filter((y): y is number => y != null);
  const span = years.length > 1 ? `${Math.min(...years)} – ${Math.max(...years)}` : years.length === 1 ? String(years[0]) : null;
  const scrollBy = (direction: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <section id="ganadoras" className="pgs-section is-night is-deep pgs-hof" aria-labelledby="pgs-hof-title">
      <div className="pgs-wrap">
        <div className={`pgs-section-head ${others.length === 0 ? 'is-center' : 'is-split'}`} data-reveal>
          <div>
            <Kicker index={index}>Salón de la fama</Kicker>
            <h2 id="pgs-hof-title" className="pgs-h2">
              Nuestras <em>{others.length === 0 && winners.length === 1 ? 'ganadora' : 'ganadoras'}</em>
            </h2>
          </div>
          {span && others.length > 0 && <p className="pgs-hof-span">Ediciones {span}</p>}
        </div>

        <figure className={`pgs-hof-lead${others.length === 0 ? ' is-solo' : ''}`} data-reveal>
          <span className="pgs-hof-photo">
            <Crown className="pgs-hof-crown" />
            <Photo winner={lead} eager />
          </span>
          <figcaption className="pgs-hof-copy">
            {lead.year != null && (
              <span className="pgs-hof-year" aria-hidden="true">
                {lead.year}
              </span>
            )}
            <span className="pgs-hof-title">
              <Crown className="pgs-hof-title-icon" />
              {lead.title}
              {lead.year != null && <span className="pgs-sr"> {lead.year}</span>}
            </span>
            <span className="pgs-hof-name">{lead.name}</span>
            {lead.note && <span className="pgs-hof-note">{lead.note}</span>}
          </figcaption>
        </figure>

        {others.length > 0 && (
          <>
            <div className="pgs-hof-bar" data-reveal>
              <p className="pgs-eyebrow">Ediciones anteriores</p>
              <div className="pgs-hof-nav">
                <button type="button" onClick={() => scrollBy(-1)} disabled={!edges.prev} aria-label="Ver ganadoras anteriores">
                  <Chevron direction="left" />
                </button>
                <button type="button" onClick={() => scrollBy(1)} disabled={!edges.next} aria-label="Ver más ganadoras">
                  <Chevron direction="right" />
                </button>
              </div>
            </div>
            <ul ref={rail} className="pgs-hof-rail" role="list" tabIndex={0} aria-label="Ganadoras de ediciones anteriores" onScroll={measure} data-reveal>
              {others.map((w) => (
                <li key={w.id}>
                  <figure className="pgs-hof-card">
                    <span className="pgs-hof-card-photo">
                      <Photo winner={w} />
                      <span className="pgs-hof-card-shade" aria-hidden="true" />
                      {w.year != null && (
                        <span className="pgs-hof-card-year" aria-hidden="true">
                          {w.year}
                        </span>
                      )}
                      <figcaption className="pgs-hof-card-caption">
                        <span className="pgs-hof-card-title">{w.title}</span>
                        <span className="pgs-hof-card-name" data-truncate>
                          {w.name}
                        </span>
                        {w.note && (
                          <span className="pgs-hof-card-note" data-truncate>
                            {w.note}
                          </span>
                        )}
                      </figcaption>
                    </span>
                  </figure>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
