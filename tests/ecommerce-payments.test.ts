/**
 * Pasarelas y correos de la tienda: qué cuenta como «pagado» según Transbank, cómo se habla con
 * su API (servidor correcto, llaves en los encabezados, respuestas raras) y que los correos al
 * comprador escapen lo que el comprador escribió.
 */
import { evaluateWebpayResult, isWebpayUrl, webpayPaymentMethod } from '@/lib/ecommerce/webpay-verdict';
import { WebpayApiError, commitWebpayTransaction, createWebpayTransaction, getWebpayTransaction } from '@/lib/payments/webpay';
import { buildStoreOrderEmail, buildStoreTeamOrderEmail, type StoreOrderEmailInput } from '@/lib/email/templates';

const order = { id: 'cl7abc123def456ghi789jkl0', amount: 29970 };
const authorized = { status: 'AUTHORIZED', response_code: 0, amount: 29970, buy_order: order.id, authorization_code: '1213', payment_type_code: 'VN' };

describe('veredicto de Webpay', () => {
  it('solo una transacción autorizada, con el monto y la orden de compra del pedido, paga', () => {
    expect(evaluateWebpayResult(authorized, order)).toEqual({ outcome: 'PAID' });
    expect(evaluateWebpayResult({ ...authorized, status: 'CAPTURED' }, order)).toEqual({ outcome: 'PAID' });
  });

  it('una transacción válida de OTRO pedido o por OTRO monto no paga este', () => {
    expect(evaluateWebpayResult({ ...authorized, buy_order: 'otro' }, order)).toMatchObject({ outcome: 'MISMATCH' });
    expect(evaluateWebpayResult({ ...authorized, buy_order: '' }, order)).toMatchObject({ outcome: 'MISMATCH' });
    expect(evaluateWebpayResult({ ...authorized, amount: 29969 }, order)).toMatchObject({ outcome: 'MISMATCH' });
    expect(evaluateWebpayResult({ ...authorized, amount: 100000 }, order)).toMatchObject({ outcome: 'MISMATCH' });
  });

  it('rechazada por el banco, revertida o anulada: fallida', () => {
    expect(evaluateWebpayResult({ ...authorized, status: 'FAILED', response_code: -1 }, order)).toMatchObject({ outcome: 'FAILED' });
    expect(evaluateWebpayResult({ ...authorized, status: 'REVERSED' }, order)).toMatchObject({ outcome: 'FAILED' });
    expect(evaluateWebpayResult({ ...authorized, status: 'NULLIFIED' }, order)).toMatchObject({ outcome: 'FAILED' });
    // «Autorizada» pero con código de respuesta distinto de 0: el banco no aprobó.
    expect(evaluateWebpayResult({ ...authorized, response_code: -4 }, order)).toMatchObject({ outcome: 'FAILED' });
    expect(evaluateWebpayResult({ ...authorized, response_code: undefined }, order)).toMatchObject({ outcome: 'FAILED' });
  });

  it('una transacción que aún no se confirma queda pendiente', () => {
    expect(evaluateWebpayResult({ ...authorized, status: 'INITIALIZED', response_code: undefined }, order)).toEqual({ outcome: 'PENDING' });
  });

  it('el tipo de pago de Transbank se traduce a la forma de pago del ERP', () => {
    expect(webpayPaymentMethod('VD')).toBe('TARJETA_DEBITO');
    expect(webpayPaymentMethod('VP')).toBe('TARJETA_DEBITO');
    for (const code of ['VN', 'VC', 'SI', 'S2', 'NC', undefined]) expect(webpayPaymentMethod(code)).toBe('TARJETA_CREDITO');
  });

  it('el comprador solo se manda a los servidores de Transbank, nunca a una dirección arbitraria', () => {
    expect(isWebpayUrl('https://webpay3g.transbank.cl/webpayserver/initTransaction')).toBe(true);
    expect(isWebpayUrl('https://webpay3gint.transbank.cl/webpayserver/initTransaction')).toBe(true);
    for (const bad of ['http://webpay3g.transbank.cl/x', 'https://webpay3g.transbank.cl.evil.com/x', 'https://evil.com/webpay3g.transbank.cl', 'javascript:alert(1)', '', 'no es url']) expect(isWebpayUrl(bad)).toBe(false);
  });
});

describe('cliente de Webpay Plus', () => {
  const credentials = { commerceCode: '597055555532', apiSecret: 'secreto', production: false };
  let fetchMock: jest.SpyInstance;

  const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('crea la transacción en el ambiente de integración con el código y la llave en los encabezados', async () => {
    reply({ token: 'tok', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' });
    const created = await createWebpayTransaction(credentials, { buyOrder: 'cl7abc123def456ghi789jkl0', sessionId: 'sess', amount: 29970, returnUrl: 'https://app.test/api/public/store/webpay/return' });
    expect(created).toEqual({ token: 'tok', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' });
    const { url, init, headers } = lastCall();
    expect(url).toBe('https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions');
    expect(init.method).toBe('POST');
    expect(headers['Tbk-Api-Key-Id']).toBe('597055555532');
    expect(headers['Tbk-Api-Key-Secret']).toBe('secreto');
    expect(JSON.parse(String(init.body))).toEqual({ buy_order: 'cl7abc123def456ghi789jkl0', session_id: 'sess', amount: 29970, return_url: 'https://app.test/api/public/store/webpay/return' });
  });

  it('en producción usa el servidor de producción', async () => {
    reply({ token: 'tok', url: 'https://webpay3g.transbank.cl/webpayserver/initTransaction' });
    await createWebpayTransaction({ ...credentials, production: true }, { buyOrder: 'x', sessionId: 'x', amount: 1000, returnUrl: 'https://app.test/r' });
    expect(lastCall().url.startsWith('https://webpay3g.transbank.cl/')).toBe(true);
  });

  it('acota la orden de compra y la sesión a lo que acepta Transbank', async () => {
    reply({ token: 'tok', url: 'https://webpay3gint.transbank.cl/x' });
    await createWebpayTransaction(credentials, { buyOrder: 'o'.repeat(60), sessionId: 's'.repeat(100), amount: 1000, returnUrl: 'https://app.test/r' });
    const body = JSON.parse(String(lastCall().init.body));
    expect(body.buy_order).toHaveLength(26);
    expect(body.session_id).toHaveLength(61);
  });

  it('confirmar usa PUT sobre el token y consultar usa GET; el token se escapa', async () => {
    reply(authorized);
    await commitWebpayTransaction(credentials, 'tok/../x');
    expect(lastCall().init.method).toBe('PUT');
    expect(lastCall().url).toContain('/transactions/tok%2F..%2Fx');
    reply(authorized);
    await getWebpayTransaction(credentials, 'tok');
    expect(lastCall().init.method).toBe('GET');
  });

  it('un error de Transbank llega con su código para distinguir «ya confirmada» (422) de credenciales malas (401)', async () => {
    reply('ya confirmada', 422);
    await expect(commitWebpayTransaction(credentials, 'tok')).rejects.toMatchObject({ status: 422 });
    reply('no autorizado', 401);
    await expect(getWebpayTransaction(credentials, 'tok')).rejects.toBeInstanceOf(WebpayApiError);
  });

  it('una respuesta sin lo esperado se rechaza en vez de creerla', async () => {
    reply({ nada: true });
    await expect(createWebpayTransaction(credentials, { buyOrder: 'x', sessionId: 'x', amount: 1000, returnUrl: 'https://app.test/r' })).rejects.toThrow(/sin token/);
    reply({ token: 'tok' });
    await expect(createWebpayTransaction(credentials, { buyOrder: 'x', sessionId: 'x', amount: 1000, returnUrl: 'https://app.test/r' })).rejects.toThrow(/sin token\/url/);
    reply({ amount: 100 });
    await expect(getWebpayTransaction(credentials, 'tok')).rejects.toThrow(/sin status/);
  });
});

describe('correos de la tienda', () => {
  const base: StoreOrderEmailInput = {
    kind: 'received',
    companyName: 'Tienda <b>Sur</b> & Cía',
    customerName: '<script>alert(1)</script> Camila',
    orderNumber: 1042,
    items: [{ name: 'Aceite "Chef" <i>900</i>', quantity: 3, total: 29970 }],
    subtotal: 29970,
    shippingTotal: 3990,
    shippingLabel: 'Despacho Santiago',
    rounding: 1,
    total: 33961,
    details: ['Transfiere $33.961 con estos datos:', 'Banco <Estado>', 'Cuenta 123'],
    orderUrl: 'https://app.test/web/mi-sitio/pedido/abc',
    supportPhone: '+56 9 1234 5678',
  };

  it('no deja pasar HTML escrito por el comprador ni por la empresa', () => {
    const { html, subject } = buildStoreOrderEmail(base);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Sur</b>');
    expect(html).not.toContain('<i>900</i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Banco &lt;Estado&gt;');
    expect(subject).toBe('Recibimos tu pedido #1042');
  });

  it('muestra el despacho, el ajuste por redondeo solo si existe y el total', () => {
    const { html, text } = buildStoreOrderEmail(base);
    expect(html).toContain('$3.990');
    expect(html).toContain('Ajuste por redondeo');
    expect(html).toContain('$33.961');
    expect(text).toContain('Total: $33.961');
    expect(buildStoreOrderEmail({ ...base, rounding: 0 }).html).not.toContain('Ajuste por redondeo');
    expect(buildStoreOrderEmail({ ...base, shippingTotal: 0 }).html).toContain('Gratis');
    expect(buildStoreOrderEmail({ ...base, shippingLabel: null }).html).not.toContain('Despacho Santiago');
  });

  it('cada hito tiene su asunto', () => {
    const subjects = (['received', 'paid', 'shipped', 'ready', 'cancelled', 'expired'] as const).map((kind) => buildStoreOrderEmail({ ...base, kind }).subject);
    expect(new Set(subjects).size).toBe(6);
    expect(subjects.every((subject) => subject.includes('#1042'))).toBe(true);
  });

  it('el aviso al equipo distingue pagado de por confirmar y escapa el nombre', () => {
    const team = { companyName: 'Tienda Sur', siteName: 'Sitio <x>', orderNumber: 7, customerName: '<b>Ana</b>', total: 5000, deliveryLabel: 'Retiro', panelUrl: 'https://app.test/dashboard/store?pedido=1' };
    const pending = buildStoreTeamOrderEmail({ ...team, paid: false });
    const paid = buildStoreTeamOrderEmail({ ...team, paid: true });
    expect(pending.subject).toContain('por confirmar');
    expect(paid.subject).toContain('pagado');
    expect(pending.html).not.toContain('<b>Ana</b>');
    expect(pending.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});
