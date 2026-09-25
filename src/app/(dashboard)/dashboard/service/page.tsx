import { PageHeader } from '@/components/ui/PageHeader';
import ServiceTicketsClient from '@/components/service/ServiceTicketsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Servicio técnico' };

export default async function ServicePage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Servicio técnico"
        description="Recepción de equipos, diagnóstico, presupuesto que el cliente aprueba desde su enlace, reparación y entrega. El cobro sale como nota de venta."
      />
      <ServiceTicketsClient canWrite={can(context, 'service:write')} />
    </div>
  );
}
