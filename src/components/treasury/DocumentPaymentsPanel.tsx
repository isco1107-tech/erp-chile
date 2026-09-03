'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RegisterPaymentDialog from './RegisterPaymentDialog';
import PaymentHistorySection from './PaymentHistorySection';

interface DocumentPaymentsPanelProps {
  kind: 'sales' | 'purchase';
  documentId: string;
  totalAmount: number;
  paidAmount: number;
  contactLabel: string;
}

export default function DocumentPaymentsPanel({
  kind,
  documentId,
  totalAmount,
  paidAmount,
  contactLabel,
}: DocumentPaymentsPanelProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRegistered() {
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex justify-end">
        <RegisterPaymentDialog
          kind={kind}
          documentId={documentId}
          totalAmount={totalAmount}
          paidAmount={paidAmount}
          contactLabel={contactLabel}
          onRegistered={handleRegistered}
        />
      </div>
      <PaymentHistorySection kind={kind} documentId={documentId} refreshKey={refreshKey} />
    </div>
  );
}
