import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { resolveDomainStore } from '@/components/store/store-domain';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';

/** Seguimiento de un pedido en el dominio propio de la tienda (`minegocio.cl/pedido/<token>`, reescrita por `src/proxy.ts`). */
type Params = Promise<{ host: string; token: string }>;

async function resolve(params: Params) {
  const { host, token } = await params;
  const found = await resolveDomainStore(host);
  if (!found) return null;
  return { site: found.site, store: found.store, route: { kind: 'order' as const, token }, basePath: '', siteUrl: `https://${found.domain}` };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hit = await resolve(params);
  return hit ? storeMetadata(hit) : { robots: { index: false, follow: false } };
}

export default async function CustomDomainOrderPage({ params }: { params: Params }) {
  const hit = await resolve(params);
  if (!hit) redirect(`${platformBaseUrl()}/pedido/${encodeURIComponent((await params).token)}`);
  return renderStorePage(hit);
}
