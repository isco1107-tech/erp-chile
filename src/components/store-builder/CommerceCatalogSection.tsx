import Carousel from '@/components/web-sites/site/Carousel';
import type { BlockOf } from '@/lib/web-sites/blocks';
import type { PublicProductCard } from '@/modules/ecommerce/services/store-public.service';
import ProductCard from '@/components/store/ProductCard';
import { catalogHref } from '@/lib/ecommerce/store-href';
import StoreProductsPreview from './StoreProductsPreview';

export default function CommerceCatalogSection({
  block,
  products,
  siteSlug,
  basePath,
  previewSiteId,
  preview = false,
  open = true,
}: {
  block: BlockOf<'catalog'>;
  products?: PublicProductCard[];
  siteSlug: string;
  basePath: string;
  previewSiteId?: string;
  preview?: boolean;
  open?: boolean;
}) {
  if (preview && previewSiteId) return <StoreProductsPreview block={block} siteId={previewSiteId} siteSlug={siteSlug} basePath={basePath} />;
  const rows = products ?? [];
  const cards = rows.map((product) => (
    <li
      key={product.id}
      className={`min-w-0 ${block.variant === 'minimal' ? '[&_.ec-product-photo]:hidden' : block.variant === 'list' ? '@xl:[&>article]:flex-row @xl:[&_.ec-product-photo]:w-28 @xl:[&_.ec-product-photo]:shrink-0 @xl:[&_.ec-product-body]:p-4' : ''}`}
    >
      <ProductCard product={product} basePath={basePath} siteSlug={siteSlug} preview={preview || !open} />
    </li>
  ));
  return (
    <div className="space-y-6" data-commerce-section={block.id}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {block.heading && <h2 className="ws-h text-2xl @2xl:text-3xl">{block.heading}</h2>}
          {block.intro && <p className="ws-muted mt-3 max-w-2xl">{block.intro}</p>}
        </div>
        <a
          className="ws-btn ws-btn-alt ws-btn-sm"
          href={preview || !open ? undefined : catalogHref(basePath, { collection: block.store?.collection || undefined })}
        >
          Ver catálogo completo
        </a>
      </div>
      {rows.length > 0 && block.variant === 'carousel' ? (
        <Carousel label={block.heading || 'Productos'} itemClassName="basis-[min(75cqw,280px)] shrink-0">
          {rows.map((product) => (
            <ProductCard key={product.id} product={product} basePath={basePath} siteSlug={siteSlug} preview={preview || !open} />
          ))}
        </Carousel>
      ) : rows.length > 0 ? (
        <ul
          className={`grid grid-cols-1 gap-5 @sm:grid-cols-2 ${block.columns === '2' ? '@3xl:grid-cols-2' : block.columns === '4' ? '@5xl:grid-cols-4' : '@4xl:grid-cols-3'}`}
        >
          {cards}
        </ul>
      ) : (
        <p className="ws-muted rounded-xl border border-[color:var(--s-line)] p-6">
          {preview
            ? 'Publica productos en la administración de la tienda para verlos aquí. Los precios y la disponibilidad vienen del ERP.'
            : 'Estamos preparando nuestra próxima selección. Vuelve pronto.'}
        </p>
      )}
    </div>
  );
}
