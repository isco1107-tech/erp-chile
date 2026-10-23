import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { resolveDomainStore } from '@/components/store/store-domain';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';

/** Ficha de un producto en el dominio propio de la tienda (`minegocio.cl/producto/x`, reescrita por `src/proxy.ts`). */
type Params = Promise<{ host: string; product: string }>;

async function resolve(params: Params) {
  const { host, product } = await params;
  const found = await resolveDomainStore(host);
  if (!found) return null;
  return { site: found.site, store: found.store, route: { kind: 'product' as const, slug: product }, basePath: '', siteUrl: `https://${found.domain}` };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hit = await resolve(params);
  return hit ? storeMetadata(hit) : { robots: { index: false } };
}

export default async function CustomDomainProductPage({ params }: { params: Params }) {
  const hit = await resolve(params);
  if (!hit) redirect(`${platformBaseUrl()}/producto/${encodeURIComponent((await params).product)}`);
  return renderStorePage(hit);
}
