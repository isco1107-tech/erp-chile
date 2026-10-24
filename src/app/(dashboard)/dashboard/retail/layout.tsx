import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function RetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasRetailMetrics" permission="retail:read">
      {children}
    </ModuleGate>
  );
}
