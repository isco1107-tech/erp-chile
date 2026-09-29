'use client';

import { useSyncExternalStore } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorTab } from './editor-shared';

const STORAGE_KEY = 'aether:web-sites:start-guide';
const CHANGE_EVENT = 'aether:web-sites:start-guide-change';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): la guía se muestra y se cierra solo mientras dure la pantalla.
    return false;
  }
}

let dismissedInMemory = false;

/** Tarjeta de bienvenida con los tres primeros pasos. Se cierra una vez y el navegador lo recuerda. */
export function StartGuide({ onGoToTab }: { onGoToTab: (tab: EditorTab) => void }) {
  // En el servidor se considera cerrada (no hay almacenamiento): evita un parpadeo al cargar.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissedInMemory || isDismissed(),
    () => true
  );
  if (dismissed) return null;

  function dismiss() {
    dismissedInMemory = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, 'done');
    } catch {
      // Sin almacenamiento: alcanza con la memoria.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <section aria-label="Primeros pasos" className="relative space-y-3 rounded-lg border border-border bg-accent p-4 shadow-card">
      <button type="button" onClick={dismiss} aria-label="Cerrar la guía" className="absolute top-3 right-3 rounded-lg p-1 text-muted-foreground outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50">
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-foreground" aria-hidden="true">
          <Lightbulb className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Tu sitio ya tiene un primer borrador</h2>
          <p className="text-sm text-muted-foreground">Te toma tres pasos dejarlo listo. Tu sitio se guarda solo mientras trabajas, y nada se publica hasta que tú lo decidas.</p>
        </div>
      </div>
      <ol className="space-y-1.5 pl-1 text-sm">
        <li className="flex gap-2">
          <span className="font-semibold">1.</span> Cambia los textos de ejemplo por los tuyos.
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">2.</span> Elige colores y tipografías en
          <Button type="button" variant="outline" size="xs" onClick={() => onGoToTab('design')}>
            Diseño
          </Button>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">3.</span> Revisa
          <Button type="button" variant="outline" size="xs" onClick={() => onGoToTab('readiness')}>
            Qué le falta
          </Button>
          y publica.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Consejo:</span> haz clic en cualquier parte de la vista previa para editarla.
      </p>
      <Button type="button" size="sm" onClick={dismiss}>
        Entendido
      </Button>
    </section>
  );
}
