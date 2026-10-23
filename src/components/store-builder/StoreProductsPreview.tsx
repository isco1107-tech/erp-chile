'use client';
import { useEffect, useState } from 'react';
import type { BlockOf } from '@/lib/web-sites/blocks';
import type { PublicProductCard } from '@/modules/ecommerce/services/store-public.service';
import type { previewStoreProductsAction } from '@/modules/ecommerce/actions/store-editor.actions';
import CommerceCatalogSection from './CommerceCatalogSection';

export default function StoreProductsPreview({
  block,
  siteId,
  siteSlug,
  basePath,
}: {
  block: BlockOf<'catalog'>;
  siteId: string;
  siteSlug: string;
  basePath: string;
}) {
  const [products, setProducts] = useState<PublicProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const collection = block.store?.collection ?? '';
  const featuredOnly = block.store?.featuredOnly ?? false;
  const limit = block.store?.limit ?? 8;
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ siteId, collection, featuredOnly: String(featuredOnly), limit: String(limit) });
      void fetch(`/api/store/design-products?${query}`, { cache: 'no-store' })
        .then((response) => response.json() as Promise<Awaited<ReturnType<typeof previewStoreProductsAction>>>)
        .then((result) => {
          if (!active) return;
          if (result.success) {
            setProducts(result.data.products);
            setError(null);
          } else setError(result.error);
        })
        .catch(() => {
          if (active) setError('No pudimos cargar los productos. Revisa tu conexión.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [siteId, collection, featuredOnly, limit]);
  if (error)
    return (
      <p role="alert" className="ws-muted p-5">
        {error}
      </p>
    );
  if (loading)
    return (
      <p role="status" className="ws-muted p-5">
        Cargando productos reales de tu tienda…
      </p>
    );
  return <CommerceCatalogSection block={block} products={products} siteSlug={siteSlug} basePath={basePath} preview />;
}
