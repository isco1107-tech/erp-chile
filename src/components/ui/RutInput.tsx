'use client';

import * as React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Input } from './input';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { cn } from '@/lib/utils';

export interface RutInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'aria-invalid'> {
  value: string;
  onChange: (formattedValue: string) => void;
  /** Oculta el indicador verde/rojo, para usos compactos (ej. celdas de tabla). */
  hideIndicator?: boolean;
  /** Error externo (ej. "campo obligatorio") que también debe marcar el input como inválido. */
  invalid?: boolean;
}

/**
 * Input de RUT chileno: formatea a `XX.XXX.XXX-X` en cada tecleo y muestra un
 * micro-indicador de validez por Módulo 11 apenas hay dígitos suficientes para
 * evaluarlo — sin esperar a que el usuario termine de escribir o pierda el foco.
 */
export function RutInput({ value, onChange, hideIndicator, invalid, className, ...props }: RutInputProps) {
  const cleaned = cleanRut(value);
  // Cuerpo + dígito verificador: menos de 2 caracteres no alcanza para evaluar.
  const status = cleaned.length < 2 ? null : validateRut(cleaned);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(formatRut(e.target.value))}
        placeholder="12.345.678-K"
        inputMode="text"
        autoComplete="off"
        aria-invalid={invalid || status === false}
        className={cn(hideIndicator ? '' : 'pr-8', className)}
        {...props}
      />
      {!hideIndicator && status !== null && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 right-2 -translate-y-1/2',
            status ? 'text-green-600' : 'text-destructive'
          )}
          title={status ? 'RUT válido' : 'RUT inválido'}
        >
          {status ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
        </span>
      )}
    </div>
  );
}
