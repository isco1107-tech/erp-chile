'use client';

import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { textareaClass } from '@/components/ui/field-classes';
import { cn } from '@/lib/utils';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Máximo de caracteres (el mismo del esquema del servidor). */
  max?: number;
  /** Rango "ideal" (p. ej. buscadores): el contador cambia de color fuera de él. */
  ideal?: readonly [number, number];
  placeholder?: string;
  hint?: ReactNode;
  /** Problema que impide guardar o publicar (rojo, enlazado con aria-describedby). */
  error?: string | null;
  /** Aviso que no bloquea (ámbar). */
  warning?: string | null;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  onBlur?: () => void;
  className?: string;
}

/** Campo de texto con etiqueta, contador de caracteres y mensajes enlazados por aria-describedby. */
export function TextField({ label, value, onChange, max, ideal, placeholder, hint, error, warning, disabled, multiline, rows = 3, type = 'text', autoComplete, onBlur, className }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const countId = max ? `${id}-count` : undefined;
  const messageId = error || warning ? `${id}-message` : undefined;
  const describedBy = [hintId, countId, messageId].filter(Boolean).join(' ') || undefined;
  const length = value.trim().length;
  const inIdeal = ideal ? length >= ideal[0] && length <= ideal[1] : true;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {max ? (
          <span id={countId} className={cn('shrink-0 text-xs tabular-nums', ideal && length > 0 ? (inIdeal ? 'text-success' : 'text-warning') : 'text-muted-foreground')}>
            {value.length}/{max}
            {ideal ? ` · ideal ${ideal[0]}–${ideal[1]}` : ''}
            <span className="sr-only"> caracteres</span>
          </span>
        ) : null}
      </div>
      {multiline ? (
        <textarea
          id={id}
          className={textareaClass}
          rows={rows}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      )}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={messageId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : warning ? (
        <p id={messageId} className="text-xs font-medium text-warning">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

/** Fila con interruptor: título, explicación breve y el `Switch` a la derecha. */
export function SwitchRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Dibujo o ícono pequeño que muestra la opción (opcional). */
  preview?: ReactNode;
}

/**
 * Elección visual entre pocas opciones (variante, fondo, estilo…): tarjetas
 * con dibujo, título y una línea de ayuda. Accesible como grupo de radios.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  columns = 3,
  hint,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  columns?: 2 | 3 | 4;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                selected ? 'border-ring bg-accent' : 'border-border hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <input type="radio" className="sr-only" name={name} value={option.value} checked={selected} disabled={disabled} onChange={() => onChange(option.value)} />
              {option.preview ? <span aria-hidden="true">{option.preview}</span> : null}
              <span className="text-sm font-medium">{option.label}</span>
              {option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
