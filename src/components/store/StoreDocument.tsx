import type { ReactNode } from 'react';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import type { StoreRenderInfo } from '@/components/web-sites/site/context';
import { storeScreenHref } from '@/lib/ecommerce/store-href';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';

/** Lo que el encabezado necesita saber de la tienda: direcciones ya resueltas para donde vive el sitio. */
export function storeRenderInfo(siteSlug: string, basePath: string, current: StoreRenderInfo['current']): StoreRenderInfo {
  return { siteSlug, catalogHref: storeScreenHref(basePath, 'catalog'), cartHref: storeScreenHref(basePath, 'cart'), current };
}

/** Pantalla de la tienda dentro del sitio: conserva encabezado, pie, tema y botones flotantes. */
export default function StoreDocument({ site, basePath, current, children }: { site: PublicWebSite; basePath: string; current: StoreRenderInfo['current']; children: ReactNode }) {
  return (
    <SiteRenderer
      name={site.name}
      logoUrl={site.logoUrl}
      theme={site.theme}
      document={site.document}
      slug={site.slug}
      mode="public"
      basePath={basePath}
      store={storeRenderInfo(site.slug, basePath, current)}
      content={children}
    />
  );
}
