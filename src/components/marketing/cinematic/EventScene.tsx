'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { segments } from '../Segments';
import EventMock, { type EventMockView } from './EventMock';
import { tabKeys } from './tabs';
import s from './v2.module.css';

/** Las tres pantallas del módulo de certámenes (EventMock.tsx, con datos de ejemplo). */
const gallery: readonly { view: EventMockView; title: string; text: string }[] = [
  { view: 'casting', title: 'Postulación y acreditación', text: 'Las postulaciones llegan a un tablero por etapa y, el día del evento, cada acreditado entra con su código QR.' },
  { view: 'show', title: 'Escaleta minuto a minuto', text: 'Modo show con el bloque al aire, el que sigue y el tiempo real contra el planificado.' },
  { view: 'judging', title: 'Escrutinio y coronación', text: 'El jurado puntúa por enlace, cada criterio con su peso, y el ranking se calcula solo.' },
];

/**
 * «Del casting a la corona.»: una pantalla a la vez, elegida desde la lista
 * de la izquierda (antes eran tres cuadros apilados, casi dos pantallas en
 * móvil). Las tres quedan montadas en la misma celda para fundirse; sin
 * JavaScript se ven apiladas y la lista se oculta (ver v2.module.css).
 */
export default function EventScene() {
  const [active, setActive] = useState(0);

  return (
    <section id="para-quien" className={`${s.section} ${s.events}`} aria-labelledby="para-quien-title">
      <div className={s.eventsSide}>
        <p className={s.kicker}>{segments[2].label}</p>
        <h2 id="para-quien-title" className={`${s.heading} ${s.headingMid}`}><span className={s.display}>Del casting a la corona.</span></h2>
        <p className={s.body}>{segments[2].text}</p>
        <div className={s.eventTabs} role="tablist" aria-label="Pantallas de certámenes" onKeyDown={event => tabKeys(event, active, gallery.length, setActive)}>
          {gallery.map((item, index) => (
            <button
              key={item.view}
              id={`event-tab-${item.view}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls={`event-panel-${item.view}`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
            >
              <span aria-hidden="true">0{index + 1}</span>{item.title}
            </button>
          ))}
        </div>
        <a className={s.textLink} href="#planes">Ver el plan para eventos <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>

      <div className={s.eventStage}>
        {gallery.map((item, index) => (
          <figure
            key={item.view}
            id={`event-panel-${item.view}`}
            role="tabpanel"
            aria-labelledby={`event-tab-${item.view}`}
            className={s.eventPanel}
            data-active={active === index || undefined}
          >
            <div className={s.galleryFrame}><EventMock view={item.view} /></div>
            <figcaption><strong>{item.title}.</strong> {item.text} <span>Vista ilustrativa · datos de ejemplo</span></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
