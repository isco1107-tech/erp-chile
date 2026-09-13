import VotingDashboardClient from '@/components/voting/VotingDashboardClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Votación Pagada del Público' };

export default async function VotingPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'publicvoting:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Votación Pagada del Público</h1>
      <VotingDashboardClient canWrite={canWrite} />
    </div>
  );
}
