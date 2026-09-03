import { cn } from '@/lib/utils';

/** Bloque gris con pulso, para ocupar el espacio del contenido mientras carga. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/**
 * Esqueleto genérico de una vista de listado: título, barra de filtros y tabla.
 * Reproduce la silueta real de las páginas para que el salto al contenido no
 * mueva el layout.
 */
export function TablePageSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border bg-muted/40 p-2">
          <div className="flex gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-4 p-2">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className="h-4 flex-1"
                  // Alterna el ancho para que no parezca una grilla perfecta,
                  // que lee como un error de render más que como carga.
                  style={{ opacity: colIndex === columns - 1 ? 0.5 : 1 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Esqueleto para vistas de tarjetas/indicadores (dashboard, tesorería). */
export function CardsPageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
