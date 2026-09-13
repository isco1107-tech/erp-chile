import CashFlowClient from '@/components/treasury/CashFlowClient';

export const metadata = { title: 'Flujo de Caja' };

export default function CashFlowPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Flujo de Caja</h1>
      <CashFlowClient />
    </div>
  );
}
