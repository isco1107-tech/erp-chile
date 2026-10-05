import { Suspense } from 'react';
import ProductsClient from '@/components/ProductsClient';
import { PageHeader } from '@/components/ui/PageHeader';
import { SCREEN_PURPOSES } from '@/modules/manual/knowledge';

export const metadata = { title: 'Catálogo de Productos' };

export default function ProductsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Catálogo de Productos" description={SCREEN_PURPOSES.products} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ProductsClient />
      </Suspense>
    </div>
  );
}
