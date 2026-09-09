import { Suspense } from 'react';
import InventoryClient from '@/components/InventoryClient';

export const metadata = { title: 'Inventario' };

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div className="duration-500 animate-in fade-in slide-in-from-bottom-2">
        <h1 className="text-2xl font-semibold text-foreground">Inventario & Kardex</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Existencias por bodega, valorización a costo PMP y trazabilidad de movimientos.
        </p>
      </div>
      <Suspense fallback={<p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">Cargando inventario...</p>}>
        <InventoryClient />
      </Suspense>
    </div>
  );
}
