import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPayroll" permission="payroll:read">
      {children}
    </ModuleGate>
  );
}
