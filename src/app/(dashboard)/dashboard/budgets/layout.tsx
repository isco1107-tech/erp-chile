import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function BudgetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasBudgets" permission="budgets:read">
      {children}
    </ModuleGate>
  );
}
