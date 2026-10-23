import { getAppUrl } from '@/lib/email/mailer';

/**
 * Direcciones públicas de una tienda. Con dominio propio verificado la tienda vive en
 * la raíz de ese dominio (`https://minegocio.cl/tienda`); si no, bajo la dirección del
 * sitio en la plataforma (`https://app/web/mi-sitio/tienda`).
 */

export interface SiteAddress {
  slug: string;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
}

export function storeBaseUrl(site: SiteAddress): string {
  return site.customDomain && site.customDomainVerifiedAt ? `https://${site.customDomain}` : `${getAppUrl()}/web/${site.slug}`;
}

export function orderPageUrl(site: SiteAddress, accessToken: string): string {
  return `${storeBaseUrl(site)}/pedido/${accessToken}`;
}

export function cartPageUrl(site: SiteAddress): string {
  return `${storeBaseUrl(site)}/carrito`;
}
