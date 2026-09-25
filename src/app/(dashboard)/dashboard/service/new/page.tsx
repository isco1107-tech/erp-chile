import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import ServiceTicketForm from '@/components/service/ServiceTicketForm';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listTechniciansAction } from '@/modules/service-desk/actions/service-tickets.actions';

export const metadata = { title: 'Recibir equipo' };

export default async function NewServiceTicketPage() {
  const context = await getAuthContext();
  if (!can(context, 'service:write')) redirect('/dashboard/service');
  const technicians = await listTechniciansAction();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Servicio técnico" title="Recibir equipo" description="Registra el equipo y la falla. Al guardar se abre el comprobante para imprimir o enviar, con el enlace de seguimiento del cliente." />
      <ServiceTicketForm technicians={technicians.success ? technicians.data : []} />
    </div>
  );
}
