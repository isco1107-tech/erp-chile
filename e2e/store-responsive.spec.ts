import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { STORE_SLUG, ensureStoreDemo, fakeProductImages, resetStoreOrders, seedCart, type StoreDemo } from './store-support';

/**
 * La tienda en 13 anchos de pantalla (de 280 a 2560 px): catálogo, ficha, carrito, finalizar compra y seguimiento
 * del pedido, con los datos incómodos de la demo (un nombre de producto larguísimo, descuento, agotado, despacho).
 * Falla si algo desborda la pantalla, se sale de ella o queda con letra bajo 11 px. Deja una captura de cada
 * combinación en `.vercel/responsive-check-store/` para MIRARLAS (el «pasó» no basta).
 */
const WIDTHS = [280, 320, 360, 390, 430, 600, 768, 1024, 1280, 1440, 1920, 2200, 2560];
const OUT = path.join(process.cwd(), '.vercel', 'responsive-check-store');

let demo: StoreDemo;
let orderToken = '';

test.beforeAll(async ({ request }) => {
  demo = await ensureStoreDemo();
  await resetStoreOrders();
  mkdirSync(OUT, { recursive: true });
  const response = await request.post(`/api/public/store/${STORE_SLUG}/checkout`, {
    headers: { 'x-forwarded-for': '10.60.0.1' },
    data: {
      idempotencyKey: `ck_resp_${Date.now()}_xxxxxxxx`,
      lines: [{ productId: demo.productIds['merken-ahumado'], quantity: 2 }, { productId: demo.productIds['aceite-maravilla'], quantity: 1 }],
      customer: { name: 'Fernanda Paillalef Huenchumilla', email: 'fernanda.paillalef.huenchumilla@correo-muy-largo.cl', phone: '+56 9 7222 3344' },
      documentType: 'BOLETA',
      deliveryMethod: 'SHIPPING',
      address: { region: 'Región de La Araucanía', comuna: 'Temuco', street: 'Avenida Manuel Montt 845, edificio Los Notros, torre B', extra: 'Depto 1204' },
      shippingRateId: 'pais',
      paymentProvider: 'TRANSFER',
      acceptTerms: true,
      website: '',
    },
  });
  orderToken = ((await response.json()) as { data: { orderToken: string } }).data.orderToken;
});

async function audit(page: Page, label: string): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const problems: string[] = [];
    const where = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''}`;
    if (document.documentElement.scrollWidth > viewport + 1) problems.push(`la página se desborda en horizontal (${document.documentElement.scrollWidth}px en ${viewport}px)`);
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('nextjs-portal, [data-nextjs-toast], [aria-hidden="true"], .sr-only, svg, script, style')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > viewport + 1) problems.push(`${where(el)} se sale ${Math.round(rect.right - viewport)}px por la derecha`);
      if (rect.left < -1) problems.push(`${where(el)} se sale ${Math.round(-rect.left)}px por la izquierda`);
      // Una palabra partida letra por letra: la columna quedó más angosta que la palabra más corta del texto.
      if (el.children.length === 0) {
        const text = (el.textContent ?? '').trim();
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
        const lines = Math.round(rect.height / lineHeight);
        if (text.length >= 10 && lines >= 4 && text.length / lines < 4) problems.push(`${where(el)} parte su texto letra por letra («${text.slice(0, 24)}»)`);
      }
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (clips && !el.classList.contains('ws-root') && !el.hasAttribute('data-truncate') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0) problems.push(`${where(el)} corta su texto`);
    }
    for (const amount of document.querySelectorAll<HTMLElement>('.tabular-nums')) {
      if (!/^[-$\d.,\s]+$/.test(amount.textContent?.trim() ?? '')) continue;
      // Flex rows stretch the element to the product name's height: inspect the text itself.
      const range = document.createRange();
      range.selectNodeContents(amount);
      const rows = new Set(Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top)));
      if (rows.size > 1) problems.push(`un monto se parte en varias líneas (${amount.textContent?.trim()})`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest('nextjs-portal, [data-nextjs-toast], [aria-hidden="true"], .sr-only, script, style, noscript')) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (parseFloat(style.fontSize) < 11) problems.push(`texto de ${style.fontSize} («${text.slice(0, 30)}»)`);
    }
    return [...new Set(problems)].slice(0, 8);
  }).then((problems) => problems.map((problem) => `${label}: ${problem}`));
}

for (const width of WIDTHS) {
  test(`tienda a ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await fakeProductImages(page);
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.61.0.${(WIDTHS.indexOf(width) % 250) + 1}` });
    await seedCart(page, [
      { productId: demo.productIds['merken-ahumado']!, quantity: 2 },
      { productId: demo.productIds['aceite-maravilla']!, quantity: 1 },
      { productId: demo.productIds['miel-de-ulmo']!, quantity: 1 },
    ]);
    const problems: string[] = [];
    const visit = async (label: string, url: string, prepare?: () => Promise<void>) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await prepare?.();
      // Full-page captures must include lazy images below the initial viewport.
      await page.locator('main img').evaluateAll(async (images) => {
        await Promise.all(images.map(async (image) => {
          const element = image as HTMLImageElement;
          element.loading = 'eager';
          await element.decode().catch(() => undefined);
        }));
      });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `${label}-${width}.png`), fullPage: true });
      problems.push(...(await audit(page, `${label} a ${width}px`)));
    };

    await visit('catalogo', `/web/${STORE_SLUG}/tienda`);
    await visit('ficha', `/web/${STORE_SLUG}/producto/merken-ahumado`);
    await visit('carrito', `/web/${STORE_SLUG}/carrito`, async () => {
      await expect(page.getByText('$').first()).toBeVisible();
    });
    await visit('checkout', `/web/${STORE_SLUG}/finalizar-compra`, async () => {
      await page.getByRole('radio', { name: /Despacho a domicilio/ }).check();
      await page.getByLabel('Región').selectOption('Región de La Araucanía');
      await page.getByRole('radio', { name: /Factura/ }).check();
      await expect(page.getByRole('radio', { name: /Despacho a todo Chile/ })).toBeChecked();
    });
    await visit('pedido', `/web/${STORE_SLUG}/pedido/${orderToken}`);
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
