'use client';

import { getImageProps } from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';
import { isLightweightDevice } from './device';
import { startPlayer } from './player';
import { FINALE_TIMING, finaleChoreography, finaleLastFrame, frameUrl } from './sequence';
import s from './sequence.module.css';

/** Mismos cortes que el hero (CinematicSequence) y que el CSS. */
const MOBILE_QUERY = '(max-width: 760px)';
const STATIC_QUERY = '(max-height: 560px)';

/** Último fotograma de v2 que usa el cierre, por set: el logo armado sobre el cielo oscuro. */
const lastFrame = {
  desktop: finaleLastFrame(manifest.clips.v2.desktop.count, manifest.clips.v2.desktop.fps, manifest.clips.v2.desktop.light),
  mobile: finaleLastFrame(manifest.clips.v2.mobile.count, manifest.clips.v2.mobile.fps, manifest.clips.v2.mobile.light),
} as const;

/**
 * Primer fotograma de v2 (la galaxia con la que terminó el hero). Se carga
 * diferido: está al final de la página. Sin JavaScript es lo que se ve.
 */
function Poster() {
  const common = { alt: '', fill: true, sizes: '100vw', unoptimized: true } as const;
  const { props: desktop } = getImageProps({ ...common, src: frameUrl(1, 'd', 0) });
  const { props: { src: mobileSrc } } = getImageProps({ ...common, src: frameUrl(1, 'm', 0) });
  return (
    <picture>
      <source media={MOBILE_QUERY} srcSet={mobileSrc} />
      <img {...desktop} alt="" className={s.poster} />
    </picture>
  );
}

function clearClose(node: HTMLElement) {
  node.style.removeProperty('opacity');
  node.style.removeProperty('transform');
  node.removeAttribute('data-hidden');
}

/**
 * Cierre de la landing: v2 avanza con el scroll y la galaxia en que terminó
 * el hero se arma en el logo de Aether; con el logo llegan «Dale Aether.» y
 * el botón de cotizar. Así el video abre y cierra la página en vez de
 * gastarse entero arriba, y el recorrido termina oscuro, como el pie.
 *
 * Usa el mismo motor que el hero (player.ts). Empieza a descargar sus
 * fotogramas cuando está a una pantalla y media de aparecer.
 */
export default function CinematicFinale() {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const close = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trackNode = track.current;
    const closeNode = close.current;
    if (!trackNode || !stage.current || !canvas.current || !closeNode) return;
    if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const scene = { track: trackNode, stage: stage.current, canvas: canvas.current };
    const still = window.matchMedia(STATIC_QUERY);
    const mobile = window.matchMedia(MOBILE_QUERY);
    const stride = isLightweightDevice() ? 3 : 1;
    let stop: (() => void) | null = null;
    const halt = () => {
      stop?.();
      stop = null;
      clearClose(closeNode);
    };
    const restart = () => {
      halt();
      if (still.matches) return;
      const set = mobile.matches ? 'mobile' : 'desktop';
      stop = startPlayer(scene, {
        clip: 1, set, timing: FINALE_TIMING, last: lastFrame[set], stride, lookahead: '150% 0px',
        onProgress: progress => {
          const { close: opacity, closeShift } = finaleChoreography(progress);
          closeNode.style.opacity = opacity.toFixed(3);
          closeNode.style.transform = `translate3d(0, ${closeShift.toFixed(1)}px, 0)`;
          // Lo que no se ve tampoco se enfoca ni se lee: `visibility: hidden` en CSS.
          closeNode.toggleAttribute('data-hidden', opacity < 0.02);
        },
      });
    };
    restart();
    const queries = [still, mobile];
    for (const query of queries) query.addEventListener('change', restart);
    return () => {
      halt();
      for (const query of queries) query.removeEventListener('change', restart);
    };
  }, []);

  return (
    <section id="cierre" ref={track} className={`${s.track} ${s.finale}`} aria-labelledby="cierre-title" data-pinned-scene data-finale-track>
      <div ref={stage} className={s.stage}>
        <div className={s.media} aria-hidden="true">
          <Poster />
          <canvas ref={canvas} className={s.canvas} />
          <div className={s.finaleShade} />
        </div>

        <div className={s.finaleCopy}>
          <div className={s.finaleLead}>
            <p className={s.eyebrow}>TU EMPRESA YA TIENE EL POTENCIAL</p>
            <h2 id="cierre-title" className={s.finaleTitle}>Dale espacio para crecer.</h2>
          </div>
          <div ref={close} className={s.finaleClose}>
            <p className={`${s.finaleTitle} ${s.gold}`}>Dale Aether.</p>
            <a className={s.primary} href="#modulos" data-magnetic>Arma tu cotización <ArrowUpRight size={18} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
