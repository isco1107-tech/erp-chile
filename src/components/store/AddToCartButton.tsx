'use client';

import { useEffect, useState } from 'react';
import { Check, ShoppingBag } from 'lucide-react';
import { MAX_LINE_QUANTITY } from '@/lib/ecommerce/cart';
import { useCart } from './use-cart';

/**
 * «Agregar al carrito» de una tarjeta del catálogo. El tope es lo menor entre lo disponible y el
 * máximo por pedido; lo que ya hay en el carrito cuenta. El servidor vuelve a validar al pagar.
 */
export default function AddToCartButton({ siteSlug, productId, available, maxPerOrder, name }: { siteSlug: string; productId: string; available: number | null; maxPerOrder: number | null; name: string }) {
  const { lines, add } = useCart(siteSlug);
  const [added, setAdded] = useState(false);
  const limit = Math.min(MAX_LINE_QUANTITY, maxPerOrder ?? MAX_LINE_QUANTITY, available ?? MAX_LINE_QUANTITY);
  const inCart = lines.find((line) => line.productId === productId)?.quantity ?? 0;
  const soldOut = available !== null && available <= 0;
  const atLimit = inCart >= limit;

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  if (soldOut) {
    return (
      <button type="button" disabled className="ws-btn ws-btn-alt ws-btn-sm w-full opacity-60">
        Agotado
      </button>
    );
  }
  return (
    <button
      type="button"
      className="ws-btn ws-btn-main ws-btn-sm w-full"
      disabled={atLimit}
      onClick={() => {
        add(productId, 1, limit);
        setAdded(true);
      }}
      aria-label={atLimit ? `${name}: ya tienes el máximo en tu carrito` : `Agregar ${name} al carrito`}
    >
      {added ? <Check className="size-4" aria-hidden="true" /> : <ShoppingBag className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{added ? 'Agregado' : atLimit ? 'En tu carrito' : 'Agregar'}</span>
    </button>
  );
}
