import { redirect } from 'next/navigation';
import InvoiceArchiveClient from '@/components/invoice-archive/InvoiceArchiveClient';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Archivo de facturas' };

export default async function InvoiceArchivePage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archivo de facturas"
        description="Guarda cada factura con su proveedor, total y la foto o PDF, y revisa el histórico de compras de cada proveedor."
      />
      {can(context, 'invoicearchive:read') ? (
        <InvoiceArchiveClient canWrite={can(context, 'invoicearchive:write')} />
      ) : (
        <EmptyState title="No tienes acceso a esta sección" description="Pide a un Administrador de tu empresa que agregue a tu rol el permiso de ver el archivo de facturas." />
      )}
    </div>
  );
}
