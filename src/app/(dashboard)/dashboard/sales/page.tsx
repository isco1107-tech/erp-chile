import SalesHistoryClient from '@/components/SalesHistoryClient';

export const metadata = { title: 'Ventas & Facturación' };

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div className="duration-500 animate-in fade-in slide-in-from-bottom-2">
        <h1 className="text-2xl font-semibold text-foreground">Ventas & Facturación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cotizaciones, boletas y facturas electrónicas emitidas por tu empresa.
        </p>
      </div>
      <SalesHistoryClient />
    </div>
  );
}
