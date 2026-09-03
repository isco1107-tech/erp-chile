import { Suspense } from 'react';
import ProductsClient from '@/components/ProductsClient';

export const metadata = { title: 'Catálogo de Productos' };

export default function ProductsPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Catálogo de Productos</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ProductsClient />
      </Suspense>
    </div>
  );
}
