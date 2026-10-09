'use client';

import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { GLOSSARY_ENTRIES, type GlossaryKey } from '@/lib/chile/glossary';
import { cn } from '@/lib/utils';

export interface FieldLabelProps {
  htmlFor: string;
  /** Clave del glosario único: de ahí sale el texto del tooltip. */
  term: GlossaryKey;
  /**
   * Frase extra, propia de este campo, que se agrega al final del tooltip
   * (ej. qué cambia en esta pantalla si lo activas). El tooltip es para
   * lectura rápida: lo largo va en un `FieldHint` bajo el campo.
   */
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * `Label` + ícono "?" con la explicación del término, para campos con jerga.
 *
 * El ícono va AL LADO del `<label>`, no dentro: así tocarlo no enfoca el campo
 * y no se lee dos veces como parte de su nombre accesible. Es un `<button>`
 * real (ver `InfoTooltip`), alcanzable con Tab y con la explicación visible al
 * enfocarlo.
 */
export function FieldLabel({ htmlFor, term, hint, children, className }: FieldLabelProps) {
  const base = GLOSSARY_ENTRIES[term].short;
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{children}</Label>
      <InfoTooltip term={term} text={hint ? `${base} ${hint}` : undefined} />
    </div>
  );
}

/** Una línea de ayuda, en gris, bajo el campo. */
export function FieldHint({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <p id={id} className={cn('mt-1 text-xs text-muted-foreground', className)}>
      {children}
    </p>
  );
}
