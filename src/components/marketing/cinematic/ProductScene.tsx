'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleCheck, Expand, X } from 'lucide-react';
import ProductMock from '../ProductMock';
import { views } from '../catalog';
import { useProductView } from './LandingShell';
import { tabKeys } from './tabs';
import s from './v2.module.css';

/** Lo que dura el fundido cruzado entre vistas (el CSS usa el mismo valor). */
const SWAP_MS = 400;

/**
 * Escena 3, «Todo cuadra.»: cuadro de producto a la izquierda, titular a la
 * derecha y pestañas debajo. Solo se monta la vista activa (y la saliente
 * mientras dura el fundido): cada ilustración son ~200 nodos de SVG.
 */
export default function ProductScene() {
  const { view: active, setView } = useProductView();
  const [leaving, setLeaving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = useRef(active);
  const root = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const view = views[active];

  useEffect(() => {
    const node = root.current;
    node?.setAttribute('data-tabs-ready', '');
    return () => node?.removeAttribute('data-tabs-ready');
  }, []);

  useEffect(() => {
    if (shown.current === active) return;
    setLeaving(shown.current);
    shown.current = active;
    const timer = window.setTimeout(() => setLeaving(null), SWAP_MS + 40);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (expanded && !dialog.current?.open) dialog.current?.showModal();
  }, [expanded]);

  const shots = leaving === null || leaving === active ? [active] : [leaving, active];

  return (
    <section id="plataforma" ref={root} className={`${s.section} ${s.product}`} aria-labelledby="plataforma-title">
      <div className={s.productHead}>
        <p className={s.kicker}>CONOCE TU PRÓXIMO ERP</p>
        <h2 id="plataforma-title" className={s.heading}>
          <span className={s.display}>Todo cuadra.</span>{' '}
          <span className={s.subhead}>Todo se entiende mejor cuando está conectado.</span>
        </h2>
        <p className={s.body}>Del primer presupuesto al último pago. Aether reúne las áreas de tu empresa para que puedas ver el panorama completo.</p>
      </div>

      <div id="product-panel" role="tabpanel" aria-labelledby={`product-tab-${active}`} className={s.productPanel}>
        <figure className={s.productFigure} data-live>
          <div className={s.productBox} data-tilt>
            {shots.map(index => (
              <div key={views[index].image} className={s.productShot} data-state={leaving === null ? undefined : index === active ? 'in' : 'out'}>
                <ProductMock view={views[index].image} />
              </div>
            ))}
            <button type="button" className={s.expand} title="Ampliar vista" aria-label={`Ampliar vista de ${view.label}`} onClick={() => setExpanded(true)}>
              <Expand size={18} aria-hidden="true" />
            </button>
          </div>
          <figcaption>Vista ilustrativa · datos de ejemplo</figcaption>
        </figure>

        <div className={s.productCopies}>
          {views.map((item, index) => (
            <div key={item.image} className={s.productCopy} data-active={index === active || undefined}>
              <p className={s.viewTag}><span>0{index + 1}</span>{item.label}</p>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>{item.points.map(point => <li key={point}><CircleCheck size={16} aria-hidden="true" />{point}</li>)}</ul>
              <a className={s.textLink} href="#cotizar">Quiero verlo para mi empresa <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          ))}
        </div>
      </div>

      <div className={s.tabs} role="tablist" aria-label="Vistas del ERP" onKeyDown={event => tabKeys(event, active, views.length, setView)}>
        {views.map((item, index) => (
          <button
            key={item.image}
            id={`product-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls="product-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setView(index)}
          >
            <item.icon size={17} aria-hidden="true" />{item.label}
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        className={s.lightbox}
        aria-label={`Vista ampliada: ${view.label}`}
        onClose={() => setExpanded(false)}
        onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        {expanded && (
          <div className={s.lightboxBody}>
            <button type="button" className={s.lightboxClose} aria-label="Cerrar vista ampliada" onClick={() => dialog.current?.close()} autoFocus><X aria-hidden="true" /></button>
            <div className={s.lightboxFrame}><ProductMock view={view.image} /></div>
            <p>{view.label} · vista ilustrativa con datos de ejemplo</p>
          </div>
        )}
      </dialog>
    </section>
  );
}
