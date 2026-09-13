import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function PaymentPlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasInstallmentPlans" permission="paymentplans:read">
      {children}
    </ModuleGate>
  );
}
