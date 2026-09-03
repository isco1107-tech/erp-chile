'use client';

import * as React from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

export interface CurrencyInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  /** Monto en pesos chilenos, entero. */
  value: number;
  onChange: (value: number) => void;
}

const GROUPER = new Intl.NumberFormat('es-CL');

/** Descarta todo lo que no sea dígito y los ceros a la izquierda sobrantes. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

function formatDigits(digits: string): string {
  return digits === '' ? '' : GROUPER.format(Number(digits));
}

/**
 * Monto en CLP: agrupa miles con punto mientras se escribe y descarta
 * cualquier carácter que no sea dígito, así que nunca deja entrar una coma o
 * un punto decimal por error — el peso chileno no tiene decimales.
 */
export function CurrencyInput({ value, onChange, className, ...props }: CurrencyInputProps) {
  const [digits, setDigits] = React.useState(() => (value ? String(Math.round(value)) : ''));

  // Sincroniza cuando el valor cambia desde afuera (ej. al cargar un producto
  // para editar). Comparar contra el número ya tecleado evita pisar lo que el
  // usuario está escribiendo si el padre re-renderiza con el mismo valor.
  React.useEffect(() => {
    const current = digits === '' ? 0 : Number(digits);
    if (current !== value) setDigits(value ? String(Math.round(value)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = digitsOnly(e.target.value);
    setDigits(next);
    onChange(next === '' ? 0 : Number(next));
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatDigits(digits)}
        onChange={handleChange}
        className={cn('pl-6', className)}
        {...props}
      />
    </div>
  );
}
