import { Suspense } from 'react';
import InventoryClient from '@/components/InventoryClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Inventario' };

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario & Kardex"
        description="Existencias por bodega, valorización a costo PMP y trazabilidad de movimientos: aquí ves cuánto tienes de cada producto, ajustas el stock y registras entradas."
        className="duration-500 animate-in fade-in slide-in-from-bottom-2"
      />
      <Suspense fallback={<p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">Cargando inventario...</p>}>
        <InventoryClient />
      </Suspense>
    </div>
  );
}
