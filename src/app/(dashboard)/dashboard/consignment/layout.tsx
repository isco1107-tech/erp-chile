import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ConsignmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasConsignment" permission="consignment:read">
      {children}
    </ModuleGate>
  );
}
