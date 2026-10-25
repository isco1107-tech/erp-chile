'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classifyRutEntry, type ScanProduct, type ScanResolution } from '@/lib/pos/scan';

interface Props<P extends ScanProduct> {
  products: P[];
  /** RUT con el que se abre al CAMBIAR el cliente de una venta ya en curso. */
  initialRut: string | null;
  /** Se está corrigiendo el cliente (no es el paso inicial): se puede cancelar sin tocar nada. */
  editing: boolean;
  onConfirm: (rut: string) => void;
  onConsumerFinal: () => void;
  /** Mientras este paso está abierto el lector sigue entregando productos: se agregan sin perderlos. */
  onProduct: (resolution: Extract<ScanResolution<P>, { kind: 'product' }>) => void;
  onCancel: () => void;
}

/**
 * Lo primero que se pide al escanear el primer producto: el RUT del cliente.
 *
 * Enter con el campo vacío (o Esc) es «consumidor final», el caso normal del
 * mostrador, para que pedir el RUT nunca frene la fila. Si el cajero sigue
 * escaneando, un código de barras que cae en este campo se agrega como producto
 * en vez de quedar como un RUT inválido.
 */
export default function RutStep<P extends ScanProduct>(props: Props<P>) {
  const { products, onConfirm, onConsumerFinal, onProduct, onCancel } = props;
  const [value, setValue] = useState(props.initialRut ?? '');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function submit() {
    const entry = classifyRutEntry(products, value);
    if (entry.kind === 'empty') return onConsumerFinal();
    if (entry.kind === 'rut') return onConfirm(entry.rut);
    if (entry.kind === 'product') {
      onProduct(entry.resolution);
      setValue('');
      setError(null);
      return;
    }
    setError(entry.message);
    input.current?.select();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (props.editing) onCancel();
      else onConsumerFinal();
    }
  }

  return (
    <section aria-labelledby="pos-rut-title" className="rounded-2xl border-2 border-primary bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary" aria-hidden="true">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="pos-rut-title" className="text-base font-semibold">{props.editing ? 'Cambiar el RUT del cliente' : '¿Boleta con RUT?'}</h2>
          <p className="text-xs text-muted-foreground">
            Escribe el RUT y presiona Enter. Sin RUT, presiona Enter igual: la boleta va a consumidor final. Puedes seguir escaneando productos.
          </p>
        </div>
      </div>
      <Label htmlFor="pos-customer-rut" className="mt-3 mb-1.5 block">RUT del cliente</Label>
      <Input
        id="pos-customer-rut"
        ref={input}
        autoComplete="off"
        inputMode="text"
        placeholder="12.345.678-5"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'pos-rut-error' : undefined}
        className="h-14 text-2xl tracking-wide tabular-nums"
      />
      {error && <p id="pos-rut-error" role="alert" className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {props.editing && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
        <Button type="button" variant="outline" onClick={onConsumerFinal}>Consumidor final <kbd className="ml-2 rounded border px-1 text-[10px] text-muted-foreground">Esc</kbd></Button>
        <Button type="button" onClick={submit}>Continuar <kbd className="ml-2 rounded border border-primary-foreground/40 px-1 text-[10px]">Enter</kbd></Button>
      </div>
    </section>
  );
}
