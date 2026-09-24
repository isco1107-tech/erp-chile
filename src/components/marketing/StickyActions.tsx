'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import s from './landing.module.css';

/**
 * Barra de acción persistente en móvil y botón de volver arriba en escritorio.
 *
 * La visibilidad se escribe directo al DOM (igual que la barra de progreso de
 * la landing) para no re-renderizar React en cada evento de scroll. Se oculta
 * al llegar al cierre de la página, donde ya hay un CTA a la vista.
 */
export default function StickyActions() {
  const bar = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let frame = 0;
    // Se mide en el evento de scroll (con el diseño al día) y en
    // requestAnimationFrame solo se cambian las clases, y solo si cambiaron.
    let showBar = false;
    let showTop = false;
    const measure = () => {
      const offset = window.scrollY;
      const remaining = document.documentElement.scrollHeight - offset - window.innerHeight;
      showBar = offset > 620 && remaining > 780;
      showTop = offset > 1400;
    };
    const update = () => {
      frame = 0;
      if (bar.current && bar.current.classList.contains(s.stickyVisible) !== showBar) bar.current.classList.toggle(s.stickyVisible, showBar);
      if (top.current && top.current.classList.contains(s.stickyVisible) !== showTop) top.current.classList.toggle(s.stickyVisible, showTop);
    };
    const onScroll = () => {
      measure();
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className={s.stickyBar} ref={bar}>
        <Link href="/login">Ingresar</Link>
        <a href="#cotizar">Solicitar demo <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>
      <button className={s.toTop} ref={top} type="button" aria-label="Volver al inicio de la página" onClick={() => window.scrollTo({ top: 0 })}>
        <ArrowUp size={18} aria-hidden="true" />
      </button>
    </>
  );
}
