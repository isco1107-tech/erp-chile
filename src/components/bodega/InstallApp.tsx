'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Download, Smartphone } from 'lucide-react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallContext = createContext<{ installed: boolean; install(): Promise<boolean> } | null>(null);

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function subscribeStandalone(listener: () => void) {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

/** Shared by the login and the warehouse so an install prompt survives client navigation. */
export function WarehouseInstallProvider({ children }: { children: ReactNode }) {
  const prompt = useRef<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const inApp = useSyncExternalStore(subscribeStandalone, standalone, () => false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
    };
    const onInstalled = () => {
      prompt.current = null;
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Register before signing in too: installation must not depend on warehouse bootstrap.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/bodega-sw.js', { scope: '/bodega' }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const event = prompt.current;
    if (!event) return false;
    // Browser install prompts can only be used once. A dismissal is not an installation.
    prompt.current = null;
    try {
      await event.prompt();
      await event.userChoice;
      return true;
    } catch {
      return false;
    }
  }, []);

  return <InstallContext.Provider value={{ installed: installed || inApp, install }}>{children}</InstallContext.Provider>;
}

export default function InstallApp() {
  const context = useContext(InstallContext);
  const [guide, setGuide] = useState<'iphone' | 'android' | 'desktop' | null>(null);
  const [busy, setBusy] = useState(false);
  if (!context) throw new Error('InstallApp requires WarehouseInstallProvider');
  if (context.installed) return null;

  const download = async () => {
    setBusy(true);
    setGuide(null);
    try {
      if (await context.install()) return;
      const agent = navigator.userAgent;
      const iphone = /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setGuide(iphone ? 'iphone' : /Android/i.test(agent) ? 'android' : 'desktop');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Instalar Bodega móvil" className="rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={() => void download()} disabled={busy} aria-expanded={guide !== null} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60">
        <Download className="size-5 shrink-0" aria-hidden="true" />
        {busy ? 'Abriendo instalación…' : 'Descargar app'}
      </button>
      <p className="mt-2 text-center text-sm text-muted-foreground">Guarda Bodega móvil en el inicio de tu teléfono.</p>
      {guide ? (
        <div role="status" className="mt-3 rounded-xl bg-muted p-3 text-sm leading-relaxed">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Smartphone className="size-4" aria-hidden="true" /> Agregar al inicio</p>
          {guide === 'iphone' ? (
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abre esta página en Safari.</li>
              <li>Toca Compartir y luego «Agregar a pantalla de inicio».</li>
              <li>Confirma «Agregar». El ícono Bodega abrirá directamente tu bodega.</li>
            </ol>
          ) : guide === 'android' ? (
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abre esta página en Chrome.</li>
              <li>Toca el menú ⋮ y elige «Instalar app» o «Agregar a pantalla principal».</li>
              <li>Confirma la instalación para guardar el ícono Bodega.</li>
            </ol>
          ) : (
            <p>En tu teléfono abre esta misma página. En Android usa Chrome → menú ⋮ → «Instalar app»; en iPhone, Safari → Compartir → «Agregar a pantalla de inicio».</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
