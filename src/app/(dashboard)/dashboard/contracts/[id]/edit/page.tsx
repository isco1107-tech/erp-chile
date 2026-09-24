import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { toSantiagoDateInput } from '@/lib/chile/timezone';
import ContractForm from '@/components/contracts/ContractForm';
import { getContractAction } from '@/modules/contracts/actions/contracts.actions';
import { asContractDteType, asSalesPaymentMethod } from '@/modules/contracts/schema';

export const metadata = { title: 'Editar contrato' };

const toDateInput = (date: Date | null) => (date ? toSantiagoDateInput(new Date(date)) : '');

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getContractAction(id);
  if (!result.success) notFound();
  const contract = result.data;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Contratos Recurrentes" title={`Editar: ${contract.name}`} description="Los cambios aplican desde el próximo período; lo ya facturado no cambia." />
      <ContractForm
        contractId={contract.id}
        initial={{
          contact: { id: contract.contact.id, razonSocial: contract.contact.razonSocial, rut: contract.contact.rut },
          projectId: contract.projectId ?? '',
          name: contract.name,
          dteType: asContractDteType(contract.dteType),
          paymentMethod: asSalesPaymentMethod(contract.paymentMethod),
          paymentTermDays: contract.paymentTermDays,
          frequency: contract.frequency,
          startDate: toDateInput(contract.startDate),
          endDate: toDateInput(contract.endDate),
          autoIssue: contract.autoIssue,
          warehouseId: contract.warehouseId ?? '',
          notes: contract.notes ?? '',
          lines: contract.lines.map((line) => ({
            productId: line.productId ?? '',
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            isExempt: line.isExempt,
          })),
        }}
      />
    </div>
  );
}
