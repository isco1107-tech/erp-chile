'use client';

import Image from 'next/image';
import Link from 'next/link';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import StickyActions from '../StickyActions';
import { isLightweightDevice } from './device';
import { Cursor, Sky } from './LiveLayers';
import { useLiveMotion } from './useLiveMotion';
import s from './v2.module.css';

/** Titulares y antetítulos entran con el scroll (useLiveMotion); constante para no reiniciar el efecto. */
const liveClasses = [s.display, s.kicker] as const;

/**
 * Mapa de la página en escritorio: una estrella por sección, unidas por una
 * línea que se llena con el scroll. La estrella de la sección actual brilla.
 */
const starMap = [
  ['#plataforma', 'Plataforma'],
  ['#como-funciona', 'Cómo funciona'],
  ['#tributacion', 'Tributación'],
  ['#para-quien', 'Certámenes'],
  ['#planes', 'Planes'],
  ['#preguntas', 'Preguntas'],
  ['#cotizar', 'Cotizar'],
] as const;

/** Navegación mínima de escritorio: cuatro enlaces y el botón de demo. */
const primaryNav = [
  ['#plataforma', 'Plataforma'],
  ['#tributacion', 'Tributación'],
  ['#para-quien', 'Certámenes'],
  ['#planes', 'Planes'],
] as const;

/** El menú móvil lleva todas las anclas, en el orden de la página. */
const menuNav = [
  ['#como-funciona', 'Cómo funciona'],
  ['#plataforma', 'La plataforma'],
  ['#tributacion', 'Tributación chilena'],
  ['#para-quien', 'Para quién'],
  ['#planes', 'Planes'],
  ['#descargas', 'Descargas'],
  ['#cotizar', 'Cotizar para mi empresa'],
] as const;

interface ProductView {
  view: number;
  setView: (index: number) => void;
}

/** La pestaña activa de «Todo cuadra» también se elige desde otras secciones. */
const ProductViewContext = createContext<ProductView | null>(null);

export function useProductView(): ProductView {
  const value = useContext(ProductViewContext);
  if (!value) throw new Error('useProductView se usa dentro de LandingShell');
  return value;
}

/** Enlace a #plataforma que además deja seleccionada una vista del producto. */
export function ViewLink({ view, className, children }: { view: number; className?: string; children: ReactNode }) {
  const { setView } = useProductView();
  return <a href="#plataforma" className={className} onClick={() => setView(view)}>{children}</a>;
}

export default function LandingShell({ className, children }: { className?: string; children: ReactNode }) {
  const [view, setView] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const cosmos = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLElement>(null);
  const mapFill = useRef<HTMLSpanElement>(null);
  const productView = useMemo(() => ({ view, setView }), [view]);

  useLiveMotion(root, cosmos, liveClasses);

  // Modo liviano (ahorro de datos, conexión lenta, poca memoria): lo marca en
  // la página para que el CSS simplifique (ver v2.module.css, [data-lite]).
  useEffect(() => {
    root.current?.toggleAttribute('data-lite', isLightweightDevice());
  }, []);

  // Estado de la cabecera, progreso de página y «dentro de la pista», escritos
  // directo al DOM: el scroll nunca vuelve a renderizar React.
  useEffect(() => {
    let frame = 0;
    let shown = { inTrack: false, pinned: false, current: -2, ratio: '' };
    let measured: typeof shown | null = null;
    const track = document.querySelector<HTMLElement>('[data-cinematic-track]');
    const scenes = [...document.querySelectorAll<HTMLElement>('[data-pinned-scene]')];
    const marks = map.current ? [...map.current.querySelectorAll<HTMLAnchorElement>('a')] : [];
    const sections = marks.map(mark => document.getElementById(mark.hash.slice(1)));
    // Las lecturas van en el evento de scroll (con el diseño al día); en
    // requestAnimationFrame solo se escribe, y solo lo que cambió.
    const read = () => {
      const headerHeight = header.current?.offsetHeight ?? 0;
      const viewport = window.innerHeight;
      const inTrack = track ? track.getBoundingClientRect().bottom > headerHeight : false;
      const pinned = inTrack || scenes.some(scene => {
        const rect = scene.getBoundingClientRect();
        return rect.top <= 1 && rect.bottom >= viewport;
      });
      const scrollable = document.documentElement.scrollHeight - viewport;
      const ratio = (scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0).toFixed(4);
      // Mapa de estrellas: la sección actual es la última cuyo borde ya pasó el 45 % de la ventana.
      let current = -1;
      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= viewport * 0.45) current = index;
      });
      measured = { inTrack, pinned, current, ratio };
    };
    const update = () => {
      frame = 0;
      const node = root.current;
      if (!node) return;
      if (!measured) read();
      if (!measured) return;
      const { inTrack, pinned, current, ratio } = measured;
      measured = null;
      if (inTrack !== shown.inTrack || pinned !== shown.pinned) {
        node.toggleAttribute('data-in-track', inTrack);
        node.toggleAttribute('data-pinned', pinned);
        header.current?.toggleAttribute('data-solid', !inTrack);
      }
      if (ratio !== shown.ratio && progress.current) progress.current.style.transform = `scaleX(${ratio})`;
      if (current !== shown.current) {
        marks.forEach((mark, index) => {
          mark.toggleAttribute('data-passed', index < current);
          if (index === current) mark.setAttribute('aria-current', 'location');
          else mark.removeAttribute('aria-current');
        });
        if (mapFill.current) mapFill.current.style.transform = `scaleY(${marks.length > 1 ? Math.max(0, current) / (marks.length - 1) : 0})`;
      }
      shown = { inTrack, pinned, current, ratio };
    };
    const onScroll = () => {
      read();
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Desplazamiento suave a las anclas solo mientras esta página está montada.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousBehavior = document.documentElement.style.scrollBehavior;
    if (!calm) document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      document.documentElement.style.scrollBehavior = previousBehavior;
    };
  }, []);

  // Las secciones fuera de pantalla usan content-visibility: auto, con altos
  // estimados. Antes de saltar a un ancla se pintan todas para que el destino
  // se calcule con los altos reales (y lo mismo si la página abre con #hash).
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const renderAll = () => node.setAttribute('data-full-render', '');
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link) renderAll();
    };
    node.addEventListener('click', onClick, true);
    if (window.location.hash.length > 1) {
      renderAll();
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    }
    return () => node.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <ProductViewContext.Provider value={productView}>
      <main ref={root} className={`${s.root} ${className ?? ''}`}>
        {/* El mismo cielo del hero sigue detrás de toda la página. */}
        <div ref={cosmos} className={s.cosmos} aria-hidden="true">
          <Sky />
        </div>
        <div className={s.pageProgress} aria-hidden="true"><div ref={progress} /></div>
        <a className={s.skip} href="#contenido">Ir al contenido</a>

        <header ref={header} className={s.header} data-open={menuOpen || undefined}>
          <div className={s.headerInner}>
            <a href="#contenido" className={s.brand} aria-label="Aether ERP, inicio">
              <Image src="/branding/aether-icon.png" alt="" width={26} height={30} />
              <span>Aether <span className={s.brandSuffix}>ERP</span></span>
            </a>
            <nav className={s.nav} aria-label="Navegación principal">
              {primaryNav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            </nav>
            <a className={s.headerCta} href="#cotizar">Solicitar demo <ArrowUpRight size={15} aria-hidden="true" /></a>
            <button
              ref={menuButton}
              type="button"
              className={s.menuButton}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              aria-controls="menu-landing-v2"
              onClick={() => setMenuOpen(open => !open)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
          <nav id="menu-landing-v2" className={s.menu} aria-label="Navegación móvil" hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
            {menuNav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            <Link href="/login">Ingresar al ERP</Link>
          </nav>
        </header>

        <nav ref={map} className={s.starmap} aria-label="Mapa de la página">
          <span className={s.starmapLine} aria-hidden="true"><span ref={mapFill} /></span>
          <ol>
            {starMap.map(([href, label]) => (
              <li key={href}><a href={href}><span className={s.starmapLabel}>{label}</span></a></li>
            ))}
          </ol>
        </nav>

        {children}

        {/* Barra fija en móvil y «volver arriba» en escritorio; se ocultan mientras hay una escena fijada. */}
        <div className={s.sticky}><StickyActions /></div>
        <Cursor />
      </main>
    </ProductViewContext.Provider>
  );
}
