import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import CandidateForm from '@/components/candidates/CandidateForm';

export const metadata = { title: 'Nueva Candidata' };

export default async function NewCandidatePage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `candidates:write` llenaba la ficha completa para recibir un 403 al
  // guardar. El layout del módulo ya cubrió el feature gate y el permiso de lectura.
  const context = await getAuthContext();
  if (!can(context, 'candidates:write')) redirect('/dashboard/candidates');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nueva Candidata</h1>
      <CandidateForm />
    </div>
  );
}
