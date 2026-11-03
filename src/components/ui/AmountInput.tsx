'use client';

import * as React from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { amountDigits, formatAmountDigits } from '@/lib/chile/amount-input';

export interface AmountInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  /** Solo dígitos ('' = vacío). Así el formulario distingue «no escribió nada» de «escribió 0». */
  value: string;
  onChange: (digits: string) => void;
  /** Muestra el signo $ a la izquierda. */
  showSign?: boolean;
}

/**
 * Monto en pesos que se escribe como se escribe en Chile: «50.000» vale
 * cincuenta mil. Un `<input type="number">` lee ese punto como decimal y
 * guarda $50; acá el punto de miles lo pone el campo y cualquier otra tecla se
 * ignora. A diferencia de `CurrencyInput`, el valor es texto: el cero escrito
 * (un fondo de caja vacío) no se confunde con un campo sin llenar.
 */
export function AmountInput({ value, onChange, showSign = true, className, ...props }: AmountInputProps) {
  const field = (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatAmountDigits(value)}
      onChange={(event) => onChange(amountDigits(event.target.value))}
      className={cn(showSign && 'pl-6', className)}
      {...props}
    />
  );
  if (!showSign) return field;
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      {field}
    </div>
  );
}
