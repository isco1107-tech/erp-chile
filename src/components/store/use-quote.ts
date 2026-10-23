'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine } from '@/lib/ecommerce/cart';
import type { Quote } from '@/modules/ecommerce/services/store-public.service';
import { postJson, quoteUrl } from './store-api';

/**
 * Valoriza el carrito contra el servidor cada vez que cambia (con una espera corta para no
 * preguntar en cada tecla). El servidor decide precios, stock, despacho y medios de pago; acá
 * solo se reconcilia el carrito del navegador con lo que de verdad se puede comprar.
 */

export interface QuoteOptions {
  region?: string;
  deliveryMethod?: 'SHIPPING' | 'PICKUP';
  shippingRateId?: string;
}

export interface CartApi {
  set: (productId: string, quantity: number, max?: number) => void;
  remove: (productId: string) => void;
}

export function useQuote(siteSlug: string, lines: CartLine[], cart: CartApi, options: QuoteOptions = {}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  });

  const key = useMemo(() => JSON.stringify([lines, options.region ?? '', options.deliveryMethod ?? '', options.shippingRateId ?? '', reload]), [lines, options.region, options.deliveryMethod, options.shippingRateId, reload]);

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await postJson<Quote>(quoteUrl(siteSlug), { lines, region: options.region || undefined, deliveryMethod: options.deliveryMethod, shippingRateId: options.shippingRateId || undefined }, controller.signal);
        if (controller.signal.aborted) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        const next = result.data;
        // Lo que ya no se puede comprar o no alcanza se ajusta en el carrito y se avisa.
        const messages: string[] = [];
        for (const productId of next.removedProductIds) {
          cartRef.current.remove(productId);
          messages.push('Sacamos de tu carrito un producto que ya no está a la venta.');
        }
        for (const line of next.lines) {
          if (line.quantity > 0 && line.quantity < line.requestedQuantity) {
            cartRef.current.set(line.productId, line.quantity);
            messages.push(`De «${line.name}» solo podemos entregarte ${line.quantity}: ajustamos la cantidad.`);
          }
        }
        if (messages.length > 0) setNotices(messages);
        setQuote(next);
      } catch {
        if (!controller.signal.aborted) { setLoading(false); setError('No pudimos actualizar tu carrito. Revisa tu conexión e inténtalo de nuevo.'); }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `key` resume todo lo que importa: carrito, región, entrega, tarifa y recargas manuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, siteSlug]);

  return { quote, loading, error, notices, dismissNotices: () => setNotices([]), refresh: () => setReload((value) => value + 1) };
}
