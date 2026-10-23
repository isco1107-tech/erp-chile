'use client';

import { ShoppingBag } from 'lucide-react';
import { useCart } from './use-cart';

/** Carrito del encabezado del sitio: ícono con la cantidad de unidades. */
export default function CartButton({ siteSlug, cartHref }: { siteSlug: string; cartHref: string }) {
  const { count } = useCart(siteSlug);
  return (
    <a href={cartHref} className="ws-navlink relative !p-2.5" aria-label={count > 0 ? `Carrito, ${count} ${count === 1 ? 'unidad' : 'unidades'}` : 'Carrito vacío'}>
      <ShoppingBag className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-[color:var(--s-btn)] px-1 text-[11px] font-bold leading-5 text-[color:var(--s-btn-fg)]">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  );
}
