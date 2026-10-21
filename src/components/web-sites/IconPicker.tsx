'use client';

import { useId, useMemo, useState } from 'react';
import { Ban, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SITE_ICONS, SITE_ICON_LABELS, type SiteIcon } from '@/lib/web-sites/icons';
import { cn } from '@/lib/utils';
import { SITE_ICON_COMPONENTS } from './site-icon-map';

export type IconValue = '' | SiteIcon;

interface IconPickerProps {
  label: string;
  /** `''` = sin ícono. */
  value: IconValue;
  onChange: (value: IconValue) => void;
  disabled?: boolean;
  hint?: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Ícono actual + botón que abre una cuadrícula con todos los disponibles (con buscador). */
export function IconPicker({ label, value, onChange, disabled, hint }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchId = useId();
  const Current = value ? SITE_ICON_COMPONENTS[value] : null;

  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return [...SITE_ICONS];
    return SITE_ICONS.filter((icon) => normalize(`${SITE_ICON_LABELS[icon]} ${icon}`).includes(needle));
  }, [query]);

  function choose(next: IconValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div role="group" aria-label={label} className="flex items-start gap-3">
      <div className={cn('grid size-12 shrink-0 place-items-center rounded-lg border', Current ? 'border-border bg-accent text-accent-foreground' : 'border-dashed border-border bg-muted text-muted-foreground')}>
        {Current ? <Current className="size-5" aria-hidden="true" /> : <Ban className="size-4" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{value ? SITE_ICON_LABELS[value] : 'Sin ícono'}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`${value ? 'Cambiar ícono' : 'Elegir ícono'}: ${label}`} onClick={() => setOpen(true)}>
            {value ? 'Cambiar ícono' : 'Elegir ícono'}
          </Button>
          {value ? (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Quitar ícono: ${label}`} onClick={() => onChange('')}>
              Quitar
            </Button>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Elegir un ícono</DialogTitle>
            <DialogDescription>Un dibujo simple ayuda a entender la idea de un vistazo. Busca por nombre: “reloj”, “camión”, “salud”…</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={searchId}>Buscar ícono</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: reloj" className="pl-9" autoComplete="off" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" size="sm" variant={value === '' ? 'secondary' : 'outline'} aria-pressed={value === ''} onClick={() => choose('')}>
                <Ban aria-hidden="true" /> Sin ícono
              </Button>
            </div>

            {matches.length === 0 ? (
              <p role="status" className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
                No encontramos un ícono con “{query.trim()}”. Prueba con otra palabra, por ejemplo “casa” o “estrella”.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Íconos disponibles">
                {matches.map((icon) => {
                  const Icon = SITE_ICON_COMPONENTS[icon];
                  const selected = value === icon;
                  return (
                    <li key={icon}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => choose(icon)}
                        className={cn(
                          'flex h-full w-full flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                          selected ? 'border-ring bg-accent text-accent-foreground' : 'border-border bg-card hover:border-ring hover:bg-muted'
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                        <span className="text-xs leading-tight">{SITE_ICON_LABELS[icon]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
