import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExpensesClient } from '@/components/expenses/ExpensesClient';

export const metadata = { title: 'Rendición de Gastos' };

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzas"
        title="Rendición de Gastos"
        description="Cada persona rinde sus boletas; una jefatura aprueba o rechaza y finanzas registra el reembolso. Nadie aprueba su propia rendición."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando rendiciones…</p>}>
        <ExpensesClient />
      </Suspense>
    </div>
  );
}
