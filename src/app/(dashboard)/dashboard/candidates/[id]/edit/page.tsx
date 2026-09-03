import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getCandidateAction } from '@/modules/candidates/actions/candidates.actions';
import CandidateForm from '@/components/candidates/CandidateForm';

export const metadata = { title: 'Editar Candidata' };

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'candidates:write')) redirect('/dashboard/candidates');

  const result = await getCandidateAction(id);
  if (!result.success) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Candidata</h1>
      <CandidateForm editingCandidate={result.data} />
    </div>
  );
}
