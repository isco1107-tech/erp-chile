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
    const update = () => {
      frame = 0;
      const offset = window.scrollY;
      const remaining = document.documentElement.scrollHeight - offset - window.innerHeight;
      bar.current?.classList.toggle(s.stickyVisible, offset > 620 && remaining > 780);
      top.current?.classList.toggle(s.stickyVisible, offset > 1400);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
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
