'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { HelpCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface InfoTooltipProps {
  /** Explicación corta en español simple, sin jerga. */
  text: string;
  /** Texto accesible para lectores de pantalla; por defecto usa `text`. */
  label?: string;
  className?: string;
}

/**
 * Ícono "?" que muestra una explicación corta de un término tributario o
 * contable al pasar el mouse, al tocar (touch) o al enfocarlo con teclado
 * (Tab) — pensado para dueños de PYME que no son contadores.
 *
 * `TooltipPrimitive.Trigger` de `@base-ui/react/tooltip` renderiza un
 * `<button>` real, así que es alcanzable con Tab y se abre con foco de
 * teclado sin código adicional. Se fija `type="button"` explícitamente para
 * que nunca dispare el submit de un formulario si este ícono queda dentro de
 * un `<form>` (ej. checkbox "Exento IVA" en el formulario de venta/compra).
 */
export function InfoTooltip({ text, label, className }: InfoTooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        type="button"
        delay={200}
        aria-label={label ?? text}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
          className
        )}
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner sideOffset={6}>
          <TooltipPrimitive.Popup
            className={cn(
              'max-w-64 rounded-[10px] bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-popover transition-opacity',
              'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'
            )}
          >
            {text}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
