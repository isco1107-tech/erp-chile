import SalesHistoryClient from '@/components/SalesHistoryClient';

export const metadata = { title: 'Ventas & Facturación' };

export default function SalesPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Ventas & Facturación</h1>
      <SalesHistoryClient />
    </div>
  );
}
