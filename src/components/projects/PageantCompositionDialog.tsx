'use client';

import { useState } from 'react';
import { ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CanvasContent } from '@/components/web-sites/site/CanvasScene';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { canvasElementStyle } from '@/lib/web-sites/canvas';
import { MAX_PAGEANT_COMPOSITIONS, type PageantComposition } from '@/lib/events/pageant-compositions';

function CompositionThumbnail({ composition }: { composition: PageantComposition }) {
  return (
    <div aria-hidden="true" className={`relative aspect-[5/2] overflow-hidden rounded-md border border-border bg-muted ${SITE_FONT_CLASSES}`}
      style={{ containerType: 'inline-size' }}>
      {composition.elements.filter((layer) => !layer.hidden).map((layer) => (
        <div key={layer.id} className="absolute flex min-w-0 items-center overflow-hidden"
          style={{
            ...canvasElementStyle(layer), left: `${layer.desktop.x}%`, top: `${layer.desktop.y}%`,
            width: `${layer.desktop.width}%`, height: `${layer.desktop.height}%`,
            fontSize: `clamp(8px,${layer.fontSize / 7}cqw,24px)`, lineHeight: layer.lineHeight ?? 1.1,
          }}>
          {layer.kind === 'image' && !layer.imageUrl ? <ImageIcon className="m-auto size-4 text-[#6d523d]" /> : <CanvasContent element={layer} />}
        </div>
      ))}
    </div>
  );
}

export function PageantCompositionDialog({ builtIn, saved, mode, selectionCount, suggestedName, destination, onInsert, onSave, onDelete, close }: {
  builtIn: PageantComposition[];
  saved: PageantComposition[];
  mode: 'browse' | 'save';
  selectionCount: number;
  suggestedName: string;
  destination?: string;
  onInsert: (composition: PageantComposition) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  close: () => void;
}) {
  const [tab, setTab] = useState<'built-in' | 'saved'>('built-in');
  const [name, setName] = useState(suggestedName);
  const isSaving = mode === 'save';
  const items = tab === 'built-in' ? builtIn : saved;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[85dvh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isSaving ? 'Guardar como composición' : 'Composiciones'}</DialogTitle>
          <DialogDescription>
            {isSaving
              ? `Guarda ${selectionCount === 1 ? 'esta capa' : `estas ${selectionCount} capas`} para reutilizarlas en el certamen.`
              : destination ? destination : 'Elige un diseño y colócalo con un clic sobre la página o entre secciones.'}
          </DialogDescription>
        </DialogHeader>
        {isSaving ? (
          <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }} className="space-y-3">
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Nombre de la composición</span>
              <Input value={name} maxLength={64} onChange={(event) => setName(event.currentTarget.value)} placeholder="Por ejemplo, Tarjeta de la gala" />
            </label>
            {saved.length >= MAX_PAGEANT_COMPOSITIONS && <p className="text-sm text-muted-foreground">La biblioteca de este certamen está llena.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={!name.trim() || saved.length >= MAX_PAGEANT_COMPOSITIONS}>Guardar composición</Button>
            </div>
          </form>
        ) : (
          <>
            <div role="group" aria-label="Biblioteca de composiciones" className="flex gap-2">
              <Button type="button" variant={tab === 'built-in' ? 'secondary' : 'ghost'} aria-pressed={tab === 'built-in'} onClick={() => setTab('built-in')}>Listas para usar</Button>
              <Button type="button" variant={tab === 'saved' ? 'secondary' : 'ghost'} aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>Mis composiciones</Button>
            </div>
            {items.length ? <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              {items.map((composition) => (
                <div key={composition.id} className="flex min-w-0 gap-1 rounded-lg border border-border bg-background p-2">
                  <button type="button" className="min-w-0 flex-1 space-y-2 rounded-md p-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onInsert(composition)} aria-label={`Usar ${composition.name}`}>
                    <CompositionThumbnail composition={composition} />
                    <span className="block break-words px-1 text-sm font-semibold">{composition.name}</span>
                  </button>
                  {tab === 'saved' && (
                    <Button type="button" variant="ghost" size="icon-sm" title="Eliminar de la biblioteca"
                      aria-label={`Eliminar composición ${composition.name}`} onClick={() => onDelete(composition.id)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
            </div> : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Selecciona una o varias capas y elige «Guardar como composición» para agregarlas aquí.
            </p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
