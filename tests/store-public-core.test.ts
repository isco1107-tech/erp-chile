/**
 * Piezas puras de la superficie pública de la tienda: el puente hacia Webpay (y su CSP, que
 * `next.config.js` repite), las direcciones de las pantallas y su enrutado en un dominio propio.
 */
import { createHash } from 'crypto';
import { customDomainRoute } from '@/lib/hosting/custom-domain';
import { catalogHref, orderHref, productHref, storeScreenHref } from '@/lib/ecommerce/store-href';
import { storeRouteFor } from '@/lib/ecommerce/store-route';
import { WEBPAY_BRIDGE_CSP, WEBPAY_BRIDGE_PATH, WEBPAY_BRIDGE_SCRIPT, webpayBridgeHtml } from '@/lib/ecommerce/webpay-bridge';
import { WEBPAY_HOSTS } from '@/lib/ecommerce/webpay-verdict';

const TOKEN = 'e'.repeat(64);

describe('puente hacia Webpay', () => {
  const url = 'https://webpay3gint.transbank.cl/webpayserver/initTransaction';

  it('arma un formulario POST con el token hacia Transbank y se envía solo', () => {
    const html = webpayBridgeHtml(url, TOKEN)!;
    expect(html).toContain(`<form id="webpay" method="POST" action="${url}">`);
    expect(html).toContain(`name="token_ws" value="${TOKEN}"`);
    expect(html).toContain(`<script>${WEBPAY_BRIDGE_SCRIPT}</script>`);
    expect(html).toContain('<noscript><button type="submit">');
    expect(html).toContain('name="referrer" content="no-referrer"');
  });

  it('nunca manda al comprador a un destino que no sea de Transbank', () => {
    expect(webpayBridgeHtml('https://evil.example/initTransaction', TOKEN)).toBeNull();
    expect(webpayBridgeHtml('http://webpay3g.transbank.cl/x', TOKEN)).toBeNull();
    expect(webpayBridgeHtml('https://webpay3g.transbank.cl.evil.cl/x', TOKEN)).toBeNull();
    expect(webpayBridgeHtml('javascript:alert(1)', TOKEN)).toBeNull();
  });

  it('rechaza un token con caracteres que rompan el HTML', () => {
    expect(webpayBridgeHtml(url, '"><script>alert(1)</script>')).toBeNull();
    expect(webpayBridgeHtml(url, 'corto')).toBeNull();
  });

  it('su CSP solo deja enviar formularios a Transbank y autoriza el único script por su hash', () => {
    const directives = WEBPAY_BRIDGE_CSP.split(';').map((directive) => directive.trim());
    expect(directives).toContain("default-src 'none'");
    expect(directives).toContain(`form-action ${WEBPAY_HOSTS.map((host) => `https://${host}`).join(' ')}`);
    expect(directives).toContain("frame-ancestors 'none'");
    const hash = createHash('sha256').update(WEBPAY_BRIDGE_SCRIPT).digest('base64');
    expect(directives).toContain(`script-src 'sha256-${hash}'`);
    expect(directives.find((directive) => directive.startsWith('script-src'))).not.toMatch(/unsafe-/);
  });

  it('next.config.js fija esa misma CSP para la ruta del puente, DESPUÉS de la global', async () => {
    const nextConfig = require('../next.config.js') as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    const entries = await nextConfig.headers();
    const globalIndex = entries.findIndex((entry) => entry.source === '/((?!epione(?:/|$)|hermes(?:/|$)).*)');
    const bridgeIndex = entries.findIndex((entry) => entry.source === WEBPAY_BRIDGE_PATH);
    expect(globalIndex).toBeGreaterThanOrEqual(0);
    expect(bridgeIndex).toBeGreaterThan(globalIndex); // la última clave repetida gana
    const csp = entries[bridgeIndex]!.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
    expect(csp).toBe(WEBPAY_BRIDGE_CSP);
    expect(entries[bridgeIndex]!.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    expect(entries[bridgeIndex]!.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' });
    // La política global sigue cerrando los formularios al propio origen: el puente es la única excepción.
    const globalCsp = entries[globalIndex]!.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
    expect(globalCsp).toContain("form-action 'self'");
  });
});

describe('direcciones de la tienda', () => {
  it('arman las pantallas bajo la dirección del sitio o la raíz de un dominio propio', () => {
    expect(storeScreenHref('/web/mi-sitio', 'catalog')).toBe('/web/mi-sitio/tienda');
    expect(storeScreenHref('', 'checkout')).toBe('/finalizar-compra');
    expect(productHref('', 'aceite-maravilla')).toBe('/producto/aceite-maravilla');
    expect(orderHref('/web/x', TOKEN)).toBe(`/web/x/pedido/${TOKEN}`);
  });

  it('el catálogo escribe solo los filtros que hay', () => {
    expect(catalogHref('')).toBe('/tienda');
    expect(catalogHref('', { collection: 'Despensa y más', q: 'aceite', page: 3 })).toBe('/tienda?coleccion=Despensa+y+m%C3%A1s&q=aceite&pagina=3');
    expect(catalogHref('', { page: 1 })).toBe('/tienda');
  });

  it('reconoce las pantallas de un tramo y acota lo que viene en la dirección', () => {
    expect(storeRouteFor('nosotros')).toBeNull();
    expect(storeRouteFor('carrito')).toEqual({ kind: 'cart' });
    expect(storeRouteFor('finalizar-compra')).toEqual({ kind: 'checkout' });
    expect(storeRouteFor('producto')).toBe('to-catalog');
    expect(storeRouteFor('pedido')).toBe('to-catalog');
    expect(storeRouteFor('tienda')).toEqual({ kind: 'catalog', search: { collection: null, q: null, page: 1 } });
    expect(storeRouteFor('tienda', { coleccion: ' Despensa ', q: ['aceite', 'x'], pagina: '4' })).toEqual({ kind: 'catalog', search: { collection: 'Despensa', q: 'aceite', page: 4 } });
    expect(storeRouteFor('tienda', { pagina: '-3' })).toMatchObject({ search: { page: 1 } });
    expect(storeRouteFor('tienda', { pagina: 'abc' })).toMatchObject({ search: { page: 1 } });
    expect(storeRouteFor('tienda', { pagina: '99999' })).toMatchObject({ search: { page: 500 } });
    expect(storeRouteFor('tienda', { q: 'x'.repeat(500) })).toMatchObject({ search: { q: 'x'.repeat(80) } });
  });
});

describe('la tienda en un dominio propio', () => {
  it('las pantallas de un tramo siguen siendo páginas del sitio (las decide /sitio/[host]/[page])', () => {
    for (const slug of ['tienda', 'carrito', 'finalizar-compra']) expect(customDomainRoute(`/${slug}`)).toEqual({ kind: 'page', slug });
  });

  it('la ficha y el pedido se reescriben con su segundo tramo', () => {
    expect(customDomainRoute('/producto/aceite-maravilla')).toEqual({ kind: 'store', prefix: 'producto', id: 'aceite-maravilla' });
    expect(customDomainRoute('/producto/aceite-maravilla/')).toEqual({ kind: 'store', prefix: 'producto', id: 'aceite-maravilla' });
    expect(customDomainRoute(`/pedido/${TOKEN}`)).toEqual({ kind: 'store', prefix: 'pedido', id: TOKEN });
  });

  it('un tramo inválido NO se reescribe: va a la plataforma como cualquier otra ruta', () => {
    expect(customDomainRoute('/pedido/corto')).toEqual({ kind: 'platform' });
    expect(customDomainRoute(`/pedido/${'E'.repeat(64)}`)).toEqual({ kind: 'platform' });
    expect(customDomainRoute('/producto/Aceite_Maravilla')).toEqual({ kind: 'platform' });
    expect(customDomainRoute('/producto/a/b')).toEqual({ kind: 'platform' });
    // `/producto` a secas es una página del sitio: /sitio/[host]/[page] lo manda al catálogo.
    expect(customDomainRoute('/producto/')).toEqual({ kind: 'page', slug: 'producto' });
  });

  it('no abre la API ni el panel bajo el dominio del cliente', () => {
    expect(customDomainRoute('/api/public/store/x/quote')).toEqual({ kind: 'platform' });
    expect(customDomainRoute('/dashboard/store')).toEqual({ kind: 'platform' });
  });
});

it('la ordenación del catálogo se conserva al paginar y solo acepta valores conocidos', () => {
  expect(storeRouteFor('tienda', { orden: 'price-asc', pagina: '2' })).toMatchObject({ search: { sort: 'price-asc', page: 2 } });
  expect(storeRouteFor('tienda', { orden: 'DROP TABLE' })).toEqual({ kind: 'catalog', search: { collection: null, q: null, page: 1 } });
  expect(catalogHref('', { collection: 'Despensa', sort: 'price-desc', page: 2 })).toBe('/tienda?coleccion=Despensa&orden=price-desc&pagina=2');
});
