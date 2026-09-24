import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import ContractsListClient from '@/components/contracts/ContractsListClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listContractsAction } from '@/modules/contracts/actions/contracts.actions';

export const metadata = { title: 'Contratos Recurrentes' };

export default async function ContractsPage() {
  const [context, result] = await Promise.all([getAuthContext(), listContractsAction()]);
  if (!result.success) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Servicios"
        title="Contratos Recurrentes"
        description="Igualas, mantenciones, arriendos y suscripciones que se facturan solos cada período."
      />
      <ContractsListClient contracts={result.data} canWrite={can(context, 'contracts:write')} />
    </div>
  );
}
