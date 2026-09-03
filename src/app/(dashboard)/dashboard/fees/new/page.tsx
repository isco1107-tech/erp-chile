import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import FeeDocumentForm from '@/components/fees/FeeDocumentForm';

export const metadata = { title: 'Registrar Boleta de Honorarios' };

export default async function NewFeeDocumentPage() {
  // El guard vive también acá y no solo en la Server Action: sin esto un rol
  // sin `fees:write` llenaba el formulario completo para recibir un 403 al
  // guardar. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'fees:write')) redirect('/dashboard/fees');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Registrar Boleta de Honorarios</h1>
      <FeeDocumentForm />
    </div>
  );
}
