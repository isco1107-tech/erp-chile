import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import PaymentBatchForm from '@/components/treasury/PaymentBatchForm';
import { listPayableOptionsAction } from '@/modules/treasury/actions/payment-batches.actions';
import { listBankAccountsAction } from '@/modules/treasury/actions/banks.actions';

export const metadata = { title: 'Nueva nómina de pago' };

export default async function NewPaymentBatchPage() {
  // Sin permiso de escritura, de vuelta al listado (el layout ya exige lectura).
  const session = await requireAuthWithPermission('treasury:write').catch(() => null);
  if (!session) redirect('/dashboard/treasury/payment-batches');
  const [payables, accounts] = await Promise.all([listPayableOptionsAction(), listBankAccountsAction()]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/treasury/payment-batches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Nóminas de pago
      </Link>
      <PageHeader eyebrow="Tesorería" title="Nueva nómina de pago" description="Marca las facturas a pagar. Puedes pagar un monto parcial editándolo." />
      <PaymentBatchForm
        payables={payables.success ? payables.data : []}
        bankAccounts={accounts.success ? accounts.data.map((account) => ({ id: account.id, name: account.name, isDefault: account.isDefault })) : []}
      />
    </div>
  );
}
