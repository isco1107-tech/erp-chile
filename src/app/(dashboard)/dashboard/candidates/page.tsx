import { can, getAuthContext } from '@/lib/auth/guards';
import CandidateListClient from '@/components/candidates/CandidateListClient';

export const metadata = { title: 'Candidatas & Staff' };

export default async function CandidatesPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'candidates:write');
  const canExport = can(context, 'candidates:sensitive');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Candidatas & Staff</h1>
      <CandidateListClient canWrite={canWrite} canExport={canExport} />
    </div>
  );
}
