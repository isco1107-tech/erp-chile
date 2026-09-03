import { Suspense } from 'react';
import InventoryClient from '@/components/InventoryClient';

export const metadata = { title: 'Inventario' };

export default function InventoryPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Inventario & Kardex</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <InventoryClient />
      </Suspense>
    </div>
  );
}
