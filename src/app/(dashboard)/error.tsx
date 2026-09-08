'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * `error.tsx` a nivel del grupo `(dashboard)`: el layout de arriba (sidebar +
 * header) sigue montado, el error boundary solo reemplaza el contenido de la
 * página — sin esto, cualquier excepción no controlada en cualquiera de las
 * rutas del dashboard rompía a la pantalla de error genérica de Next.js,
 * fuera de la experiencia de la app.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md items-center justify-center py-16">
      <EmptyState
        icon={<AlertTriangle className="size-16 text-destructive/70" strokeWidth={1.5} />}
        title="Algo salió mal"
        description="Ocurrió un error inesperado al cargar esta pantalla. Puedes intentar de nuevo; si el problema persiste, avisa al equipo técnico."
        action={
          <Button type="button" size="sm" onClick={reset}>
            Intentar de nuevo
          </Button>
        }
      />
    </div>
  );
}
