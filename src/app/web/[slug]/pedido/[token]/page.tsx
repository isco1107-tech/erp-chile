import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadStoreBySlug, renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { getPublicWebSite, publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/**
 * Seguimiento de un pedido (`/web/[slug]/pedido/[token]`). El enlace secreto del pedido es la
 * credencial: solo abre pedidos de la tienda de ESTE sitio, no se indexa y no se envía como referencia.
 */
type Params = Promise<{ slug: string; token: string }>;

async function resolve(params: Params) {
  const { slug, token } = await params;
  const site = await getPublicWebSite(slug);
  if (!site || site.mode !== 'GUIDED') return null;
  const store = await loadStoreBySlug(slug);
  if (!store || store.siteId !== site.id) return null;
  const siteUrl = site.customDomain && site.customDomainVerified ? `https://${site.customDomain}` : publicSiteUrl(site.slug);
  return { site, store, route: { kind: 'order' as const, token }, basePath: `/web/${site.slug}`, siteUrl };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hit = await resolve(params);
  return hit ? storeMetadata(hit) : { title: 'Pedido no disponible', robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: { params: Params }) {
  const hit = await resolve(params);
  if (!hit) notFound();
  return renderStorePage(hit);
}
