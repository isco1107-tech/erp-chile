import TicketingDashboardClient from '@/components/ticketing/TicketingDashboardClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Venta de Entradas' };

export default async function TicketingPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'ticketing:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Venta de Entradas</h1>
      <TicketingDashboardClient canWrite={canWrite} />
    </div>
  );
}
