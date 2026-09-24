'use client';

import { useRouter } from 'next/navigation';
import MoneyMovementDialog, { type TreasuryAccountChoice } from '@/components/treasury/MoneyMovementDialog';
import { markFeeDocumentPaidAction } from '@/modules/fees/actions/fees.actions';

interface Props {
  documentId: string;
  folioNumber: string;
  netToPay: number;
  providerName: string;
  accounts: TreasuryAccountChoice[];
}

/** Paga el líquido de la boleta: queda como egreso en Tesorería y, con Contabilidad activa, con su asiento. */
export default function MarkFeeDocumentPaidButton({ documentId, folioNumber, netToPay, providerName, accounts }: Props) {
  const router = useRouter();
  return (
    <MoneyMovementDialog
      triggerLabel="Pagar boleta"
      title={`Pagar BHE N° ${folioNumber}`}
      description={`Líquido a pagar a ${providerName}. La retención queda por enterar en el F29.`}
      direction="EXPENSE"
      amount={netToPay}
      fixedAmount
      accounts={accounts}
      onSubmit={async (values) => {
        const result = await markFeeDocumentPaidAction(documentId, values);
        return result.success ? { success: true, message: result.message } : result;
      }}
      onDone={() => router.refresh()}
    />
  );
}
