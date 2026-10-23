import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import WebSitesClient from '@/components/web-sites/WebSitesClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { routeTargetsFor } from '@/lib/web-sites/forms';
import { getSiteQuota } from '@/modules/web-sites/services/web-sites.service';

export const metadata = { title: 'Sitios web' };

export default async function WebSitesPage({ searchParams }: { searchParams: Promise<{ vista?: string | string[] }> }) {
  const [context, { vista }] = await Promise.all([getAuthContext(), searchParams]);
  const canWrite = can(context, 'websites:write');
  // El tope lo fija la Supersuite: con el cupo lleno el botón se apaga y explica por qué.
  const quotaReached = canWrite ? (await getSiteQuota(context.companyId)).reached : false;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sitios web"
        title="Sitios web"
        description="Arma el sitio de tu empresa sin escribir código, o pega tu propio HTML. Sus formularios (contacto, cotizaciones, inscripciones, reservas) llegan a la bandeja y, si quieres, directo al CRM, la academia o las tareas del equipo. También sirve como servicio de diseño web para clientes."
        actions={
          canWrite ? (
            quotaReached ? (
              <span className={buttonVariants({ variant: 'outline' })} aria-disabled="true" title="Llegaste al máximo de sitios activos de tu cuenta. Archiva o elimina uno.">
                <Plus className="size-4" aria-hidden="true" /> Nuevo sitio
              </span>
            ) : (
              <Link href="/dashboard/web-sites/new" className={buttonVariants()}>
                <Plus className="size-4" aria-hidden="true" /> Nuevo sitio
              </Link>
            )
          ) : undefined
        }
      />
      <WebSitesClient canWrite={canWrite} canPublish={can(context, 'websites:publish')} routeTargets={routeTargetsFor(context.features, context.permissions)} initialView={vista === 'bandeja' ? 'inbox' : 'sites'} />
    </div>
  );
}
