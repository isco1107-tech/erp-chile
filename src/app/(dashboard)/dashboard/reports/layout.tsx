import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasAdvancedReports" permission="reports:read">
      {children}
    </ModuleGate>
  );
}
