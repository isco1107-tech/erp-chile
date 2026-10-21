import { PageHeader } from '@/components/ui/PageHeader';
import CustomerCareClient from '@/components/customer-care/CustomerCareClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Fidelización y clientes' };

export default async function CustomerCarePage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Fidelización y clientes"
        description="Cómo te encuentran los clientes, qué tan satisfechos quedan y a quién hay que volver a contactar porque dejó de comprar."
      />
      <CustomerCareClient canWrite={can(context, 'customercare:write')} />
    </div>
  );
}
