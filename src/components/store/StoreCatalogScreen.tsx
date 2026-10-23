import { Search } from 'lucide-react';
import { catalogHref } from '@/lib/ecommerce/store-href';
import type { PublicCatalogPage } from '@/modules/ecommerce/services/store-public.service';
import { cx } from '@/components/web-sites/site/parts';
import ProductCard from './ProductCard';
import { StoreFrame, StoreTitle } from './ui';

export interface CatalogQuery {
  collection: string | null;
  q: string | null;
  page: number;
}

function Pagination({ basePath, query, total, pageSize }: { basePath: string; query: CatalogQuery; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  // Ventana corta alrededor de la página actual: en un celular no caben veinte números.
  const numbers = [...new Set([1, query.page - 1, query.page, query.page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Páginas del catálogo" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {query.page > 1 && (
        <a className="ws-btn ws-btn-alt ws-btn-sm" href={catalogHref(basePath, { ...query, page: query.page - 1 })} rel="prev">
          Anterior
        </a>
      )}
      {numbers.map((n, index) => (
        <span key={n} className="contents">
          {index > 0 && n - numbers[index - 1]! > 1 && <span aria-hidden="true" className="ws-muted">…</span>}
          <a
            href={catalogHref(basePath, { ...query, page: n })}
            aria-current={n === query.page ? 'page' : undefined}
            className={cx('ws-btn ws-btn-sm !px-3.5', n === query.page ? 'ws-btn-main' : 'ws-btn-alt')}
          >
            {n}
          </a>
        </span>
      ))}
      {query.page < pages && (
        <a className="ws-btn ws-btn-alt ws-btn-sm" href={catalogHref(basePath, { ...query, page: query.page + 1 })} rel="next">
          Siguiente
        </a>
      )}
    </nav>
  );
}

/** Catálogo de la tienda: búsqueda, colecciones, grilla de productos y páginas. Se pinta en el servidor. */
export default function StoreCatalogScreen({ catalog, query, basePath, siteSlug }: { catalog: PublicCatalogPage; query: CatalogQuery; basePath: string; siteSlug: string }) {
  const filtered = Boolean(query.q || query.collection);
  const searchAction = catalogHref(basePath);
  return (
    <StoreFrame label="Catálogo de la tienda">
      <StoreTitle eyebrow={query.collection ?? undefined} title={query.collection ?? 'Tienda'} />

      <div className="mb-8 flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <form action={searchAction} method="get" role="search" className="flex w-full max-w-md gap-2">
          {query.collection && <input type="hidden" name="coleccion" value={query.collection} />}
          <label className="sr-only" htmlFor="store-search">
            Buscar productos
          </label>
          <input id="store-search" name="q" type="search" defaultValue={query.q ?? ''} maxLength={80} placeholder="Buscar productos" className="ws-field" />
          <button type="submit" className="ws-btn ws-btn-main !px-4" aria-label="Buscar">
            <Search className="size-5" aria-hidden="true" />
          </button>
        </form>
        {catalog.collections.length > 0 && (
          <nav aria-label="Colecciones" className="flex flex-wrap gap-2">
            <a href={catalogHref(basePath, { q: query.q })} aria-current={!query.collection ? 'page' : undefined} className={cx('ws-choice !py-1.5', !query.collection && '[border-color:var(--s-mark)] font-semibold')}>
              Todo
            </a>
            {catalog.collections.map((collection) => (
              <a
                key={collection.name}
                href={catalogHref(basePath, { collection: collection.name, q: query.q })}
                aria-current={query.collection === collection.name ? 'page' : undefined}
                className={cx('ws-choice !py-1.5 break-words', query.collection === collection.name && '[border-color:var(--s-mark)] font-semibold')}
              >
                {collection.name} <span className="ws-muted text-xs">({collection.count})</span>
              </a>
            ))}
          </nav>
        )}
      </div>

      {catalog.products.length === 0 ? (
        <div className="ws-card mx-auto max-w-xl p-8 text-center">
          <h2 className="ws-h text-xl">{filtered ? 'No encontramos productos' : 'Pronto tendremos productos'}</h2>
          <p className="ws-muted mt-2">{filtered ? 'Prueba con otra búsqueda o mira todo el catálogo.' : 'Esta tienda todavía no tiene productos publicados. Vuelve en unos días.'}</p>
          {filtered && (
            <a href={catalogHref(basePath)} className="ws-btn ws-btn-main ws-btn-sm mt-5">
              Ver todo el catálogo
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="ws-muted mb-4 text-sm" aria-live="polite">
            {catalog.total} {catalog.total === 1 ? 'producto' : 'productos'}
          </p>
          <ul className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:gap-5 @4xl:grid-cols-3 @6xl:grid-cols-4">
            {catalog.products.map((product, index) => (
              <li key={product.id} className="min-w-0">
                <ProductCard product={product} basePath={basePath} siteSlug={siteSlug} eager={index < 4} />
              </li>
            ))}
          </ul>
          <Pagination basePath={basePath} query={query} total={catalog.total} pageSize={catalog.pageSize} />
        </>
      )}
    </StoreFrame>
  );
}
