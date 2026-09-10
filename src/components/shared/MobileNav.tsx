'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const MobileNavContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

/**
 * El toggle (header) y el drawer (sidebar) son elementos hermanos en el
 * layout, no anidados — comparten estado vía contexto en vez de levantar el
 * open/close a un solo componente que tendría que envolver a ambos.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el drawer al navegar: el layout no se remonta entre rutas del
  // dashboard, así que sin esto quedaría abierto tapando la página nueva.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav debe usarse dentro de MobileNavProvider');
  return ctx;
}

export function MobileNavToggle() {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
      aria-expanded={open}
      aria-controls="workspace-navigation"
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground lg:hidden"
    >
      {open ? <X className="size-[18px]" strokeWidth={1.75} /> : <Menu className="size-[18px]" strokeWidth={1.75} />}
    </button>
  );
}

export function MobileNavBackdrop() {
  const { open, setOpen } = useMobileNav();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="Cerrar menú"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-20 bg-black/40 lg:hidden"
    />
  );
}

export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    if (desktop.matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onResize);
      previousFocus?.focus();
    };
  }, [open, setOpen]);

  return (
    <div
      ref={drawerRef}
      id="workspace-navigation"
      onClick={(event) => { if ((event.target as HTMLElement).closest('a[href]')) setOpen(false); }}
      className={`fixed inset-y-0 left-0 z-30 w-[260px] transition-[transform,visibility] duration-200 ease-out lg:visible lg:translate-x-0 print:hidden ${
        open ? 'visible translate-x-0' : 'invisible -translate-x-full'
      }`}
    >
      <button type="button" aria-label="Cerrar navegación" onClick={() => setOpen(false)} className="absolute top-1 right-1 z-1 rounded-lg p-2 text-sidebar-foreground hover:text-white lg:hidden"><X className="size-4" /></button>
      {children}
    </div>
  );
}
