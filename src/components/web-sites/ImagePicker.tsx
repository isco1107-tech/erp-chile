'use client';

import { useState } from 'react';
import { Check, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { ImageUploader } from './ImageUploader';
import { useEditorAssets, type EditorAsset } from './editor-shared';

interface ImagePickerProps {
  label: string;
  /** URL elegida (`''` si no hay). */
  value: string;
  /** Recibe la URL y, si vino de la biblioteca, el asset (para completar la descripción). */
  onChange: (url: string, asset: EditorAsset | null) => void;
  hint?: string;
  /** Atajo opcional: una imagen ya conocida (p. ej. el logo de la empresa). */
  suggestion?: { url: string; label: string } | null;
}

/** Miniatura + botón que abre la biblioteca del sitio (elegir una o subir otra). */
export function ImagePicker({ label, value, onChange, hint, suggestion }: ImagePickerProps) {
  const { siteId, assets, readOnly, addAsset } = useEditorAssets();
  const [open, setOpen] = useState(false);
  const src = safeImageSrc(value);
  const current = assets.find((asset) => asset.url === value) ?? null;

  function choose(asset: EditorAsset) {
    onChange(asset.url, asset);
    setOpen(false);
  }

  return (
    <div role="group" aria-label={label} className="flex items-start gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{current ? current.fileName : value ? 'Imagen que no está en la biblioteca' : 'Sin imagen'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={readOnly} aria-label={`${value ? 'Cambiar imagen' : 'Elegir imagen'}: ${label}`} onClick={() => setOpen(true)}>
            {value ? 'Cambiar imagen' : 'Elegir imagen'}
          </Button>
          {value ? (
            <Button type="button" size="sm" variant="ghost" disabled={readOnly} aria-label={`Quitar imagen: ${label}`} onClick={() => onChange('', null)}>
              Quitar
            </Button>
          ) : null}
          {suggestion && !value ? (
            <Button type="button" size="sm" variant="ghost" disabled={readOnly} onClick={() => onChange(suggestion.url, null)}>
              {suggestion.label}
            </Button>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Elegir imagen</DialogTitle>
            <DialogDescription>Elige una de la biblioteca de este sitio o sube una nueva. Para: {label}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section aria-label="Biblioteca de imágenes" className="space-y-2">
              <h3 className="text-sm font-semibold">Biblioteca ({assets.length})</h3>
              {assets.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">Todavía no subiste imágenes a este sitio. Sube la primera aquí abajo.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((asset) => {
                    const selected = asset.url === value;
                    return (
                      <li key={asset.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => choose(asset)}
                          className={cn(
                            'group relative block w-full overflow-hidden rounded-lg border bg-card text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            selected ? 'border-ring ring-2 ring-ring/40' : 'border-border hover:border-ring'
                          )}
                        >
                          <span className="block aspect-video bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={safeImageSrc(asset.url) ?? undefined} alt="" className="size-full object-cover" />
                          </span>
                          <span className="block px-2 py-1.5">
                            <span className="block truncate text-xs font-medium">{asset.fileName}</span>
                            <span className={cn('block truncate text-xs', asset.alt ? 'text-muted-foreground' : 'text-warning')}>{asset.alt || 'Sin descripción'}</span>
                          </span>
                          {selected ? (
                            <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3" aria-hidden="true" />
                              <span className="sr-only">Seleccionada</span>
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Subir una imagen nueva" className="space-y-2">
              <h3 className="text-sm font-semibold">Subir nueva</h3>
              <ImageUploader
                siteId={siteId}
                multiple={false}
                askAlt
                onUploaded={addAsset}
                onFinished={(uploaded) => {
                  const first = uploaded[0];
                  if (first) choose(first);
                }}
              />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
