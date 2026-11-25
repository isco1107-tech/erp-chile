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
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Contexto corto sobre el título (p. ej. el módulo: "Contabilidad"). */
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-x-6 gap-y-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl" data-tutorial="module-header">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end print:hidden">{actions}</div>}
    </div>
  );
}
