import { notFound, redirect } from 'next/navigation';
import WebSiteEditor from '@/components/web-sites/WebSiteEditor';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { getWebSite } from '@/modules/web-sites/services/web-sites.service';

export const metadata = { title: 'Editar sitio web' };

export default async function WebSiteEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const context = await getAuthContext();
  // El servicio se llama directo (sin la acción): el permiso se exige acá.
  if (!can(context, 'websites:read')) redirect('/dashboard');

  const site = await getWebSite(context.companyId, id);
  if (!site) notFound();

  // Clientes para "Cliente asociado" en Ajustes: solo con permiso de contactos; el asociado siempre va en la lista.
  const contacts = can(context, 'contacts:read')
    ? await prisma.contact.findMany({
        where: { companyId: context.companyId, OR: [{ isCustomer: true }, ...(site.contactId ? [{ id: site.contactId }] : [])] },
        orderBy: { razonSocial: 'asc' },
        take: 1000,
        select: { id: true, razonSocial: true, nombreFantasia: true, rut: true },
      })
    : null;

  return (
    <WebSiteEditor
      site={site}
      contacts={contacts ? contacts.map((contact) => ({ id: contact.id, label: `${contact.nombreFantasia || contact.razonSocial} · ${contact.rut}` })) : null}
      canWrite={can(context, 'websites:write')}
      canPublish={can(context, 'websites:publish')}
      initialTab={typeof tab === 'string' ? tab : undefined}
    />
  );
}
