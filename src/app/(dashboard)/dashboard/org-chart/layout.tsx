import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function OrgChartLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasOrgChart" permission="orgchart:read">
      {children}
    </ModuleGate>
  );
}
