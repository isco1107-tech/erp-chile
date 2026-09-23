import { Suspense } from 'react';
import ModuleGate from '@/components/ModuleGate';
import AccountingTabs from '@/components/accounting/AccountingTabs';

/**
 * Libros contables. La puerta del módulo cubre todas las subrutas; cada
 * página vuelve a exigir `accounting:view` al cargar sus datos.
 */
export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasAccounting" permission="accounting:view">
      <div className="space-y-6">
        <Suspense fallback={<div className="h-11 border-b border-border" />}>
          <AccountingTabs />
        </Suspense>
        {children}
      </div>
    </ModuleGate>
  );
}
