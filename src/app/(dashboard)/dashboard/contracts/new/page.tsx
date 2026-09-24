import { PageHeader } from '@/components/ui/PageHeader';
import ContractForm, { EMPTY_CONTRACT } from '@/components/contracts/ContractForm';

export const metadata = { title: 'Nuevo contrato' };

export default function NewContractPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Contratos Recurrentes" title="Nuevo contrato" description="Define qué se factura, a quién y cada cuánto." />
      <ContractForm contractId={null} initial={EMPTY_CONTRACT} />
    </div>
  );
}
