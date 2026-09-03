import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasDteBilling" permission="sales:read">
      {children}
    </ModuleGate>
  );
}
