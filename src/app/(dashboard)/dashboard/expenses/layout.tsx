import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasExpenseReports" permission="expenses:submit">
      {children}
    </ModuleGate>
  );
}
