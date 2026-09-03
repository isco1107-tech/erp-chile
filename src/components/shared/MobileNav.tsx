'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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
  const { open } = useMobileNav();
  return (
    <div
      className={`fixed inset-y-0 left-0 z-30 w-[260px] transition-transform duration-200 ease-out lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {children}
    </div>
  );
}
