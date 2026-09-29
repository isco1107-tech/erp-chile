'use client';

import { useId } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  /** 0 = sin estrellas. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}

const OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Estrellas de 0 a 5 para un testimonio. Son radios nativos (con flechas del
 * teclado incluidas) pintados como estrellas; "Sin estrellas" es la opción 0.
 */
export function StarRating({ value, onChange, disabled, label = 'Estrellas' }: StarRatingProps) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center">
          {OPTIONS.map((stars) => {
            const filled = stars <= value;
            return (
              <label
                key={stars}
                className={cn(
                  'cursor-pointer rounded-md p-0.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <input type="radio" className="sr-only" name={name} value={stars} checked={value === stars} disabled={disabled} onChange={() => onChange(stars)} />
                <Star className={cn('size-6 transition-colors', filled ? 'fill-accent-foreground text-accent-foreground' : 'text-muted-foreground/60 hover:text-accent-foreground')} aria-hidden="true" />
                <span className="sr-only">{stars === 1 ? '1 estrella' : `${stars} estrellas`}</span>
              </label>
            );
          })}
        </div>
        <label className={cn('flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50', disabled && 'cursor-not-allowed opacity-60')}>
          <input type="radio" className="sr-only" name={name} value={0} checked={value === 0} disabled={disabled} onChange={() => onChange(0)} />
          <span className={cn('underline-offset-2', value === 0 ? 'font-semibold text-foreground' : 'hover:underline')}>Sin estrellas</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Opcional. Pon las estrellas solo si el cliente te las dio o si su opinión las refleja.</p>
    </fieldset>
  );
}
