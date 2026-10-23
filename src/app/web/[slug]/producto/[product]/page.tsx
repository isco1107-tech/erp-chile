import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadSiteBySlug, loadStoreBySlug, renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/** Ficha de un producto de la tienda de un sitio (`/web/[slug]/producto/[product]`). Solo existe con la tienda abierta. */
type Params = Promise<{ slug: string; product: string }>;

async function resolve(params: Params) {
  const { slug, product } = await params;
  const site = await loadSiteBySlug(slug);
  if (!site || site.mode !== 'GUIDED') return null;
  const store = await loadStoreBySlug(slug);
  if (!store || store.siteId !== site.id) return null;
  const siteUrl = site.customDomain && site.customDomainVerified ? `https://${site.customDomain}` : publicSiteUrl(site.slug);
  return { site, store, route: { kind: 'product' as const, slug: product }, basePath: `/web/${site.slug}`, siteUrl };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hit = await resolve(params);
  return hit ? storeMetadata(hit) : { title: 'Producto no disponible', robots: { index: false } };
}

export default async function ProductPage({ params }: { params: Params }) {
  const hit = await resolve(params);
  if (!hit) notFound();
  return renderStorePage(hit);
}
