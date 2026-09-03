import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getSponsorshipContractAction } from '@/modules/sponsorships/actions/sponsorships.actions';
import SponsorshipForm from '@/components/sponsorships/SponsorshipForm';

export const metadata = { title: 'Editar Contrato de Auspicio' };

export default async function EditSponsorshipContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'sponsorships:write')) redirect(`/dashboard/sponsorships/${id}`);

  const result = await getSponsorshipContractAction(id);
  if (!result.success) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Contrato de Auspicio</h1>
      <SponsorshipForm editingContract={result.data} />
    </div>
  );
}
