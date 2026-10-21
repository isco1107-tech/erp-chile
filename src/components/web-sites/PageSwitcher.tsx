'use client';

import { EyeOff, FileText, House, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_PAGES, type SiteDocument } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';

interface PageSwitcherProps {
  doc: SiteDocument;
  pageId: string;
  onSelect: (pageId: string) => void;
  onAddPage: () => void;
  /** Lleva a la pestaña "Páginas" (nombre, dirección, menú, Google). */
  onManagePages: () => void;
  readOnly: boolean;
}

/** Fichas con cada página del sitio: elegir cuál se edita (y se ve en la vista previa) y agregar otra. */
export function PageSwitcher({ doc, pageId, onSelect, onAddPage, onManagePages, readOnly }: PageSwitcherProps) {
  const atMax = doc.pages.length >= MAX_PAGES;
  return (
    <section aria-label="Páginas de tu sitio" className="space-y-2.5 rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Estás editando la página</h2>
        <button type="button" onClick={onManagePages} className="rounded-md text-xs font-medium text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          Nombres, direcciones y menú
        </button>
      </div>
      <div role="group" aria-label="Elige la página que quieres editar" className="flex flex-wrap items-center gap-1.5">
        {doc.pages.map((page, index) => {
          const current = page.id === pageId;
          const Icon = index === 0 ? House : page.hidden ? EyeOff : FileText;
          return (
            <button
              key={page.id}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelect(page.id)}
              className={cn(
                'inline-flex max-w-48 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                current ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
                page.hidden && !current && 'text-muted-foreground'
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{page.title}</span>
              {page.hidden ? <span className="sr-only"> (oculta)</span> : null}
              {index === 0 ? <span className="sr-only"> (página de inicio)</span> : null}
            </button>
          );
        })}
        <Button type="button" size="sm" variant="outline" disabled={readOnly || atMax} title={atMax ? `Un sitio puede tener hasta ${MAX_PAGES} páginas` : undefined} onClick={onAddPage}>
          <Plus aria-hidden="true" /> Página
        </Button>
      </div>
      {doc.pages.length === 1 ? <p className="text-xs text-muted-foreground">Tu sitio tiene una sola página. Agrega otras, como «Servicios» o «Contacto», y aparecerán solas en el menú.</p> : null}
    </section>
  );
}
