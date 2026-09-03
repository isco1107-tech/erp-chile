import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getPromissoryNoteAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';
import PromissoryNoteForm from '@/components/promissory-notes/PromissoryNoteForm';

export const metadata = { title: 'Editar Pagaré' };

export default async function EditPromissoryNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'promissorynotes:write')) redirect(`/dashboard/promissory-notes/${id}`);

  const result = await getPromissoryNoteAction(id);
  if (!result.success) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Pagaré</h1>
      <PromissoryNoteForm editingNote={result.data} hasCandidates={context.features.hasCandidates} />
    </div>
  );
}
