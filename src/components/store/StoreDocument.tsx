import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, Search, ShieldCheck, Store, Truck } from 'lucide-react';
import type { StoreRenderInfo } from '@/components/web-sites/site/context';
import { storeScreenHref } from '@/lib/ecommerce/store-href';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import type { PublicStoreSettings } from '@/modules/ecommerce/services/store-public.service';
import { themeVariables, readableOn } from '@/lib/web-sites/theme';
import { toneVariables } from '@/components/web-sites/site/tone';
import { SITE_CSS } from '@/components/web-sites/site/site-css';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { safeImageSrc, safeHref } from '@/lib/web-sites/urls';
import CartButton from './CartButton';
import { ProductImage } from './ui';
import QuickCart from './QuickCart';
import { STORE_CSS } from './store-style';

export function storeRenderInfo(siteSlug: string, basePath: string, current: StoreRenderInfo['current']): StoreRenderInfo {
  return { siteSlug, catalogHref: storeScreenHref(basePath, 'catalog'), cartHref: storeScreenHref(basePath, 'cart'), current };
}

/** A dedicated commerce experience, sharing only the validated merchant theme with the site builder. */
export default function StoreDocument({
  site,
  basePath,
  current,
  settings,
  children,
}: {
  site: PublicWebSite;
  basePath: string;
  current: StoreRenderInfo['current'];
  settings?: PublicStoreSettings;
  children: ReactNode;
}) {
  const catalog = storeScreenHref(basePath, 'catalog');
  const logo = safeImageSrc(site.logoUrl);
  const contact = settings?.supportPhone ? safeHref(`tel:${settings.supportPhone.replace(/[^+\d]/g, '')}`) : null;
  const style = { ...themeVariables(site.theme), ...toneVariables(site.theme), '--ec-on-primary': readableOn(site.theme.primary) } as CSSProperties;
  const steps = current === 'cart' || current === 'checkout' || current === 'order';
  return (
    <div
      className={`ws-root ws-tone-default ec-store ${SITE_FONT_CLASSES}`}
      style={style}
      data-ws-root=""
      data-btn={site.theme.buttonStyle}
      data-card={site.theme.cardStyle}
      data-anim="none"
    >
      <style>{SITE_CSS + STORE_CSS}</style>
      <div className="@container flex min-h-dvh flex-col">
        <a href="#main" className="ws-skip">
          Saltar al contenido
        </a>
        <div className="ec-announcement">
          {settings?.shippingEnabled && settings.pickupEnabled
            ? 'Compra a tu manera · Despacho a domicilio o retiro en tienda'
            : settings?.pickupEnabled
              ? 'Compra en línea y retira en nuestra tienda'
              : 'Tu próxima compra, sin complicaciones'}
        </div>
        <header className="ec-header">
          <div className="ec-wrap ec-header-inner">
            <a href={catalog} className="ec-brand">
              {logo && <ProductImage src={logo} alt="" eager />}
              <span>{site.name}</span>
            </a>
            <nav aria-label="Navegación de la tienda" className="ec-header-nav">
              <a href={catalog} aria-current={current === 'catalog' ? 'page' : undefined}>
                Explorar tienda
              </a>
              <a href={`${catalog}#catalog-search`}>Buscar productos</a>
              {contact && (
                <a href={contact}>
                  Hablemos <ArrowUpRight className="inline size-3" />
                </a>
              )}
            </nav>
            <div className="ec-actions">
              <a href={`${catalog}#catalog-search`} aria-label="Buscar en la tienda" className="ec-quick">
                <Search className="size-4" />
              </a>
              <CartButton siteSlug={site.slug} cartHref={storeScreenHref(basePath, 'cart')} />
              <QuickCart siteSlug={site.slug} basePath={basePath} />
            </div>
          </div>
        </header>
        {steps && (
          <nav className="ec-steps" aria-label="Pasos de la compra">
            <span aria-current={current === 'cart' ? 'step' : undefined}>
              <b>1</b> Carrito
            </span>
            <span aria-current={current === 'checkout' ? 'step' : undefined}>
              <b>2</b> Entrega y pago
            </span>
            <span aria-current={current === 'order' ? 'step' : undefined}>
              <b>3</b> Tu pedido
            </span>
          </nav>
        )}
        <main id="main" tabIndex={-1} className="grow outline-none">
          {children}
        </main>
        <footer className="ec-footer">
          <div className="ec-wrap">
            <div className="ec-footer-grid">
              <div>
                <h2>{site.name}</h2>
                <p className="ws-muted mt-3 max-w-sm">{site.description || 'Descubre nuestro catálogo y elige cómo quieres recibir tu compra.'}</p>
                <a className="mt-4 inline-flex items-center gap-2 font-semibold" href={catalog}>
                  Volver a la tienda <ArrowUpRight className="size-4" />
                </a>
              </div>
              <div>
                <h3>Cómo recibes tu compra</h3>
                {settings?.shippingEnabled && (
                  <p className="mb-2 flex items-center gap-2">
                    <Truck className="size-4" /> Despacho a domicilio
                  </p>
                )}
                {settings?.pickupEnabled && (
                  <p className="mb-2 flex items-start gap-2">
                    <Store className="size-4 shrink-0" />
                    <span>Retiro en tienda{settings.pickupAddress ? ` · ${settings.pickupAddress}` : ''}</span>
                  </p>
                )}
                {settings?.pickupInstructions && <p className="ws-muted mt-2">{settings.pickupInstructions}</p>}
              </div>
              <div>
                <h3>Estamos para ayudarte</h3>
                {contact ? (
                  <a href={contact} className="underline underline-offset-4">
                    {settings?.supportPhone}
                  </a>
                ) : (
                  <p className="ws-muted">Encuentra los detalles de entrega en tu pedido.</p>
                )}
                {settings?.returnsText && (
                  <details>
                    <summary>Cambios y devoluciones</summary>
                    <p className="ws-muted mt-2 whitespace-pre-line">{settings.returnsText}</p>
                  </details>
                )}
                {settings?.termsText && (
                  <details>
                    <summary>Condiciones de compra</summary>
                    <p className="ws-muted mt-2 whitespace-pre-line">{settings.termsText}</p>
                  </details>
                )}
              </div>
            </div>
            <div className="ec-footer-bottom">
              <span>
                © {new Date().getFullYear()} {site.name}
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-3.5" /> Precios finales en pesos chilenos · Compra sin crear cuenta
              </span>
            </div>
            <a href={`${platformBaseUrl()}/`} target="_blank" rel="noopener noreferrer" className="ws-muted mt-4 inline-block !text-[11px]">Hecho con Aether ERP</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
