import { PageHeader } from '@/components/ui/PageHeader';
import ReceivedDteInboxClient from '@/components/dte/ReceivedDteInboxClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'DTE recibidos' };

export default async function ReceivedDteInboxPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="DTE recibidos"
        description="Facturas, notas y guías electrónicas que te emiten tus proveedores. Carga el XML, revisa el timbre, acepta o reclama dentro de los 8 días y pásalas a Compras sin volver a tipearlas."
      />
      <ReceivedDteInboxClient canWrite={can(context, 'purchases:write')} />
    </div>
  );
}
