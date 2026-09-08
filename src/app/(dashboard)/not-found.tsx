import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';

/**
 * `not-found.tsx` a nivel del grupo `(dashboard)`: el layout de arriba
 * (sidebar + header) sigue montado — solo el contenido de la página cae acá.
 * Sin esto, `notFound()` (usado en candidatas, contactos, cuotas, etc.) caía
 * al 404 genérico de Next.js, fuera de la app por completo.
 */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex max-w-md items-center justify-center py-16">
      <EmptyState
        icon={<SearchX className="size-16 text-muted-foreground/35" strokeWidth={1.5} />}
        title="No encontramos esta página"
        description="El registro que buscas no existe, fue eliminado, o no pertenece a tu empresa."
        action={
          <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
            Volver al dashboard
          </Link>
        }
      />
    </div>
  );
}
