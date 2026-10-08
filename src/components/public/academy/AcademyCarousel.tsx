'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chevron } from '@/components/public/pageant/icons';

/**
 * Carrusel de fotos de la academia: desplazamiento con snap (se desliza con el
 * dedo o la rueda), flechas, puntos y avance automático suave. El avance se
 * detiene si la persona lo toca o lo enfoca, si el carrusel sale de pantalla o
 * si prefiere menos movimiento: una animación nunca debe pelear con quien lee.
 */

const AUTOPLAY_MS = 5500;

export function AcademyCarousel({ photos, label }: { photos: Array<{ url: string; caption: string }>; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);

  const goTo = useCallback(
    (next: number) => {
      const track = trackRef.current;
      if (!track || photos.length === 0) return;
      const target = (next + photos.length) % photos.length;
      const slide = track.children[target] as HTMLElement | undefined;
      if (!slide) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Se mueve solo el carrusel (scrollTo del contenedor), no la página. El contenedor posicionado es
      // `.acs-carousel`, cuyo borde izquierdo coincide con el de la pista. En teléfono la foto se centra.
      const centered = window.innerWidth < 900 ? (track.clientWidth - slide.clientWidth) / 2 : 0;
      track.scrollTo({ left: slide.offsetLeft - centered, behavior: reduced ? 'auto' : 'smooth' });
      setIndex(target);
    },
    [photos.length]
  );

  // Qué foto está al centro mientras se desliza a mano.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const center = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDistance = Infinity;
        Array.from(track.children).forEach((child, i) => {
          const el = child as HTMLElement;
          const distance = Math.abs(el.offsetLeft + el.clientWidth / 2 - center);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        });
        setIndex(best);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)));
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible || photos.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => goTo(index + 1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [goTo, index, paused, photos.length, visible]);

  if (photos.length === 0) return null;

  return (
    <div
      className="acs-carousel"
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div ref={trackRef} className="acs-track" tabIndex={0} aria-live="off">
        {photos.map((photo, i) => (
          <figure key={`${photo.url}-${i}`} className="acs-slide" aria-label={`Foto ${i + 1} de ${photos.length}`}>
            <div className="acs-slide-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || `${label}, foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
            </div>
            {photo.caption && <figcaption>{photo.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="acs-ctrl">
          <div className="acs-dots">
            {photos.map((_, i) => (
              <button key={i} type="button" className="acs-dot" aria-label={`Ver la foto ${i + 1}`} aria-current={i === index} onClick={() => goTo(i)} />
            ))}
          </div>
          <div className="acs-arrows">
            <button type="button" className="acs-arrow" aria-label="Foto anterior" onClick={() => goTo(index - 1)}>
              <Chevron direction="left" />
            </button>
            <button type="button" className="acs-arrow" aria-label="Foto siguiente" onClick={() => goTo(index + 1)}>
              <Chevron direction="right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
