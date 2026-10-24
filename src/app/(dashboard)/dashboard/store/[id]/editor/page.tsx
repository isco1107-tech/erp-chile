import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { destinationAccess, routeTargetsFor } from '@/lib/web-sites/forms';
import StorefrontEditor from '@/components/store-builder/StorefrontEditor';
import { getStoreEditorAction } from '@/modules/ecommerce/actions/store-editor.actions';

export const metadata = { title: 'Creador Ecommerce · Páginas de marca' };
export default async function StorefrontEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; form?: string }>;
}) {
  const [{ id }, search, context] = await Promise.all([params, searchParams, getAuthContext()]);
  if (!context.features.hasEcommerce || !can(context, 'store:read')) redirect('/dashboard');
  const result = await getStoreEditorAction(id);
  if (!result.success) notFound();
  return (
    <StorefrontEditor
      site={result.data}
      contacts={null}
      canWrite={can(context, 'store:manage')}
      canPublish={can(context, 'store:manage')}
      formAccess={destinationAccess(context.features, context.permissions)}
      canReadAcademy={can(context, 'academy:read')}
      routeTargets={routeTargetsFor(context.features, context.permissions)}
      initialTab={search.tab}
      initialFormId={search.form?.slice(0, 40) ?? null}
    />
  );
}
