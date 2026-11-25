'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const DRAWER_ID = 'workspace-sidebar';
const DESKTOP_QUERY = '(min-width: 80rem)';
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';

function subscribeToDesktop(update: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}

interface MobileNavState {
  open: boolean;
  isDesktop: boolean;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
  show: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = !isDesktop && openedOn !== null && openedOn === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpenedOn(null);
  }, [isDesktop, pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpenedOn(null);
    // El botón vuelve a participar en el foco después de quitar `inert`.
    requestAnimationFrame(() => toggleRef.current?.focus());
  }

  return (
    <MobileNavContext.Provider value={{ open, isDesktop, toggleRef, show: () => setOpenedOn(pathname), close }}>
      {children}
    </MobileNavContext.Provider>
  );
}

function useMobileNav() {
  const context = useContext(MobileNavContext);
  if (!context) throw new Error('useMobileNav debe usarse dentro de MobileNavProvider');
  return context;
}

export function MobileNavToggle() {
  const { open, show, toggleRef } = useMobileNav();
  return (
    <button
      ref={toggleRef}
      type="button"
      onClick={show}
      aria-label="Abrir menú"
      aria-expanded={open}
      aria-controls={DRAWER_ID}
      aria-haspopup="dialog"
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring xl:hidden"
    >
      <Menu className="size-5" aria-hidden="true" />
    </button>
  );
}

export function MobileNavContent({ children }: { children: ReactNode }) {
  const { open } = useMobileNav();
  return (
    <div inert={open} aria-hidden={open || undefined} className="flex min-h-dvh min-w-0 flex-col xl:pl-[17rem] print:pl-0">
      {children}
    </div>
  );
}

export function MobileNavDrawer({ children }: { children: ReactNode }) {
  const { open, isDesktop, close } = useMobileNav();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = stops[0];
    const last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <>
      {open && <div role="presentation" onClick={close} className="fixed inset-0 z-30 bg-brand-ink/60 xl:hidden print:hidden" />}
      <div
        id={DRAWER_ID}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={open ? 'Menú principal' : undefined}
        inert={!isDesktop && !open}
        onKeyDown={handleKeyDown}
        onClickCapture={(event) => {
          if (open && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
            && (event.target as HTMLElement).closest('a[href]:not([target="_blank"])')) close();
        }}
        className={`fixed inset-y-0 left-0 z-40 w-[min(20rem,calc(100%-2rem))] motion-safe:transition-transform motion-safe:duration-200 xl:visible xl:w-[17rem] xl:translate-x-0 print:hidden ${open ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-full'}`}
      >
        <button
          ref={closeRef}
          type="button"
          aria-label="Cerrar menú"
          onClick={close}
          className="absolute top-2 right-2 z-10 flex size-11 items-center justify-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring xl:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </>
  );
}
