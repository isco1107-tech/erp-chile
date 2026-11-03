import SalesHistoryClient from '@/components/SalesHistoryClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Ventas & Facturación' };

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        className="duration-500 animate-in fade-in slide-in-from-bottom-2"
        eyebrow="Ventas"
        title="Ventas & Facturación"
        description="Cotizaciones, boletas y facturas electrónicas emitidas por tu empresa."
      />
      <SalesHistoryClient />
    </div>
  );
}
