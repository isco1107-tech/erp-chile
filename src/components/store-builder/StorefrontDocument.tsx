import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { findPublicPage, jsonLdString, localBusinessJsonLd } from '@/components/web-sites/WebSiteDocument';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import { listPublicProducts, resolvePublicStore } from '@/modules/ecommerce/services/store-public.service';
import { STORE_CSS } from '@/components/store/store-style';
import { storeRenderInfo } from '@/components/store/StoreDocument';

/** Merchant pages use the same published document, themes and sections as their editor, plus live commerce. */
export default async function StorefrontDocument({
  site,
  pageSlug,
  basePath = `/web/${site.slug}`,
  siteUrl,
}: {
  site: PublicWebSite;
  pageSlug?: string;
  basePath?: string;
  siteUrl?: string;
}) {
  const page = findPublicPage(site, pageSlug);
  const ctx = await resolvePublicStore(site.slug);
  const products: Record<string, Awaited<ReturnType<typeof listPublicProducts>>['products']> = {};
  const queries = new Map<string, ReturnType<typeof listPublicProducts>>();
  if (ctx && page)
    await Promise.all(
      page.blocks
        .filter((block) => !block.hidden && block.type === 'catalog' && block.store)
        .map(async (block) => {
          if (block.type !== 'catalog' || !block.store) return;
          const query = { collection: block.store.collection || undefined, featuredOnly: block.store.featuredOnly, limit: block.store.limit };
          const key = JSON.stringify(query);
          let pending = queries.get(key);
          if (!pending) {
            pending = listPublicProducts(ctx, query);
            queries.set(key, pending);
          }
          products[block.id] = (await pending).products;
        }),
    );
  const structured = localBusinessJsonLd(site, siteUrl);
  return (
    <>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(structured) }} />}
      <SiteRenderer
        name={site.name}
        logoUrl={site.logoUrl}
        theme={site.theme}
        document={site.document}
        pageId={page?.id}
        slug={site.slug}
        mode="public"
        basePath={basePath}
        store={storeRenderInfo(site.slug, basePath, null)}
        commerce={{ products, open: Boolean(ctx) }}
        rootClassName="ec-store"
        extraCss={STORE_CSS}
      />
    </>
  );
}
