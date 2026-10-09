import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import WebSitesClient from '@/components/web-sites/WebSitesClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { routeTargetsFor } from '@/lib/web-sites/forms';

export const metadata = { title: 'Sitios web' };

export default async function WebSitesPage({ searchParams }: { searchParams: Promise<{ vista?: string | string[] }> }) {
  const [context, { vista }] = await Promise.all([getAuthContext(), searchParams]);
  const canWrite = can(context, 'websites:write');
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sitios web"
        title="Sitios web"
        description="Arma el sitio de tu empresa sin escribir código, o pega tu propio HTML. Sus formularios (contacto, cotizaciones, inscripciones, reservas) llegan a la bandeja y, si quieres, directo al CRM, la academia o las tareas del equipo. También sirve como servicio de diseño web para clientes."
        actions={
          canWrite ? (
            <Link href="/dashboard/web-sites/new" className={buttonVariants()}>
              <Plus className="size-4" aria-hidden="true" /> Nuevo sitio
            </Link>
          ) : undefined
        }
      />
      <WebSitesClient canWrite={canWrite} canPublish={can(context, 'websites:publish')} routeTargets={routeTargetsFor(context.features, context.permissions)} initialView={vista === 'bandeja' ? 'inbox' : 'sites'} />
    </div>
  );
}
