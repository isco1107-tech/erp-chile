'use client';

import { Minus, Plus, Trash2, X } from 'lucide-react';
import { productHref, storeScreenHref } from '@/lib/ecommerce/store-href';
import { StoreFrame, StoreTitle, Notice, ProductImage, money } from './ui';
import { useCart, useHydrated } from './use-cart';
import { useQuote } from './use-quote';

/** Carrito: se valoriza contra el servidor cada vez que cambia; el navegador solo guarda producto y cantidad. */
export default function CartScreen({ siteSlug, basePath }: { siteSlug: string; basePath: string }) {
  const cart = useCart(siteSlug);
  const hydrated = useHydrated();
  const { quote, loading, error, notices, dismissNotices } = useQuote(siteSlug, cart.lines, cart);
  const catalog = storeScreenHref(basePath, 'catalog');

  if (!hydrated) {
    return (
      <StoreFrame label="Carrito">
        <StoreTitle title="Tu carrito" />
        <p className="ws-muted" role="status">
          Cargando tu carrito…
        </p>
      </StoreFrame>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <StoreFrame label="Carrito" width="narrow">
        <StoreTitle title="Tu carrito está vacío" intro="Agrega productos desde el catálogo y aparecerán acá." />
        <a href={catalog} className="ws-btn ws-btn-main">
          Ver el catálogo
        </a>
      </StoreFrame>
    );
  }

  const lines = quote?.lines ?? [];
  const blocked = lines.some((line) => line.problem === 'OUT_OF_STOCK');
  return (
    <StoreFrame label="Carrito">
      <StoreTitle title="Tu carrito" />
      {notices.length > 0 && (
        <div className="mb-5">
          <Notice tone="info">
            <div className="flex items-start justify-between gap-3">
              <ul className="space-y-1">
                {[...new Set(notices)].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <button type="button" onClick={dismissNotices} aria-label="Cerrar aviso" className="shrink-0 cursor-pointer">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="space-y-3" aria-busy={loading}>
          {!quote &&
            cart.lines.map((line) => (
              <li key={line.productId} className="ws-card h-28 animate-pulse" aria-hidden="true" />
            ))}
          {lines.map((line) => {
            const max = Math.min(99, line.maxPerOrder ?? 99, line.available ?? 99);
            return (
              <li key={line.productId} className="ws-card flex gap-3 p-3 @2xl:gap-4 @2xl:p-4">
                <a href={productHref(basePath, line.slug)} className="shrink-0" tabIndex={-1} aria-hidden="true">
                  <ProductImage src={line.imageUrl} alt="" className="size-16 rounded-[var(--ws-radius)] object-cover @sm:size-20 @2xl:size-24" />
                </a>
                <div className="flex min-w-0 grow flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="ws-h min-w-0 text-base leading-snug break-words">
                      <a href={productHref(basePath, line.slug)} className="underline-offset-4 hover:underline">
                        {line.name}
                      </a>
                    </h2>
                    <button type="button" onClick={() => cart.remove(line.productId)} aria-label={`Quitar ${line.name} del carrito`} className="ws-muted -mt-1 -mr-1 shrink-0 cursor-pointer p-1 hover:[color:var(--s-fg)]">
                      <Trash2 className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="ws-muted text-sm">{money(line.grossUnit)} c/u</p>
                  {line.problem === 'OUT_OF_STOCK' ? (
                    <p className="ws-error">Este producto se agotó. Quítalo para seguir.</p>
                  ) : (
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div role="group" aria-label={`Cantidad de ${line.name}`} className="ws-card inline-flex items-center overflow-hidden !rounded-[var(--ws-button-radius)]">
                        <button type="button" className="ws-cbtn !size-9 !rounded-none !border-0" onClick={() => cart.set(line.productId, line.quantity - 1, max)} aria-label={line.quantity <= 1 ? `Quitar ${line.name}` : 'Una unidad menos'}>
                          <Minus className="size-4" aria-hidden="true" />
                        </button>
                        <output className="min-w-9 text-center text-sm font-semibold tabular-nums">{line.quantity}</output>
                        <button type="button" className="ws-cbtn !size-9 !rounded-none !border-0" onClick={() => cart.set(line.productId, line.quantity + 1, max)} disabled={line.quantity >= max} aria-label="Una unidad más">
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="ws-h font-bold [color:var(--s-mark)] tabular-nums">{money(line.displayTotal)}</p>
                    </div>
                  )}
                  {line.quantity >= max && max < 99 && line.problem !== 'OUT_OF_STOCK' && <p className="ws-muted text-xs">Es lo máximo que podemos entregarte.</p>}
                </div>
              </li>
            );
          })}
        </ul>

        <aside aria-label="Resumen" className="ws-card h-fit space-y-4 p-5 @4xl:sticky @4xl:top-24">
          <h2 className="ws-h text-lg">Resumen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">Productos (IVA incluido)</dt>
              <dd className="font-semibold tabular-nums">{quote ? money(quote.subtotal) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">Despacho</dt>
              <dd className="ws-muted text-right">Se calcula al finalizar</dd>
            </div>
          </dl>
          {quote?.belowMinimum && <Notice>La compra mínima de esta tienda es de {money(quote.minOrderAmount)}. Agrega productos para continuar.</Notice>}
          <a
            href={quote?.ready && !blocked ? storeScreenHref(basePath, 'checkout') : undefined}
            aria-disabled={!quote?.ready || blocked}
            className={`ws-btn ws-btn-main w-full ${!quote?.ready || blocked ? 'pointer-events-none opacity-50' : ''}`}
          >
            Continuar con la compra
          </a>
          <a href={catalog} className="ws-muted block text-center text-sm underline underline-offset-4">
            Seguir comprando
          </a>
        </aside>
      </div>
    </StoreFrame>
  );
}
