import type { ReactNode } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import type { StockState } from '@/lib/ecommerce/availability';
import { cx, Fit } from '@/components/web-sites/site/parts';

/** Piezas visuales que comparten las pantallas de la tienda (usan las clases `ws-*` del sitio). */

export const money = formatCurrency;

/** Franja de página de la tienda: mismo fondo, espaciado y ancho que una sección del sitio. */
export function StoreFrame({ children, width = 'wide', label }: { children: ReactNode; width?: 'wide' | 'narrow'; label?: string }) {
  return (
    <section aria-label={label} className="ws-section ws-bg ws-tone-default ws-sp-md">
      <div className={cx('ec-wrap mx-auto w-full', width === 'narrow' ? 'ec-narrow max-w-3xl' : 'max-w-[var(--ws-max)]')}>{children}</div>
    </section>
  );
}

export function StoreTitle({ eyebrow, title, intro, className }: { eyebrow?: string; title: string; intro?: string; className?: string }) {
  return (
    <header className={cx('mb-8 @2xl:mb-10', className)}>
      {eyebrow && <p className="ws-eyebrow mb-2">{eyebrow}</p>}
      <Fit>
        <h1 className="ws-h ws-t-2">{title}</h1>
      </Fit>
      {intro && <p className="ws-muted mt-3 max-w-2xl text-lg leading-relaxed">{intro}</p>}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Ruta" className="ws-muted mb-5 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
            {item.href ? (
              <a href={item.href} className="underline-offset-4 hover:underline">
                {item.label}
              </a>
            ) : (
              <span aria-current="page" className="font-semibold [color:var(--s-fg)] break-words">
                {item.label}
              </span>
            )}
            {index < items.length - 1 && <span aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Precio con IVA y, si lo hay, el precio anterior tachado. */
export function PriceTag({ price, compareAt, size = 'md' }: { price: number; compareAt?: number | null; size?: 'md' | 'lg' }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className={cx('ws-h font-bold [color:var(--s-mark)]', size === 'lg' ? 'ws-t-price-inline' : 'text-xl')}>{money(price)}</span>
      {compareAt ? (
        <span className="ws-muted text-sm line-through">
          <span className="sr-only">Precio anterior </span>
          {money(compareAt)}
        </span>
      ) : null}
    </p>
  );
}

const STOCK_STYLE: Record<StockState, string> = {
  in_stock: 'ws-muted',
  low: 'font-semibold [color:var(--s-mark)]',
  out: 'font-semibold text-[color:color-mix(in_srgb,#dc2626_72%,var(--s-fg))]',
};

export function StockText({ state, text }: { state: StockState; text: string }) {
  if (state === 'in_stock' && text === 'Disponible') return null;
  return <p className={cx('text-sm', STOCK_STYLE[state])}>{text}</p>;
}

export function discountPercent(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price) return null;
  const percent = Math.round(((compareAt - price) / compareAt) * 100);
  return percent >= 1 ? percent : null;
}

/** Aviso en línea (error, información o éxito) con el color del sitio. */
export function Notice({ tone = 'info', children, role }: { tone?: 'info' | 'error' | 'success'; children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx(
        'rounded-[var(--ws-radius)] border px-4 py-3 text-sm leading-relaxed',
        tone === 'error' && 'border-[color:color-mix(in_srgb,#dc2626_55%,transparent)] bg-[color:color-mix(in_srgb,#dc2626_9%,transparent)]',
        tone === 'success' && 'border-[color:var(--s-mark)] bg-[color:color-mix(in_srgb,var(--s-mark)_10%,transparent)]',
        tone === 'info' && 'border-[color:var(--s-line)] bg-[color:var(--s-card)]'
      )}
    >
      {children}
    </div>
  );
}

/** Foto de producto con marcador cuando no hay. */
export function ProductImage({ src, alt, className, eager }: { src: string | null; alt: string; className?: string; eager?: boolean }) {
  if (!src) {
    return (
      <span aria-hidden="true" className={cx('ws-ph', className)}>
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 7h12l-1 13H7L6 7Z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className={className} />;
}
