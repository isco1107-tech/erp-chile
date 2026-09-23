'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const DRAWER_ID = 'workspace-sidebar';
/** Mismo corte que `lg:` de Tailwind: desde ahí el sidebar es fijo y siempre visible. */
const DESKTOP_QUERY = '(min-width: 1024px)';

interface MobileNavState {
  open: boolean;
  setOpen: (open: boolean) => void;
  isDesktop: boolean;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

/**
 * El toggle (header) y el drawer (sidebar) son elementos hermanos en el
 * layout, no anidados — comparten estado vía contexto en vez de levantar el
 * open/close a un solo componente que tendría que envolver a ambos.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Arranca en `true` para que el HTML del servidor no marque el sidebar como
  // `inert` en escritorio (el caso común); en móvil se corrige al montar.
  const [isDesktop, setIsDesktop] = useState(true);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Cierra el drawer al navegar: el layout no se remonta entre rutas del
  // dashboard, así que sin esto quedaría abierto tapando la página nueva.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Escape cierra y devuelve el foco al botón que lo abrió; mientras está
  // abierto en móvil, el fondo no hace scroll.
  useEffect(() => {
    if (!open || isDesktop) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isDesktop]);

  return <MobileNavContext.Provider value={{ open, setOpen, isDesktop, toggleRef }}>{children}</MobileNavContext.Provider>;
}

function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav debe usarse dentro de MobileNavProvider');
  return ctx;
}

export function MobileNavToggle() {
  const { open, setOpen, toggleRef } = useMobileNav();
  return (
    <button
      ref={toggleRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
      aria-expanded={open}
      aria-controls={DRAWER_ID}
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground lg:hidden"
    >
      {open ? <X className="size-[18px]" strokeWidth={1.75} /> : <Menu className="size-[18px]" strokeWidth={1.75} />}
    </button>
  );
}

export function MobileNavBackdrop() {
  const { open, setOpen, toggleRef } = useMobileNav();
  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={() => {
        setOpen(false);
        toggleRef.current?.focus();
      }}
      className="fixed inset-0 z-20 bg-neutral-950/40 backdrop-blur-[2px] lg:hidden"
    />
  );
}

export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const { open, isDesktop } = useMobileNav();
  const hidden = !isDesktop && !open;
  const drawerRef = useRef<HTMLDivElement>(null);

  // Al abrir en móvil, el foco entra al menú (primer enlace) en vez de
  // quedarse detrás, en el botón del header.
  useEffect(() => {
    if (open && !isDesktop) drawerRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
  }, [open, isDesktop]);

  return (
    <div
      id={DRAWER_ID}
      ref={drawerRef}
      // Cerrado en móvil: fuera de pantalla Y fuera del orden de tabulación /
      // del árbol accesible. Sin `inert`, Tab recorría enlaces invisibles.
      inert={hidden}
      className={`fixed inset-y-0 left-0 z-30 w-[260px] transition-transform duration-200 ease-out lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {children}
    </div>
  );
}
