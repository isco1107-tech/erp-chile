'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Dialog, DialogBackdrop, DialogClose, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { allowsDecimals, clampQuantity } from '@/lib/warehouse-mobile/draft';
import { cn } from '@/lib/utils';
import { useBodega } from './BodegaProvider';

/** Formato de cantidades chilenas: 1.234,5 */
export function formatQty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

/** Hoja inferior en móvil y diálogo centrado en pantallas amplias. */
export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] min-h-0 flex-col rounded-t-3xl bg-card pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-card-foreground shadow-popover outline-none motion-safe:transition-[translate,opacity] data-[ending-style]:translate-y-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:px-0"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
            <DialogTitle className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{title}</DialogTitle>
            <DialogClose aria-label="Cerrar" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
              <X className="size-5" aria-hidden="true" />
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">{footer}</div>
          ) : (
            <div className="pb-[env(safe-area-inset-bottom)] sm:pb-0" />
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />;
}

/** Foto guardada en el teléfono (miniatura). */
export function PhotoThumb({ photoId, className, fallback }: { photoId: string | null; className?: string; fallback?: ReactNode }) {
  const { getPhotoUrl } = useBodega();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!photoId) {
      setUrl(null);
      return;
    }
    void getPhotoUrl(photoId).then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId, getPhotoUrl]);

  if (!url) return <div className={cn('flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground', className)}>{fallback}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Foto tomada" className={cn('shrink-0 rounded-xl object-cover', className)} />;
}

/** Foto del producto del catálogo, o un recuadro con la inicial. */
export function ProductImage({ url, name, className }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn('shrink-0 rounded-xl bg-muted object-cover', className)} loading="lazy" />;
  }
  return (
    <div aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground', className)}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

/**
 * Cantidad con botones grandes (+/−) y campo para teclear. Las unidades enteras
 * no aceptan decimales; kilos, litros y metros sí (hasta 3).
 */
export function QuantityStepper({ value, unit, onChange, label }: { value: number; unit: string; onChange: (next: number) => void; label: string }) {
  const decimals = allowsDecimals(unit);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? formatQty(value);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    setText(null);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    onChange(clampQuantity(parsed, unit));
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${label}`}>
      <button
        type="button"
        aria-label="Restar uno"
        onClick={() => onChange(clampQuantity(Math.max(0, value - 1), unit))}
        className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground active:bg-secondary"
      >
        <Minus className="size-5" />
      </button>
      <input
        aria-label={`Cantidad de ${label} en ${unit}`}
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={shown}
        onFocus={(event) => {
          setText(String(value).replace('.', ','));
          event.currentTarget.select();
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="h-12 w-[4.5rem] rounded-xl border border-input bg-card text-center text-lg font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <button
        type="button"
        aria-label="Sumar uno"
        onClick={() => onChange(clampQuantity(value + 1, unit))}
        className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground active:opacity-80"
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/** Etiqueta pequeña con tono (estado de una línea, de la cola…). */
export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

/** Botón grande de acción principal (alto táctil cómodo). */
export function BigButton({ variant = 'primary', className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    primary: 'bg-primary text-primary-foreground active:opacity-85',
    secondary: 'bg-muted text-foreground active:bg-secondary',
    danger: 'bg-danger-soft text-danger active:opacity-85',
    ghost: 'text-foreground active:bg-muted',
  } as const;
  return (
    <button
      type="button"
      {...props}
      className={cn('inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45', variants[variant], className)}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'h-12 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50';
