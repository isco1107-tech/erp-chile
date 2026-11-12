'use client';

import { useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { normalizeSerial } from '@/lib/inventory/traceability';
import { serialProblem, type CartLine } from '@/lib/pos/cart';

interface Props {
  /** Líneas del carrito que se venden por serie. */
  lines: CartLine[];
  /** Línea que se abre primero (la que falta o la que tocó el cajero). */
  focusProductId?: string;
  onAdd: (productId: string, serial: string) => string | undefined;
  onRemove: (productId: string, serial: string) => void;
  onClose: () => void;
  /** El cajero terminó: todas las líneas están completas. */
  onDone: () => void;
}

/**
 * Series de lo que se vende: una por unidad. Pensado para el lector de códigos: cada lectura
 * termina en Enter y se agrega sola. El servidor revisa que la serie exista y esté en esta bodega.
 */
export default function PosSerialsDialog({ lines, focusProductId, onAdd, onRemove, onClose, onDone }: Props) {
  const firstId = focusProductId && lines.some((l) => l.productId === focusProductId) ? focusProductId : (lines.find((l) => serialProblem(l)) ?? lines[0])?.productId;
  const [activeId, setActiveId] = useState(firstId);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const active = lines.find((line) => line.productId === activeId) ?? lines[0];
  const allDone = lines.every((line) => serialProblem(line) === null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!active) return;
    const serial = normalizeSerial(value);
    if (!serial) {
      setError('Serie no válida: usa letras, números, punto, guion o barra (hasta 64 caracteres)');
      return;
    }
    const problem = onAdd(active.productId, serial);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setValue('');
    // Al completar una línea, pasa a la siguiente que falte.
    const remaining = (active.serials?.length ?? 0) + 1 >= Math.round(active.quantity);
    if (remaining) {
      const next = lines.find((line) => line.productId !== active.productId && serialProblem(line) !== null);
      if (next) setActiveId(next.productId);
    }
    input.current?.focus();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Series de la venta</DialogTitle>
          <DialogDescription>Lee o escribe la serie de cada unidad y presiona Enter. Se necesita una por unidad.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Productos con serie">
            {lines.map((line) => {
              const done = serialProblem(line) === null;
              return (
                <button
                  key={line.productId}
                  type="button"
                  role="tab"
                  aria-selected={line.productId === active?.productId}
                  onClick={() => { setActiveId(line.productId); setError(''); input.current?.focus(); }}
                  className={`rounded-lg border px-2.5 py-1 text-left text-sm ${line.productId === active?.productId ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <span className="block max-w-48 truncate font-medium">{line.name}</span>
                  <span className="text-xs text-muted-foreground">{line.serials?.length ?? 0} de {Math.round(line.quantity)} {done ? '· listo' : ''}</span>
                </button>
              );
            })}
          </div>

          {active && (
            <form onSubmit={submit} className="space-y-2">
              {!Number.isInteger(active.quantity) ? (
                <p role="alert" className="text-sm text-destructive">Este producto se vende en unidades enteras. Corrige la cantidad en la venta.</p>
              ) : (
                <>
                  <Input
                    ref={input}
                    autoFocus
                    value={value}
                    onChange={(event) => { setValue(event.target.value); setError(''); }}
                    placeholder={`Serie de ${active.name}`}
                    aria-label={`Serie de ${active.name}`}
                    autoComplete="off"
                    className="h-11 font-mono text-base"
                    disabled={(active.serials?.length ?? 0) >= Math.round(active.quantity)}
                  />
                  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                </>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {(active.serials ?? []).map((serial) => (
                  <li key={serial}>
                    <StatusBadge tone="info" className="gap-1 font-mono">
                      {serial}
                      <button type="button" aria-label={`Quitar la serie ${serial}`} onClick={() => onRemove(active.productId, serial)}>
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Volver a la venta</Button>
          <Button type="button" disabled={!allDone} onClick={onDone}>Seguir al cobro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
