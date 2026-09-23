import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasSalesPipeline" permission="crm:read">
      {children}
    </ModuleGate>
  );
}
