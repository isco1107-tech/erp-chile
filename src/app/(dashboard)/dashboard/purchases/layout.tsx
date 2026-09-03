import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPurchases" permission="purchases:read">
      {children}
    </ModuleGate>
  );
}
