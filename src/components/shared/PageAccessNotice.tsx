import Link from 'next/link';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';
import type { PageAccessDenial } from '@/lib/auth/guards';

const COPY: Record<PageAccessDenial, { title: string; description: string }> = {
  module: {
    title: 'Módulo no incluido en tu plan',
    description: 'Tu empresa no tiene contratado este módulo. Si lo necesitas, el dueño de la empresa puede pedirlo en Configuración → Planes y módulos.',
  },
  permission: {
    title: 'No tienes acceso a esta sección',
    description: 'Tu rol no incluye el permiso para verla. Si lo necesitas, pídeselo al dueño o a un administrador de tu empresa (Configuración → Equipo & Colaboradores).',
  },
};

/** Lo que ve quien entra por URL a una página que su plan o su rol no permite (ver `checkPageAccess`). */
export function PageAccessNotice({ denied }: { denied: PageAccessDenial }) {
  const copy = COPY[denied];
  return (
    <div data-access-locked className="mx-auto flex max-w-md items-center justify-center py-16">
      <EmptyState
        icon={<Lock className="size-14 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />}
        title={copy.title}
        description={copy.description}
        action={
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Volver al inicio
          </Link>
        }
      />
    </div>
  );
}
