import { ArrowDown, ArrowUpRight, Search, ShieldCheck, Store, Truck } from 'lucide-react';
import { catalogHref } from '@/lib/ecommerce/store-href';
import type { CatalogSort } from '@/lib/ecommerce/store-route';
import type { PublicStoreSettings, PublicCatalogPage } from '@/modules/ecommerce/services/store-public.service';
import { cx } from '@/components/web-sites/site/parts';
import ProductCard from './ProductCard';
import { ProductImage, StoreFrame, StoreTitle } from './ui';

export interface CatalogQuery {
  collection: string | null;
  q: string | null;
  page: number;
  sort?: CatalogSort;
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
          {index > 0 && n - numbers[index - 1]! > 1 && (
            <span aria-hidden="true" className="ws-muted">
              …
            </span>
          )}
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
export default function StoreCatalogScreen({
  catalog,
  query,
  basePath,
  siteSlug,
  storeName,
  description,
  settings,
}: {
  storeName: string;
  description: string | null;
  settings: PublicStoreSettings;
  catalog: PublicCatalogPage;
  query: CatalogQuery;
  basePath: string;
  siteSlug: string;
}) {
  const filtered = Boolean(query.q || query.collection);
  const searchAction = catalogHref(basePath);
  const heroProduct = catalog.products.find((product) => product.featured && product.imageUrl) ?? catalog.products.find((product) => product.imageUrl);
  return (
    <StoreFrame label="Catálogo de la tienda">
      {!filtered && query.page === 1 ? (
        <>
          <section className="ec-hero" aria-label="Descubre nuestra tienda">
            <div className="ec-hero-copy">
              <p className="ec-kicker">{storeName} · Tienda en línea</p>
              <h1 className="ec-title">
                Encuentra eso
                <br />
                que va contigo.
              </h1>
              <p className="ws-muted">{description || 'Explora nuestra selección, encuentra tus favoritos y elige cómo recibirlos. Así de simple.'}</p>
              <a href="#catalog-search" className="ws-btn ws-btn-main">
                Explorar colección <ArrowDown className="size-4" />
              </a>
            </div>
            <div className="ec-hero-image">
              {heroProduct ? (
                <>
                  <ProductImage src={heroProduct.imageUrl} alt={heroProduct.imageAlt} eager />
                  <a href={`${basePath}/producto/${encodeURIComponent(heroProduct.slug)}`} className="ec-hero-label flex items-center justify-between gap-3">
                    <span>{heroProduct.title}</span>
                    <ArrowUpRight className="size-4 shrink-0" />
                  </a>
                </>
              ) : (
                <Store className="size-20 opacity-30" aria-hidden="true" />
              )}
            </div>
          </section>
          <div className="ec-benefits">
            {settings.shippingEnabled && (
              <span>
                <Truck />
                Despacho a domicilio
              </span>
            )}
            {settings.pickupEnabled && (
              <span>
                <Store />
                Retiro en tienda
              </span>
            )}
            <span>
              <ShieldCheck />
              Compra sin crear cuenta
            </span>
            <span>Precios finales en CLP</span>
          </div>
        </>
      ) : (
        <StoreTitle eyebrow="Encuentra tus favoritos" title={query.collection ?? (query.q ? `Resultados para «${query.q}»` : 'Nuestra colección')} />
      )}

      <div id="catalog-search" className="ec-catalog-tools flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <form action={searchAction} method="get" role="search" className="flex w-full max-w-md gap-2">
          {query.sort && <input type="hidden" name="orden" value={query.sort} />}
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
            <a
              href={catalogHref(basePath, { q: query.q, sort: query.sort })}
              aria-current={!query.collection ? 'page' : undefined}
              className={cx('ws-choice !py-1.5', !query.collection && '[border-color:var(--s-mark)] font-semibold')}
            >
              Todo
            </a>
            {catalog.collections.map((collection) => (
              <a
                key={collection.name}
                href={catalogHref(basePath, { collection: collection.name, q: query.q, sort: query.sort })}
                aria-current={query.collection === collection.name ? 'page' : undefined}
                className={cx(
                  'ws-choice max-w-full min-w-0 !py-1.5 break-words',
                  query.collection === collection.name && '[border-color:var(--s-mark)] font-semibold',
                )}
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
          <p className="ws-muted mt-2">
            {filtered ? 'Prueba con otra búsqueda o mira todo el catálogo.' : 'Esta tienda todavía no tiene productos publicados. Vuelve en unos días.'}
          </p>
          {filtered && (
            <a href={catalogHref(basePath)} className="ws-btn ws-btn-main ws-btn-sm mt-5">
              Ver todo el catálogo
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <p className="ws-muted text-sm" aria-live="polite">
              {catalog.total} {catalog.total === 1 ? 'producto' : 'productos'}
            </p>
            <form action={searchAction} method="get" className="flex flex-wrap items-center gap-2 text-sm">
              {query.q && <input type="hidden" name="q" value={query.q} />}
              {query.collection && <input type="hidden" name="coleccion" value={query.collection} />}
              <label htmlFor="catalog-sort" className="ws-muted">
                Ordenar
              </label>
              <select id="catalog-sort" name="orden" defaultValue={query.sort ?? 'featured'} className="ws-field !min-h-11 !w-auto max-w-44 !py-2 !text-sm">
                <option value="featured">Destacados</option>
                <option value="newest">Novedades</option>
                <option value="name">Nombre, A a Z</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
              </select>
              <button type="submit" className="ws-btn ws-btn-alt ws-btn-sm">
                Aplicar
              </button>
            </form>
          </div>
          <ul className="ec-products grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:gap-5 @4xl:grid-cols-3 @6xl:grid-cols-4">
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
