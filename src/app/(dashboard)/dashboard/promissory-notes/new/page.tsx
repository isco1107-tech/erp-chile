import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import PromissoryNoteForm from '@/components/promissory-notes/PromissoryNoteForm';

export const metadata = { title: 'Nuevo Pagaré' };

export default async function NewPromissoryNotePage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `promissorynotes:write` llenaba el formulario completo para recibir
  // un 403 al guardar. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'promissorynotes:write')) redirect('/dashboard/promissory-notes');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nuevo Pagaré</h1>
      <PromissoryNoteForm hasCandidates={context.features.hasCandidates} />
    </div>
  );
}
