'use client';

import { getImageProps } from 'next/image';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';
import { startPlayer, type PlayerElements } from './player';
import { frameUrl } from './sequence';
import s from './sequence.module.css';

const facts = [
  ['01', 'Emite.', 'Documentos con folio del SII.'],
  ['02', 'Cuadra.', 'Stock, caja y F29 con datos reales.'],
  ['03', 'Corona.', 'Tu certamen, del casting a la final.'],
] as const;

/**
 * Capítulos del recorrido, con el tramo de P que ocupa cada uno. La guía es
 * decorativa (aria-hidden): acompaña los tramos en que solo corre el video.
 */
const chapters = [
  ['01', 'Cielo de Atacama', 0, 0.2],
  ['02', 'Vía Láctea', 0.2, 0.7],
  ['03', 'Aether', 0.7, 1.02],
] as const;

/** Mismos cortes que el CSS: el set móvil es un recorte vertical del cuadro. */
const MOBILE_QUERY = '(max-width: 760px)';
/** Con menos alto que esto el hero no cabe fijo: el contenido fluye apilado. */
const STATIC_QUERY = '(max-height: 560px)';
/**
 * Con movimiento reducido el video sigue avanzando con el scroll (lo mueve la
 * persona, no se anima solo), pero sin inercia: se detiene justo cuando ella se detiene.
 */
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Primer fotograma de v1 como `<picture>`: es el LCP y es idéntico al primer
 * cuadro que dibuja el canvas, así que el paso de uno a otro no se ve.
 */
function Poster() {
  const common = { alt: '', fill: true, sizes: '100vw', unoptimized: true } as const;
  const { props: desktop } = getImageProps({ ...common, src: frameUrl(0, 'd', 0), loading: 'eager', fetchPriority: 'high' });
  const { props: { src: mobileSrc } } = getImageProps({ ...common, src: frameUrl(0, 'm', 0) });
  return (
    <picture>
      <source media={MOBILE_QUERY} srcSet={mobileSrc} />
      <img {...desktop} alt="" className={s.poster} />
    </picture>
  );
}

export default function CinematicSequence() {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const inside = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const hud = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trackNode = track.current;
    if (!trackNode || !stage.current || !canvas.current || !intro.current || !inside.current || !fade.current || !line.current || !hud.current) return;
    const elements: PlayerElements = {
      track: trackNode, stage: stage.current, canvas: canvas.current,
      intro: intro.current, inside: inside.current, fade: fade.current, line: line.current, hud: hud.current,
    };
    if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const still = window.matchMedia(STATIC_QUERY);
    const mobile = window.matchMedia(MOBILE_QUERY);
    const reduced = window.matchMedia(REDUCED_QUERY);
    let stop: (() => void) | null = null;
    const restart = () => {
      stop?.();
      stop = still.matches ? null : startPlayer(elements, mobile.matches ? 'mobile' : 'desktop', manifest.boundary.crossfadeMs, !reduced.matches);
    };
    restart();
    const queries = [still, mobile, reduced];
    for (const query of queries) query.addEventListener('change', restart);
    return () => {
      stop?.();
      for (const query of queries) query.removeEventListener('change', restart);
    };
  }, []);

  return (
    <section id="contenido" ref={track} className={s.track} aria-labelledby="hero-title" data-cinematic-track>
      <div ref={stage} className={s.stage}>
        <div className={s.media} aria-hidden="true">
          <Poster />
          <canvas ref={canvas} className={s.canvas} />
          <div ref={fade} className={s.fade} />
        </div>

        <div ref={intro} className={s.intro}>
          <div className={s.copy}>
            <p className={s.eyebrow}>AETHER ERP / HECHO PARA CHILE</p>
            <h1 id="hero-title" className={s.title}>
              <span>Emite.</span> <span>Cuadra.</span> <span className={s.gold}>Corona.</span>
            </h1>
            <p className={s.lead}>Ventas, inventario, finanzas y producción de eventos en un solo lugar. Hecho para empresas chilenas.</p>
            <div className={s.actions}>
              <a className={s.primary} href="#cotizar" data-magnetic>Quiero conocer Aether <ArrowUpRight size={18} aria-hidden="true" /></a>
              <a className={s.secondary} href="#como-funciona">Ver cómo funciona <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
          </div>
          {/* La numeración es decorativa: no es una secuencia de pasos. */}
          <ul className={s.facts}>
            {facts.map(([number, title, text]) => (
              <li key={number}><span className={s.factNumber} aria-hidden="true">{number}</span><p><strong>{title}</strong> {text}</p></li>
            ))}
          </ul>
        </div>

        <div ref={inside} className={s.inside}>
          <h2 className={s.insideTitle}>Ahora, <br />estás dentro.</h2>
          <p>Lo que veías desde lejos es tu operación completa: del primer presupuesto al último pago.</p>
        </div>

        <div ref={hud} className={s.hud} aria-hidden="true">
          <ol className={s.chapters}>
            {chapters.map(([number, name, from, to]) => (
              <li key={number} data-from={from} data-to={to}>
                <span className={s.chapterName}>{name}</span>
                <span className={s.chapterNumber}>{number}</span>
                <span className={s.chapterBar}><span /></span>
              </li>
            ))}
          </ol>
          <p className={s.cue}>Desliza para entrar <span /></p>
        </div>

        <div className={s.line} aria-hidden="true"><span ref={line} /></div>
      </div>
    </section>
  );
}
