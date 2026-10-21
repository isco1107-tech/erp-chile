import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import NewWebSiteWizard from '@/components/web-sites/NewWebSiteWizard';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { listContactsPage } from '@/modules/contacts/services/contacts.service';

export const metadata = { title: 'Nuevo sitio' };

const MAX_CONTACTS = 200;

export default async function NewWebSitePage() {
  const context = await getAuthContext();
  if (!can(context, 'websites:write')) redirect('/dashboard/web-sites');

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
