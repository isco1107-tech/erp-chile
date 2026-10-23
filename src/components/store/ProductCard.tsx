import type { PublicProductCard } from '@/modules/ecommerce/services/store-public.service';
import { productHref } from '@/lib/ecommerce/store-href';
import AddToCartButton from './AddToCartButton';
import { discountPercent, PriceTag, ProductImage, StockText } from './ui';

/** Tarjeta de un producto del catálogo: foto, nombre, precio con IVA y agregar al carrito. */
export default function ProductCard({ product, basePath, siteSlug, eager = false }: { product: PublicProductCard; basePath: string; siteSlug: string; eager?: boolean }) {
  const href = productHref(basePath, product.slug);
  const off = discountPercent(product.grossPrice, product.compareAtPrice);
  const soldOut = product.stock.state === 'out';
  return (
    <article className="ws-card ws-card-hover flex h-full min-w-0 flex-col overflow-hidden text-left">
      <a href={href} className="relative block" tabIndex={-1} aria-hidden="true">
        <ProductImage src={product.imageUrl} alt="" eager={eager} className={`aspect-square w-full object-cover ${soldOut ? 'opacity-55' : ''}`} />
        {off !== null && !soldOut && <span className="absolute top-3 left-3 rounded-full bg-[color:var(--s-btn)] px-2.5 py-1 text-xs font-bold text-[color:var(--s-btn-fg)] shadow">-{off}%</span>}
        {soldOut && <span className="absolute top-3 left-3 rounded-full bg-[color:var(--ws-dark)] px-2.5 py-1 text-xs font-bold text-[color:var(--ws-on-dark)] shadow">Agotado</span>}
      </a>
      <div className="flex grow flex-col gap-1.5 p-4">
        {product.collection && <p className="ws-eyebrow break-words">{product.collection}</p>}
        <h3 className="ws-h text-base leading-snug break-words">
          <a href={href} className="underline-offset-4 hover:underline">
            {product.title}
          </a>
        </h3>
        {product.summary && <p className="ws-muted line-clamp-2 text-sm">{product.summary}</p>}
        <PriceTag price={product.grossPrice} compareAt={product.compareAtPrice} />
        {product.stock.state === 'low' && <StockText state={product.stock.state} text={product.stock.text} />}
        <div className="mt-auto pt-3">
          <AddToCartButton siteSlug={siteSlug} productId={product.id} available={product.available} maxPerOrder={product.maxPerOrder} name={product.title} />
        </div>
      </div>
    </article>
  );
}
