import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import ServiceTicketForm from '@/components/service/ServiceTicketForm';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getServiceTicketAction, listTechniciansAction } from '@/modules/service-desk/actions/service-tickets.actions';
import type { SERVICE_PRIORITIES } from '@/modules/service-desk/schema';

export const metadata = { title: 'Editar orden de servicio' };

export default async function EditServiceTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'service:write')) redirect(`/dashboard/service/${id}`);
  const [result, technicians] = await Promise.all([getServiceTicketAction(id), listTechniciansAction()]);
  if (!result.success) notFound();
  const ticket = result.data;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Orden de servicio N° ${ticket.folio}`} title="Editar recepción" />
      <ServiceTicketForm
        technicians={technicians.success ? technicians.data : []}
        initial={{
          id: ticket.id,
          contactId: ticket.contactId,
          customerName: ticket.customer.name,
          equipment: ticket.equipment,
          brand: ticket.brand ?? '',
          model: ticket.model ?? '',
          serialNumber: ticket.serialNumber ?? '',
          accessories: ticket.accessories ?? '',
          reportedIssue: ticket.reportedIssue,
          priority: ticket.priority as (typeof SERVICE_PRIORITIES)[number],
          promisedDate: ticket.promisedDate ? new Date(ticket.promisedDate).toISOString().slice(0, 10) : '',
          warranty: ticket.warranty,
          technicianId: ticket.technicianId ?? '',
          notes: ticket.notes ?? '',
        }}
      />
    </div>
  );
}
