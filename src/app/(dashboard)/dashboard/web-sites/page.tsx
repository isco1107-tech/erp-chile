import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import WebSitesClient from '@/components/web-sites/WebSitesClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Sitios web' };

export default async function WebSitesPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'websites:write');
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sitios web"
        title="Sitios web"
        description="Arma el sitio de tu empresa sin escribir código, o pega tu propio HTML. También sirve como servicio de diseño web: crea el sitio de un cliente, asócialo a su ficha y publícalo en su dominio."
        actions={
          canWrite ? (
            <Link href="/dashboard/web-sites/new" className={buttonVariants()}>
              <Plus className="size-4" aria-hidden="true" /> Nuevo sitio
            </Link>
          ) : undefined
        }
      />
      <WebSitesClient canWrite={canWrite} canPublish={can(context, 'websites:publish')} />
    </div>
  );
}
