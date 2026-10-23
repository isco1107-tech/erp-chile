import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';
import NewWebSiteWizard from '@/components/web-sites/NewWebSiteWizard';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { quotaReachedMessage } from '@/lib/web-sites/quota';
import { listContactsPage } from '@/modules/contacts/services/contacts.service';
import { getSiteQuota } from '@/modules/web-sites/services/web-sites.service';

export const metadata = { title: 'Nuevo sitio' };

const MAX_CONTACTS = 200;

export default async function NewWebSitePage() {
  const context = await getAuthContext();
  if (!can(context, 'websites:write')) redirect('/dashboard/web-sites');

  // El tope de sitios lo fija la Supersuite: con el cupo lleno no tiene sentido armar el asistente para fallar al final.
  const quota = await getSiteQuota(context.companyId);
  if (quota.reached) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Sitios web" title="Nuevo sitio" />
        <EmptyState
          icon={<Gauge className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title={`Ya usas los ${quota.max} sitios de tu cuenta`}
          description={quotaReachedMessage(quota)}
          action={
            <Link href="/dashboard/web-sites" className={buttonVariants({ variant: 'outline' })}>
              Volver a mis sitios
            </Link>
          }
        />
      </div>
    );
  }

  // El selector de cliente solo aparece si el usuario puede ver clientes.
  let contacts: { id: string; name: string }[] = [];
  let contactsTruncated = false;
  if (can(context, 'contacts:read')) {
    const page = await listContactsPage(context.companyId, { type: 'customers', pageSize: MAX_CONTACTS });
    contacts = page.items
      .map((contact) => ({ id: contact.id, name: contact.nombreFantasia || contact.razonSocial }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    contactsTruncated = page.total > page.items.length;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sitios web" title="Nuevo sitio" description="Tres pasos: tu rubro, cómo lo quieres armar y cómo se va a llamar. Te lo entregamos armado; después lo ajustas con calma antes de publicarlo." />
      <NewWebSiteWizard contacts={contacts} contactsTruncated={contactsTruncated} baseUrl={getAppUrl()} />
    </div>
  );
}
