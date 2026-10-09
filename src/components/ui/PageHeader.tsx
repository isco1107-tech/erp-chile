import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Encabezado estándar de una pantalla del panel: título, bajada opcional y
 * acciones a la derecha. Cada pantalla armaba el suyo con tamaños distintos
 * (`text-2xl font-bold`, `text-xl font-semibold`…); este es el patrón común.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  titleAddon,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Contexto corto sobre el título (p. ej. el módulo: "Contabilidad"). */
  eyebrow?: string;
  /** Elemento al lado del título (p. ej. un `InfoTooltip` con el glosario). */
  titleAddon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground" data-tutorial="module-header">
          {title}
          {titleAddon}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}
