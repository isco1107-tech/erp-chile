import { notFound } from 'next/navigation';
import ServiceTicketDetailClient from '@/components/service/ServiceTicketDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { prisma } from '@/lib/prisma';
import { getServiceTicketAction, listTechniciansAction } from '@/modules/service-desk/actions/service-tickets.actions';

export const metadata = { title: 'Orden de servicio' };

export default async function ServiceTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const [result, technicians, warehouses] = await Promise.all([
    getServiceTicketAction(id),
    listTechniciansAction(),
    prisma.warehouse.findMany({ where: { companyId: context.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  if (!result.success) notFound();
  return (
    <ServiceTicketDetailClient
      ticket={result.data}
      trackingUrl={`${getAppUrl()}/servicio/${result.data.trackingToken}`}
      technicians={technicians.success ? technicians.data : []}
      warehouses={warehouses}
      canWrite={can(context, 'service:write')}
      canSell={can(context, 'sales:write')}
    />
  );
}
