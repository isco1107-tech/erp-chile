'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { findNavLinkForPath } from '@/lib/navigation/workspace-nav';

export interface GateSection {
  id: string;
  href: string;
  label: string;
  exact?: boolean;
  disabled: boolean;
}

/**
 * Puerta de las secciones que la empresa apagó en Configuración → Módulos y
 * menú. Ocultar el enlace del sidebar no basta: un marcador guardado o un
 * link compartido seguiría abriendo la pantalla.
 *
 * Es configuración del espacio de trabajo, no seguridad: los datos de la
 * pantalla siguen protegidos por los permisos de cada página y Server Action.
 * Por eso puede resolverse en un Client Component con `usePathname` (que el
 * layout, siendo Server Component, no tiene), sin parpadeo: también renderiza
 * en el servidor.
 */
export function DisabledSectionGate({
  sections,
  canConfigure,
  children,
}: {
  sections: GateSection[];
  canConfigure: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const section = findNavLinkForPath(sections, pathname);

  if (!section?.disabled) return <>{children}</>;

  return (
    <div className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-card">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <EyeOff className="size-6 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold text-foreground">{section.label} está desactivado</h1>
      <p className="text-sm text-muted-foreground">
        Tu empresa ocultó esta sección del espacio de trabajo. Tus datos siguen intactos: al reactivarla vuelve tal como estaba.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Volver al inicio
        </Link>
        {canConfigure && (
          <Link href="/dashboard/settings/modules" className={buttonVariants({ variant: 'default' })}>
            Administrar módulos
          </Link>
        )}
      </div>
    </div>
  );
}
