'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import s from './empresas.module.css';

/**
 * Único trozo de JavaScript del header: hamburguesa + panel a pantalla
 * completa con las mismas anclas y los mismos dos botones que el header de
 * escritorio. Atrapa el foco, cierra con Escape y al hacer clic en un enlace
 * (mismo patrón que `Landing.tsx`/`LandingShell.tsx`).
 */
export default function MobileMenu({ navLinks }: { navLinks: [href: string, label: string][] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusable = panel ? Array.from(panel.querySelectorAll<HTMLElement>('a[href], button')) : [];
    focusable[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={s.menuButton}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} ref={panelRef} className={s.mobilePanel} role="dialog" aria-modal="true" aria-label="Navegación de Aether ERP">
          <nav className={s.mobileNav} aria-label="Navegación móvil" onClick={() => setOpen(false)}>
            {navLinks.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className={s.mobileActions}>
            <Link href="/login" className={s.btnSecondary} onClick={() => setOpen(false)}>
              Ingresar
            </Link>
            <a href="#cotizar" className={s.btnPrimary} onClick={() => setOpen(false)}>
              Solicitar demo <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </>
  );
}
