import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import SponsorshipForm from '@/components/sponsorships/SponsorshipForm';

export const metadata = { title: 'Nuevo Contrato de Auspicio' };

export default async function NewSponsorshipContractPage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `sponsorships:write` llenaba el formulario completo para recibir un
  // 403 al guardar. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'sponsorships:write')) redirect('/dashboard/sponsorships');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nuevo Contrato de Auspicio</h1>
      <SponsorshipForm />
    </div>
  );
}
