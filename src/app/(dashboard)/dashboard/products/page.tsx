import { Suspense } from 'react';
import ProductsClient from '@/components/ProductsClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Catálogo de Productos' };

export default function ProductsPage() {
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Inventario" title="Catálogo de Productos" />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ProductsClient />
      </Suspense>
    </div>
  );
}
