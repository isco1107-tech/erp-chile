'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { storeScreenHref, productHref } from '@/lib/ecommerce/store-href';
import { useCart } from './use-cart';
import { useQuote } from './use-quote';
import { money, ProductImage, Notice } from './ui';

function CartContents({ siteSlug, basePath, close }: { siteSlug: string; basePath: string; close: () => void }) {
  const cart = useCart(siteSlug);
  const { quote, loading, error, refresh } = useQuote(siteSlug, cart.lines, cart);
  return (
    <>
      <div className="ec-drawer-body">
        {cart.lines.length === 0 ? (
          <div className="py-12 text-center">
            <ShoppingBag className="mx-auto mb-4 size-10 opacity-50" aria-hidden="true" />
            <h3 className="ws-h text-xl">Aquí empieza tu próxima compra</h3>
            <p className="ws-muted mt-2 text-sm">Elige tus favoritos y vuelve cuando quieras.</p>
            <button type="button" onClick={close} className="ws-btn ws-btn-main mt-5">
              Seguir explorando
            </button>
          </div>
        ) : (
          <>
            {error && (
              <Notice tone="error">
                {error}
                <button type="button" onClick={refresh} className="mt-2 block underline">
                  Reintentar
                </button>
              </Notice>
            )}
            <ul className="space-y-6" aria-busy={loading}>
              {quote?.lines.map((line) => {
                const max = Math.min(99, line.available ?? 99, line.maxPerOrder ?? 99);
                return (
                  <li key={line.productId} className="flex gap-4 border-b border-[color:var(--s-line)] pb-6">
                    <a href={productHref(basePath, line.slug)} tabIndex={-1} aria-hidden="true">
                      <ProductImage src={line.imageUrl} alt="" className="size-20 rounded-xl object-cover" />
                    </a>
                    <div className="min-w-0 grow">
                      <a href={productHref(basePath, line.slug)} className="ws-h block text-sm font-semibold">
                        {line.name}
                      </a>
                      <p className="mt-1 text-sm">{money(line.displayTotal)}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-full border border-[color:var(--s-line)]">
                          <button
                            type="button"
                            className="ws-cbtn"
                            aria-label={`Restar una unidad de ${line.name}`}
                            onClick={() => cart.set(line.productId, line.quantity - 1, max)}
                          >
                            <Minus className="size-4" />
                          </button>
                          <output className="min-w-6 text-center text-sm">{line.quantity}</output>
                          <button
                            type="button"
                            className="ws-cbtn"
                            disabled={line.quantity >= max}
                            aria-label={`Sumar una unidad de ${line.name}`}
                            onClick={() => cart.set(line.productId, line.quantity + 1, max)}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                        <button type="button" className="ws-cbtn" aria-label={`Eliminar ${line.name}`} onClick={() => cart.remove(line.productId)}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {!quote && loading && (
                <li role="status" className="ws-muted text-sm">
                  Actualizando precios y disponibilidad…
                </li>
              )}
            </ul>
          </>
        )}
      </div>
      {cart.lines.length > 0 && (
        <div className="ec-drawer-footer">
          <div className="mb-2 flex justify-between gap-4">
            <span>Subtotal</span>
            <strong>{quote ? money(quote.subtotal) : '—'}</strong>
          </div>
          <p className="ws-muted mb-4 text-xs">Despacho y total final en el siguiente paso.</p>
          <a href={storeScreenHref(basePath, 'cart')} className="ws-btn ws-btn-main w-full">
            Ver carrito y continuar
          </a>
        </div>
      )}
    </>
  );
}

export default function QuickCart({ siteSlug, basePath }: { siteSlug: string; basePath: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const opener = trigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [open]);
  return (
    <>
      <button ref={trigger} type="button" className="ec-quick" aria-label="Vista rápida del carrito" onClick={() => setOpen(true)}>
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <dialog
          ref={ref}
          className="ec-drawer"
          aria-label="Vista rápida del carrito"
          onCancel={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (event.clientX < rect.left || event.clientX > rect.right) setOpen(false);
            }
          }}
        >
          <div className="ec-drawer-shell">
            <div className="ec-drawer-head">
              <h2 className="ws-h text-xl">Tu selección</h2>
              <button type="button" className="ws-cbtn" aria-label="Cerrar resumen del carrito" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <CartContents siteSlug={siteSlug} basePath={basePath} close={() => setOpen(false)} />
          </div>
        </dialog>
      )}
    </>
  );
}
