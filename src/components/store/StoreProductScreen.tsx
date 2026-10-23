import { Store, Truck, ShieldCheck } from 'lucide-react';
import { catalogHref, storeScreenHref } from '@/lib/ecommerce/store-href';
import { PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import type { PublicProductDetail, PublicStoreSettings } from '@/modules/ecommerce/services/store-public.service';
import ProductGallery from './ProductGallery';
import ProductPurchase from './ProductPurchase';
import { Breadcrumbs, discountPercent, Notice, PriceTag, StockText, StoreFrame } from './ui';
import { Fit } from '@/components/web-sites/site/parts';

/** Ficha de un producto: galería, precio con IVA, disponibilidad, compra y datos de entrega y pago. */
export default function StoreProductScreen({ product, settings, basePath, siteSlug }: { product: PublicProductDetail; settings: PublicStoreSettings; basePath: string; siteSlug: string }) {
  const off = discountPercent(product.grossPrice, product.compareAtPrice);
  const paragraphs = product.description.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  const payments = settings.paymentProviders.map((provider) => PAYMENT_PROVIDER_INFO[provider].label);
  return (
    <StoreFrame label={product.title}>
      <Breadcrumbs
        items={[
          { label: 'Tienda', href: storeScreenHref(basePath, 'catalog') },
          ...(product.collection ? [{ label: product.collection, href: catalogHref(basePath, { collection: product.collection }) }] : []),
          { label: product.title },
        ]}
      />
      <div className="grid gap-8 @3xl:grid-cols-2 @3xl:gap-12">
        <ProductGallery images={product.images} title={product.title} />
        <div className="min-w-0 space-y-5">
          <header className="space-y-2">
            {product.brand && <p className="ws-eyebrow break-words">{product.brand}</p>}
            <Fit>
              <h1 className="ws-h ws-t-2">{product.title}</h1>
            </Fit>
          </header>
          <div className="space-y-1">
            <PriceTag price={product.grossPrice} compareAt={product.compareAtPrice} size="lg" />
            <p className="ws-muted text-sm">
              IVA incluido{off !== null ? ` · ${off}% de descuento` : ''}
              {product.unit && product.unit !== 'UN' ? ` · por ${product.unit.toLowerCase()}` : ''}
            </p>
            <StockText state={product.stock.state} text={product.stock.text} />
          </div>
          {product.summary && <p className="text-lg leading-relaxed">{product.summary}</p>}
          <ProductPurchase
            siteSlug={siteSlug}
            productId={product.id}
            name={product.title}
            available={product.available}
            maxPerOrder={product.maxPerOrder}
            cartHref={storeScreenHref(basePath, 'cart')}
            checkoutHref={storeScreenHref(basePath, 'checkout')}
          />
          <ul className="ws-muted space-y-2 border-t border-[color:var(--s-line)] pt-5 text-sm">
            {settings.shippingEnabled && (
              <li className="flex items-start gap-3">
                <Truck className="mt-0.5 size-5 shrink-0 [color:var(--s-mark)]" aria-hidden="true" />
                <span>Despacho a domicilio: el costo se calcula en tu carrito según tu región.</span>
              </li>
            )}
            {settings.pickupEnabled && (
              <li className="flex items-start gap-3">
                <Store className="mt-0.5 size-5 shrink-0 [color:var(--s-mark)]" aria-hidden="true" />
                <span className="min-w-0 break-words">Retiro en tienda{settings.pickupAddress ? `: ${settings.pickupAddress}` : ''}.</span>
              </li>
            )}
            {payments.length > 0 && (
              <li className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 [color:var(--s-mark)]" aria-hidden="true" />
                <span>Paga con {payments.join(', ')}.</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {paragraphs.length > 0 && (
        <section aria-labelledby="product-description" className="mt-12 max-w-3xl">
          <h2 id="product-description" className="ws-h text-xl">
            Descripción
          </h2>
          <div className="mt-3 space-y-4 leading-relaxed">
            {paragraphs.map((text, index) => (
              <p key={index} className="break-words whitespace-pre-line">
                {text}
              </p>
            ))}
          </div>
        </section>
      )}
      {settings.returnsText && (
        <section aria-labelledby="product-returns" className="mt-8 max-w-3xl">
          <Notice>
            <h2 id="product-returns" className="mb-1 font-semibold">
              Cambios y devoluciones
            </h2>
            <p className="break-words whitespace-pre-line">{settings.returnsText}</p>
          </Notice>
        </section>
      )}
    </StoreFrame>
  );
}
