'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { MAX_LINE_QUANTITY } from '@/lib/ecommerce/cart';
import { useCart } from './use-cart';

/** Cantidad + «Agregar al carrito» + «Comprar ahora» de la ficha. */
export default function ProductPurchase({ siteSlug, productId, name, available, maxPerOrder, cartHref, checkoutHref }: { siteSlug: string; productId: string; name: string; available: number | null; maxPerOrder: number | null; cartHref: string; checkoutHref: string }) {
  const { lines, add } = useCart(siteSlug);
  const limit = Math.min(MAX_LINE_QUANTITY, maxPerOrder ?? MAX_LINE_QUANTITY, available ?? MAX_LINE_QUANTITY);
  const inCart = lines.find((line) => line.productId === productId)?.quantity ?? 0;
  const room = Math.max(0, limit - inCart);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  if (limit <= 0) {
    return (
      <button type="button" disabled className="ws-btn ws-btn-alt w-full opacity-60">
        Agotado
      </button>
    );
  }
  const wanted = Math.max(1, Math.min(quantity, Math.max(1, room)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Cantidad" className="ws-card inline-flex items-center overflow-hidden !rounded-[var(--ws-button-radius)]">
          <button type="button" className="ws-cbtn !size-11 !rounded-none !border-0" onClick={() => setQuantity(Math.max(1, wanted - 1))} disabled={wanted <= 1} aria-label="Una unidad menos">
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <output className="min-w-10 text-center font-semibold tabular-nums" aria-live="polite">
            {wanted}
          </output>
          <button type="button" className="ws-cbtn !size-11 !rounded-none !border-0" onClick={() => setQuantity(Math.min(Math.max(1, room), wanted + 1))} disabled={wanted >= room} aria-label="Una unidad más">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {inCart > 0 && <p className="ws-muted text-sm">Ya tienes {inCart} en tu carrito.</p>}
      </div>
      {maxPerOrder && <p className="ws-muted text-sm">Máximo {maxPerOrder} por pedido.</p>}
      <div className="flex flex-col gap-3 @md:flex-row">
        <button
          type="button"
          className="ws-btn ws-btn-main w-full @md:w-auto"
          disabled={room <= 0}
          onClick={() => {
            add(productId, wanted, limit);
            setMessage(`Agregamos ${wanted} ${wanted === 1 ? 'unidad' : 'unidades'} de «${name}» a tu carrito.`);
            setQuantity(1);
          }}
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          {room <= 0 ? 'Ya tienes el máximo' : 'Agregar al carrito'}
        </button>
        <a
          href={checkoutHref}
          className="ws-btn ws-btn-alt w-full @md:w-auto"
          onClick={() => {
            if (room > 0 && inCart === 0) add(productId, wanted, limit);
          }}
        >
          Comprar ahora
        </a>
      </div>
      <p role="status" className="min-h-5 text-sm">
        {message}{' '}
        {message && (
          <a href={cartHref} className="font-semibold underline underline-offset-4">
            Ver carrito
          </a>
        )}
      </p>
    </div>
  );
}
