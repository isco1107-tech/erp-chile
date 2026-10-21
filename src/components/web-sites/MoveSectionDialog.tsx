'use client';

import { FileText, Home } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

export interface PageOption {
  id: string;
  title: string;
  isHome: boolean;
  hidden: boolean;
  blockCount: number;
  hasHero: boolean;
}

interface MoveSectionDialogProps {
  open: boolean;
  mode: 'move' | 'copy';
  /** Nombre de la sección ("Portada", "Galería"). */
  sectionLabel: string;
  isHero: boolean;
  pages: PageOption[];
  currentPageId: string;
  maxPerPage: number;
  /** Solo al copiar: el sitio ya llegó a su máximo de secciones. */
  siteFull: boolean;
  onPick: (pageId: string) => void;
  onClose: () => void;
}

/** Elegir a qué otra página va una sección (mover o copiar), con las razones cuando no se puede. */
export function MoveSectionDialog({ open, mode, sectionLabel, isHero, pages, currentPageId, maxPerPage, siteFull, onPick, onClose }: MoveSectionDialogProps) {
  const others = pages.filter((page) => page.id !== currentPageId);
  const verb = mode === 'move' ? 'Mover' : 'Copiar';
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {verb} «{sectionLabel}» a otra página
          </DialogTitle>
          <DialogDescription>
            {mode === 'move' ? 'La sección sale de esta página y queda al final de la que elijas.' : 'Se deja una copia al final de la página que elijas; la original se queda aquí.'}
          </DialogDescription>
        </DialogHeader>
        {others.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">Tu sitio tiene una sola página. Crea otra en la pestaña “Páginas” y vuelve a intentarlo.</p>
        ) : (
          <ul className="space-y-2">
            {others.map((page) => {
              const reason = page.blockCount >= maxPerPage ? `Esta página ya tiene ${maxPerPage} secciones, el máximo.` : isHero && page.hasHero ? 'Ya tiene una portada; solo puede haber una.' : mode === 'copy' && siteFull ? 'Tu sitio llegó al máximo de secciones.' : null;
              const Icon = page.isHome ? Home : FileText;
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    disabled={Boolean(reason)}
                    onClick={() => onPick(page.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left outline-none transition-colors hover:border-ring hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                      reason && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-card'
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {page.title}
                        {page.isHome ? <StatusBadge tone="info">Inicio</StatusBadge> : null}
                        {page.hidden ? <StatusBadge tone="neutral">Oculta</StatusBadge> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{reason ?? `${page.blockCount} ${page.blockCount === 1 ? 'sección' : 'secciones'}`}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
