'use client';

import { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { appIconPaths } from '@/lib/apps/registry';
import { detectDevice, useApplicationInstall } from '@/components/apps/InstallApplication';

export default function InstallApp() {
  const context = useApplicationInstall();
  const [guide, setGuide] = useState<'iphone' | 'android' | 'desktop' | null>(null);
  const [busy, setBusy] = useState(false);
  // Abierta desde su ícono, o ya instalada en el teléfono: no se ofrece instalar de nuevo.
  if (context.installed) return null;
  // Visitada desde el navegador con la app ya instalada: se dice la verdad en vez de ofrecer instalar otra vez.
  if (context.elsewhere) {
    return (
      <section aria-label="Bodega móvil ya instalada" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appIconPaths('bodega').any192} alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
        <p className="text-sm">Bodega móvil ya está en este teléfono. Ábrela desde su ícono en la pantalla de inicio.</p>
      </section>
    );
  }

  const download = async () => {
    setBusy(true);
    setGuide(null);
    try {
      if (await context.install()) return;
      setGuide(detectDevice());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Instalar Bodega móvil" className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        {/* El ícono real de la app: es el que quedará en la pantalla de inicio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appIconPaths('bodega').any192} alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
        <p className="text-sm text-muted-foreground">Cada app de Aether se instala por separado, con su propio ícono.</p>
      </div>
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
