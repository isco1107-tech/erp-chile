import { expect, test } from '@playwright/test';
import { db } from './db';
import { startFakeGateways, type FakeGateways } from './fake-gateways';
import { GATEWAYS_CONFIGURED, GATEWAYS_HINT, STORE_SLUG, ensureStoreDemo, fakeProductImages, fillCheckout, onHandOf, orderByToken, resetStoreOrders, seedCart, type StoreDemo } from './store-support';

/**
 * Recorridos del COMPRADOR de la tienda en línea, sin sesión: catálogo, ficha, carrito, finalizar compra y
 * seguimiento del pedido, con transferencia, Khipu y Webpay. Las pasarelas son simuladas (e2e/fake-gateways.ts).
 *
 * Lo que comprueban: que el precio y el stock salgan del servidor, que el pedido quede con el total correcto y
 * stock apartado, que un pago en línea solo se dé por bueno después de consultar a la pasarela y que el carrito
 * funcione en un celular.
 */
let demo: StoreDemo;
let gateways: FakeGateways | null = null;

test.beforeAll(async () => {
  demo = await ensureStoreDemo();
  await resetStoreOrders();
  if (GATEWAYS_CONFIGURED) gateways = await startFakeGateways();
});

test.afterAll(async () => {
  await gateways?.close();
});

let visitor = 0;
test.beforeEach(async ({ page }) => {
  await fakeProductImages(page);
  // Cada prueba llega desde su propia IP: los límites por IP de la tienda no deben acoplar unas pruebas con otras.
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.20.${Math.floor(++visitor / 250)}.${(visitor % 250) + 1}` });
});

const orderToken = (url: string) => /\/pedido\/([a-f0-9]{64})/.exec(url)?.[1] ?? '';

test.describe('catálogo y ficha', () => {
  test('lista lo publicado con precio con IVA, descuento y agotado; busca y filtra por colección', async ({ page }) => {
    await page.goto(`/web/${STORE_SLUG}/tienda`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tienda' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Aceite de maravilla 900 ml' }).first()).toBeVisible();
    await expect(page.getByText('$3.990').first()).toBeVisible();
    await expect(page.getByText('$4.990').first()).toBeVisible(); // precio anterior tachado
    await expect(page.getByText('-20%')).toBeVisible();
    await expect(page.getByText('Últimas 3 unidades')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agotado' }).first()).toBeDisabled();
    await expect(page.getByText('6 productos')).toBeVisible();

    await page.getByRole('navigation', { name: 'Colecciones' }).getByRole('link', { name: /Infusiones/ }).click();
    await expect(page).toHaveURL(/coleccion=Infusiones/);
    await expect(page.getByText('2 productos')).toBeVisible();

    await page.getByRole('search').getByRole('searchbox').fill('harina');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByText('No encontramos productos')).toBeVisible(); // la búsqueda conserva la colección elegida
    await page.getByRole('link', { name: 'Ver todo el catálogo' }).click();
    await page.getByRole('search').getByRole('searchbox').fill('harina');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Harina selecta 1 kg' }).first()).toBeVisible();
    await expect(page.getByText('1 producto', { exact: true })).toBeVisible();
  });

  test('la ficha muestra galería, descripción, entrega y condiciones; un producto agotado no se compra', async ({ page }) => {
    await page.goto(`/web/${STORE_SLUG}/producto/aceite-maravilla`);
    await expect(page.getByRole('heading', { level: 1, name: 'Aceite de maravilla 900 ml' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Fotos del producto' }).getByRole('button')).toHaveCount(3);
    await expect(page.getByText('Botella de 900 ml.')).toBeVisible();
    await expect(page.getByText(/Retiro en tienda: Av. Alemania 0123/)).toBeVisible();
    await expect(page.getByText('Cambios y devoluciones')).toBeVisible();
    const structured = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
    expect(structured).toContain('"@type":"Product"');
    expect(structured).toContain('"price":3990');
    expect(structured).toContain('"priceCurrency":"CLP"');

    await page.goto(`/web/${STORE_SLUG}/producto/te-boldo-20`);
    await expect(page.getByRole('button', { name: 'Agotado' })).toBeDisabled();
    await page.goto(`/web/${STORE_SLUG}/producto/no-existe`);
    await expect(page).toHaveURL(new RegExp(`/web/${STORE_SLUG}/tienda`));
  });
});

test.describe('carrito', () => {
  test('agrega, cambia cantidades, quita y conserva el carrito al recargar', async ({ page }) => {
    await page.goto(`/web/${STORE_SLUG}/producto/aceite-maravilla`);
    await page.getByRole('button', { name: 'Una unidad más' }).click();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('Agregamos 2 unidades')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Carrito, 2 unidades' })).toBeVisible();

    await page.goto(`/web/${STORE_SLUG}/carrito`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tu carrito' })).toBeVisible();
    await expect(page.getByText('$7.980').first()).toBeVisible(); // 2 × 3.990, calculado por el servidor
    await page.getByRole('button', { name: 'Una unidad más' }).click();
    await expect(page.getByText('$11.970').first()).toBeVisible();
    await page.reload();
    await expect(page.getByText('$11.970').first()).toBeVisible();
    await page.getByRole('button', { name: /Quitar Aceite de maravilla 900 ml del carrito/ }).click();
    await expect(page.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
  });

  test('ajusta lo que ya no alcanza y avisa; un precio escrito a mano en el almacenamiento no vale', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['miel-de-ulmo']!, quantity: 10 }]);
    await page.addInitScript(() => {
      // Un navegador manipulado podría guardar cualquier cosa: solo cuentan producto y cantidad.
      try { window.localStorage.setItem('aether-cart:tienda-e2e', JSON.stringify([{ productId: JSON.parse(window.localStorage.getItem('aether-cart:tienda-e2e') ?? '[]')[0]?.productId, quantity: 10, price: 1, grossUnit: 1 }])); } catch { /* sin storage */ }
    });
    await page.goto(`/web/${STORE_SLUG}/carrito`);
    await expect(page.getByText(/solo podemos entregarte 3/)).toBeVisible();
    await expect(page.getByText('$22.470').first()).toBeVisible(); // 3 × 7.490: el precio es el de la base
    await expect(page.getByRole('link', { name: 'Carrito, 3 unidades' })).toBeVisible();
  });

  test('en un celular: agrega desde el catálogo y el carrito se ve completo sin desbordar', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-CL' });
    const page = await context.newPage();
    await fakeProductImages(page);
    await page.goto(`/web/${STORE_SLUG}/tienda`);
    await page.getByRole('button', { name: 'Agregar Harina selecta 1 kg al carrito' }).tap();
    await expect(page.getByRole('link', { name: 'Carrito, 1 unidad' })).toBeVisible();
    await page.getByRole('link', { name: 'Carrito, 1 unidad' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu carrito' })).toBeVisible();
    await expect(page.getByText('$1.190').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('link', { name: 'Continuar con la compra' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe('comprar', () => {
  test('transferencia con retiro: crea el pedido con el total correcto, aparta el stock y vacía el carrito', async ({ page }) => {
    const before = await onHandOf('aceite-maravilla');
    await seedCart(page, [{ productId: demo.productIds['aceite-maravilla']!, quantity: 2 }]);
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    await expect(page.getByText('$7.980').first()).toBeVisible();
    const submit = await fillCheckout(page, { delivery: 'pickup', payment: /Transferencia bancaria/ });
    await expect(submit).toHaveText('Confirmar pedido');
    await submit.click();

    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
    await expect(page.getByRole('heading', { level: 1, name: /Pedido #\d+/ })).toBeVisible();
    await expect(page.getByText('Paga con transferencia bancaria')).toBeVisible();
    await expect(page.getByText('Cuenta vista 12345678')).toBeVisible();
    await expect(page.getByText('Total a transferir:')).toContainText('$7.980');

    const order = await orderByToken(orderToken(page.url()));
    expect(order).toMatchObject({ total: 7980, paymentProvider: 'TRANSFER', paymentStatus: 'PENDING', status: 'OPEN', deliveryMethod: 'PICKUP' });
    expect(order.items).toHaveLength(1);
    expect(await onHandOf('aceite-maravilla')).toBe(before); // apartado, no descontado: el stock físico baja al emitir la venta
    // Página del pedido: no se indexa ni envía referencia.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    // El carrito quedó vacío.
    await page.goto(`/web/${STORE_SLUG}/carrito`);
    await expect(page.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
  });

  test('despacho a otra región con boleta: el costo sale de la tarifa y se suma al total', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 2 }]);
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    await page.getByRole('radio', { name: /Despacho a domicilio/ }).check();
    await page.getByLabel('Región').selectOption('Región de La Araucanía');
    await expect(page.getByRole('radio', { name: /Despacho a todo Chile/ })).toBeChecked();
    // 2 × 1.190 + 5.990 de despacho (la tarifa «Despacho Santiago» no llega a esta región).
    await expect(page.getByText('$8.370').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: /Despacho Santiago/ })).toHaveCount(0);
    const submit = await fillCheckout(page, { delivery: 'shipping', payment: /Transferencia bancaria/, address: { region: 'Región de La Araucanía', comuna: 'Temuco', street: 'Manuel Montt 845' } });
    await submit.click();
    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
    const order = await orderByToken(orderToken(page.url()));
    expect(order).toMatchObject({ total: 8370, shippingTotal: 5990, shippingRateId: 'pais', deliveryMethod: 'SHIPPING' });
  });

  test('un dato inválido avisa en español y no crea el pedido', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 1 }]);
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    await page.getByLabel('Nombre completo').fill('Camila Rojas');
    await page.getByLabel('Correo', { exact: false }).first().fill('camila@correo.cl');
    await page.getByLabel('Teléfono').fill('+56 9 1234 5678');
    await page.getByLabel('RUT (opcional)').fill('12.345.678-0');
    await page.getByRole('radio', { name: /Retiro en tienda/ }).check();
    await page.getByRole('radio', { name: /Transferencia bancaria/ }).check();
    await page.getByRole('checkbox', { name: /Acepto las condiciones/ }).check();
    const before = await db().storeOrder.count();
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'El RUT no es válido' })).toBeVisible();
    await expect(page).toHaveURL(/finalizar-compra/);
    expect(await db().storeOrder.count()).toBe(before);
  });

  test('un reintento no duplica el pedido: la misma compra enviada dos veces es un solo pedido', async ({ page, request }) => {
    const body = {
      idempotencyKey: `ck_e2e_${Date.now()}_retry000`,
      lines: [{ productId: demo.productIds['harina-selecta'], quantity: 1 }],
      customer: { name: 'Camila Rojas', email: 'camila@correo.cl', phone: '+56 9 1234 5678' },
      documentType: 'BOLETA', deliveryMethod: 'PICKUP', paymentProvider: 'TRANSFER', acceptTerms: true, website: '',
    };
    void page;
    const headers = { 'x-forwarded-for': '10.30.0.1' };
    const first = await request.post(`/api/public/store/${STORE_SLUG}/checkout`, { data: body, headers });
    const second = await request.post(`/api/public/store/${STORE_SLUG}/checkout`, { data: body, headers });
    const a = (await first.json()) as { data: { orderToken: string; replayed: boolean } };
    const b = (await second.json()) as { data: { orderToken: string; replayed: boolean } };
    expect(b.data.orderToken).toBe(a.data.orderToken);
    expect(b.data.replayed).toBe(true);
  });
});

test.describe('pago en línea con pasarela simulada', () => {
  test.skip(!GATEWAYS_CONFIGURED, GATEWAYS_HINT);

  test('Khipu: el comprador paga en el banco y su pedido se da por pagado solo tras consultar a Khipu', async ({ page }) => {
    const before = await onHandOf('harina-selecta');
    await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 2 }]);
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    const submit = await fillCheckout(page, { delivery: 'pickup', payment: /Transferencia con Khipu/ });
    await expect(submit).toContainText('Pagar $2.380');
    await submit.click();

    // Va a la página de pago de la pasarela (simulada).
    await expect(page).toHaveURL(new RegExp(`localhost:${gateways!.port}/khipu/pay/`));
    const paymentId = page.url().split('/').pop()!;
    expect(gateways!.khipu.get(paymentId)).toMatchObject({ amount: 2380, apiKey: 'llave-khipu-e2e' }); // la llave es la de la empresa
    const callsBefore = gateways!.calls.length;
    await page.getByRole('button', { name: 'Pagar con mi banco' }).click();

    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
    await expect(page.getByText('Pago confirmado')).toBeVisible();
    // La app CONSULTÓ el cobro a Khipu: no se fió del regreso del navegador.
    expect(gateways!.calls.slice(callsBefore).some((call) => call.method === 'GET' && call.path === `/v3/payments/${paymentId}`)).toBe(true);
    const order = await orderByToken(orderToken(page.url()));
    expect(order).toMatchObject({ paymentStatus: 'PAID', paymentProvider: 'KHIPU', providerPaymentId: paymentId, total: 2380 });
    expect(order.salesDocument).toMatchObject({ status: 'ISSUED', totalAmount: 2380 });
    expect(await onHandOf('harina-selecta')).toBe(before - 2); // la venta descontó la bodega
  });

  test('Khipu: un cobro por un monto distinto NO paga el pedido', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 1 }]);
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    const submit = await fillCheckout(page, { delivery: 'pickup', payment: /Transferencia con Khipu/ });
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`localhost:${gateways!.port}/khipu/pay/`));
    const paymentId = page.url().split('/').pop()!;
    gateways!.payKhipu(paymentId, { amount: 100 }); // el cobro dice «pagado» pero por $100
    await page.goto(gateways!.khipu.get(paymentId)!.returnUrl);
    await expect(page.getByRole('heading', { level: 1, name: /Pedido #\d+/ })).toBeVisible();
    await expect(page.getByText('Pago confirmado')).toHaveCount(0);
    const order = await orderByToken(orderToken(page.url()));
    expect(order.paymentStatus).not.toBe('PAID');
    expect(order.salesDocument).toBeNull();
  });

  test('Webpay: puente hacia Transbank, regreso del comprador y confirmación consultando a Transbank', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['merken-ahumado']!, quantity: 1 }]);
    // Transbank simulado: recibe el POST del puente con el token y devuelve al comprador a la tienda, como el sitio real.
    let bridgeBody = '';
    await page.route('https://webpay3gint.transbank.cl/**', async (route) => {
      bridgeBody = route.request().postData() ?? '';
      const token = new URLSearchParams(bridgeBody).get('token_ws') ?? '';
      const transaction = gateways!.webpay.get(token);
      gateways!.decideWebpay(token, 'AUTHORIZED');
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><meta charset="utf-8"><form id="f" method="POST" action="${transaction!.returnUrl}"><input type="hidden" name="token_ws" value="${token}"></form><script>document.getElementById("f").submit()</script>`,
      });
    });
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    const submit = await fillCheckout(page, { delivery: 'pickup', payment: /Tarjeta \(Webpay Plus\)/ });
    await submit.click();

    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/, { timeout: 30_000 });
    expect(new URLSearchParams(bridgeBody).get('token_ws')).toMatch(/^[0-9a-f]{64}$/);
    await expect(page.getByText('Pago confirmado')).toBeVisible();
    const order = await orderByToken(orderToken(page.url()));
    expect(order).toMatchObject({ paymentStatus: 'PAID', paymentProvider: 'WEBPAY', total: 4290, paymentMethodCode: 'TARJETA_DEBITO' });
    expect(order.paymentReference).toContain('1213');
    expect(order.salesDocument).toMatchObject({ status: 'ISSUED' });
    // La app hizo la confirmación (PUT) con Transbank con la llave de la empresa.
    expect(gateways!.calls.some((call) => call.method === 'PUT' && call.path.endsWith(`/${[...gateways!.webpay.keys()].pop()}`))).toBe(true);
  });

  test('Webpay: si el comprador anula en Transbank vuelve a su pedido y puede pagar de nuevo', async ({ page }) => {
    await seedCart(page, [{ productId: demo.productIds['harina-selecta']!, quantity: 1 }]);
    await page.route('https://webpay3gint.transbank.cl/**', async (route) => {
      const token = new URLSearchParams(route.request().postData() ?? '').get('token_ws') ?? '';
      const transaction = gateways!.webpay.get(token)!;
      // «Anular compra» en Transbank: vuelve con TBK_TOKEN (y sin token_ws).
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><form id="f" method="POST" action="${transaction.returnUrl}"><input type="hidden" name="TBK_TOKEN" value="${token}"></form><script>document.getElementById("f").submit()</script>` });
    });
    await page.goto(`/web/${STORE_SLUG}/finalizar-compra`);
    const submit = await fillCheckout(page, { delivery: 'pickup', payment: /Tarjeta \(Webpay Plus\)/ });
    await submit.click();
    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/, { timeout: 30_000 });
    await expect(page.getByText('Pago confirmado')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pagar ahora' })).toBeVisible();
    const order = await orderByToken(orderToken(page.url()));
    expect(order).toMatchObject({ status: 'OPEN', paymentStatus: 'FAILED' });
    expect(order.salesDocument).toBeNull();
  });
});

test.describe('lo que no existe, no se ve', () => {
  test('un enlace de pedido inventado y una tienda inexistente responden sin revelar nada', async ({ page, request }) => {
    const missing = await page.goto(`/web/${STORE_SLUG}/pedido/${'0'.repeat(64)}`);
    expect(missing?.status()).toBe(404);
    const unknown = await request.post('/api/public/store/no-existe-xyz/quote', { data: { lines: [] } });
    expect(unknown.status()).toBe(404);
    const html = await request.get(`/api/public/store/webpay/start?o=${'0'.repeat(64)}`);
    expect(html.status()).toBe(404);
  });
});
