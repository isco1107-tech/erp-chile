/**
 * Lógica pura de la tienda en línea (src/lib/ecommerce): despacho por región, carrito
 * del navegador, stock disponible, precio del pedido, ciclo de vida, medios de pago y
 * el cuerpo del checkout. Es lo que decide cuánto se cobra, qué se puede pedir y qué
 * botones ve el equipo: por eso se prueba sin mocks.
 */
import { computeDocument } from '@/modules/sales/calc';
import { calculateGrossPrice, calculateNeto } from '@/lib/chile/tax';
import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  addToCart,
  cartCount,
  cartStorageKey,
  normalizeCart,
  removeFromCart,
  setQuantity,
} from '@/lib/ecommerce/cart';
import { LOW_STOCK_THRESHOLD, availableUnits, purchasableQuantity, stockLabel } from '@/lib/ecommerce/availability';
import { priceOrder, type PricedLineInput } from '@/lib/ecommerce/pricing';
import {
  availableFulfillmentActions,
  buildTimeline,
  canApplyFulfillment,
  canCancel,
  canConfirmManualPayment,
  type OrderSnapshot,
} from '@/lib/ecommerce/order-state';
import {
  DEFAULT_TRANSFER_HOLD_HOURS,
  MAX_TRANSFER_HOLD_HOURS,
  ONLINE_HOLD_MINUTES,
  holdMinutes,
  parsePaymentMethods,
  usableProviders,
  type StorePaymentSetup,
} from '@/lib/ecommerce/payment';
import { REGION_NAMES, comunasOf, etaLabel, parseShippingRates, ratesForRegion, shippingPrice, shippingRateSchema, shippingRatesSchema } from '@/lib/ecommerce/shipping';
import { productSlug } from '@/lib/ecommerce/slug';
import { checkoutSchema, quoteSchema } from '@/lib/ecommerce/checkout';
import { isValidPageSlug } from '@/lib/web-sites/page-slugs';

describe('despacho por región', () => {
  const rate = (over: Record<string, unknown> = {}) => shippingRateSchema.parse({ id: 'r1', name: 'Despacho', regions: [], price: 3990, ...over });

  it('hay 16 regiones y cada una trae sus comunas', () => {
    expect(REGION_NAMES).toHaveLength(16);
    expect(comunasOf('Región Metropolitana de Santiago')).toContain('Providencia');
    expect(comunasOf('Región inventada')).toEqual([]);
  });

  it('una tarifa sin regiones llega a todo Chile; con regiones, solo a esas', () => {
    const rm = 'Región Metropolitana de Santiago';
    const norte = REGION_NAMES[1]!;
    const todo = rate({ id: 'a', price: 5990 });
    const soloRm = rate({ id: 'b', regions: [rm], price: 2990 });
    expect(ratesForRegion([todo, soloRm], rm).map((r) => r.id)).toEqual(['b', 'a']); // la más barata primero
    expect(ratesForRegion([todo, soloRm], norte).map((r) => r.id)).toEqual(['a']);
    expect(ratesForRegion([soloRm], norte)).toEqual([]);
  });

  it('el despacho es gratis solo al llegar al monto, no antes', () => {
    const r = rate({ freeOver: 40000 });
    expect(shippingPrice(r, 39999)).toBe(3990);
    expect(shippingPrice(r, 40000)).toBe(0);
    expect(shippingPrice(rate(), 1_000_000)).toBe(3990);
    expect(shippingPrice(rate({ price: 0 }), 100)).toBe(0);
  });

  it('el plazo se lee en español, con un solo día en singular', () => {
    expect(etaLabel(rate({ minDays: 2, maxDays: 4 }))).toBe('2 a 4 días hábiles');
    expect(etaLabel(rate({ minDays: 3, maxDays: 3 }))).toBe('3 días hábiles');
    expect(etaLabel(rate({ minDays: 1, maxDays: 1 }))).toBe('1 día hábil');
    expect(etaLabel(rate({ maxDays: 5 }))).toBe('Hasta 5 días hábiles');
    expect(etaLabel(rate({ minDays: 2 }))).toBe('Desde 2 días hábiles');
    expect(etaLabel(rate())).toBeNull();
  });

  it('rechaza tarifas con datos imposibles', () => {
    expect(shippingRateSchema.safeParse({ id: 'x', name: 'A', price: 100 }).success).toBe(false); // nombre muy corto
    expect(shippingRateSchema.safeParse({ id: 'x', name: 'Despacho', price: -1 }).success).toBe(false);
    expect(shippingRateSchema.safeParse({ id: 'x', name: 'Despacho', price: 100.5 }).success).toBe(false);
    expect(shippingRateSchema.safeParse({ id: 'x', name: 'Despacho', price: 100, regions: ['Narnia'] }).success).toBe(false);
    expect(shippingRateSchema.safeParse({ id: 'x', name: 'Despacho', price: 100, minDays: 5, maxDays: 2 }).success).toBe(false);
    expect(shippingRatesSchema.safeParse([rate({ id: 'dup' }), rate({ id: 'dup' })]).success).toBe(false);
  });

  it('al leer lo guardado descarta lo inválido y lo repetido en vez de romper la tienda', () => {
    const ok = rate({ id: 'ok' });
    expect(parseShippingRates([ok, { id: 'malo' }, 'basura', null, { ...ok, name: 'Duplicada' }])).toEqual([ok]);
    expect(parseShippingRates('no es lista')).toEqual([]);
    expect(parseShippingRates(undefined)).toEqual([]);
  });
});

describe('carrito del navegador', () => {
  it('lo que trae el almacenamiento no es de fiar: se normaliza', () => {
    expect(normalizeCart('x')).toEqual([]);
    expect(normalizeCart([{ productId: 'a', quantity: 2 }, null, 5, { productId: 3, quantity: 1 }, { productId: 'b', quantity: 'tres' }, { productId: 'c', quantity: Number.NaN }])).toEqual([{ productId: 'a', quantity: 2 }]);
    expect(normalizeCart([{ productId: 'a', quantity: 2.9 }])).toEqual([{ productId: 'a', quantity: 2 }]);
    expect(normalizeCart([{ productId: 'a', quantity: -4 }, { productId: 'b', quantity: 0 }])).toEqual([]);
    expect(normalizeCart([{ productId: 'a', quantity: 500 }])).toEqual([{ productId: 'a', quantity: MAX_LINE_QUANTITY }]);
    expect(normalizeCart([{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }])).toEqual([{ productId: 'a', quantity: 3 }]);
    expect(normalizeCart([{ productId: 'x'.repeat(41), quantity: 1 }])).toEqual([]);
  });

  it('no pasa del tope de líneas', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    expect(normalizeCart(big)).toHaveLength(MAX_CART_LINES);
    const full = normalizeCart(big);
    expect(addToCart(full, 'nuevo')).toHaveLength(MAX_CART_LINES);
    expect(addToCart(full, 'p0', 2).find((l) => l.productId === 'p0')?.quantity).toBe(3); // sumar a una línea existente sí se puede
  });

  it('agregar suma, respeta el tope por pedido y quitar o poner 0 la saca', () => {
    let cart = addToCart([], 'a');
    cart = addToCart(cart, 'a', 2);
    expect(cart).toEqual([{ productId: 'a', quantity: 3 }]);
    expect(addToCart(cart, 'a', 10, 4)).toEqual([{ productId: 'a', quantity: 4 }]);
    expect(setQuantity(cart, 'a', 7)).toEqual([{ productId: 'a', quantity: 7 }]);
    expect(setQuantity(cart, 'a', 0)).toEqual([]);
    expect(setQuantity(cart, 'a', -3)).toEqual([]);
    expect(removeFromCart(cart, 'a')).toEqual([]);
    expect(cartCount([{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 2 }])).toBe(5);
    expect(cartStorageKey('mi-sitio')).toBe('aether-cart:mi-sitio');
  });

  it('no muta el carrito que recibe', () => {
    const original = Object.freeze([Object.freeze({ productId: 'a', quantity: 1 })]);
    expect(() => addToCart(original, 'a')).not.toThrow();
    expect(() => setQuantity(original, 'a', 3)).not.toThrow();
    expect(original[0]!.quantity).toBe(1);
  });
});

describe('stock disponible', () => {
  it('es el stock físico menos lo apartado y lo comprometido, nunca negativo', () => {
    expect(availableUnits({ onHand: 10, reservedByStore: 3 })).toBe(7);
    expect(availableUnits({ onHand: 10, reservedByStore: 3, committedBySalesOrders: 2 })).toBe(5);
    expect(availableUnits({ onHand: 2, reservedByStore: 5 })).toBe(0);
    expect(availableUnits({ onHand: -3, reservedByStore: 0 })).toBe(0);
    // Stock fraccionario (kg): solo se venden unidades enteras.
    expect(availableUnits({ onHand: 4.7, reservedByStore: 0 })).toBe(4);
    expect(availableUnits({ onHand: 0.1 + 0.2, reservedByStore: 0.3 })).toBe(0);
  });

  it('avisa agotado, últimas unidades o disponible; sin control de stock siempre disponible', () => {
    expect(stockLabel(null)).toEqual({ state: 'in_stock', text: 'Disponible' });
    expect(stockLabel(0).state).toBe('out');
    expect(stockLabel(1)).toEqual({ state: 'low', text: 'Última unidad' });
    expect(stockLabel(3)).toEqual({ state: 'low', text: 'Últimas 3 unidades' });
    expect(stockLabel(LOW_STOCK_THRESHOLD + 1).state).toBe('in_stock');
  });

  it('lo que se puede pedir no pasa del stock ni del tope por pedido', () => {
    expect(purchasableQuantity(5, 3)).toBe(3);
    expect(purchasableQuantity(5, null)).toBe(5);
    expect(purchasableQuantity(5, 10, 2)).toBe(2);
    expect(purchasableQuantity(0, 10)).toBe(0);
    expect(purchasableQuantity(-2, 10)).toBe(0);
    expect(purchasableQuantity(2.9, 10)).toBe(2);
  });
});

describe('precio del pedido', () => {
  const line = (over: Partial<PricedLineInput> = {}): PricedLineInput => ({
    productId: 'p1', sku: 'S1', name: 'Producto', imageUrl: null, unit: 'UN', isExempt: false, netUnit: 8395, quantity: 1, ...over,
  });

  it('el total es exactamente el del documento de venta (mismo cálculo que Ventas y POS)', () => {
    const lines = [line({ netUnit: 8395, quantity: 3 }), line({ productId: 'p2', netUnit: 4193, quantity: 2 }), line({ productId: 'p3', isExempt: true, netUnit: 1500, quantity: 1 })];
    const shipping = 3990;
    const priced = priceOrder(lines, shipping);
    const doc = computeDocument([
      ...lines.map((l) => ({ unitPrice: l.netUnit, quantity: l.quantity, isExempt: l.isExempt })),
      { unitPrice: priced.shippingNet, quantity: 1, isExempt: false },
    ]);
    expect(priced.total).toBe(doc.totals.totalAmount);
    expect(priced.netAmount).toBe(doc.totals.netAmount);
    expect(priced.exemptAmount).toBe(doc.totals.exemptAmount);
    expect(priced.ivaAmount).toBe(doc.totals.ivaAmount);
    expect(priced.netAmount + priced.exemptAmount + priced.ivaAmount).toBe(priced.total);
  });

  it('el comprador ve precio con IVA × unidades y el despacho tal como se configuró', () => {
    const priced = priceOrder([line({ netUnit: 8395, quantity: 3 })], 3990);
    expect(priced.lines[0]!.grossUnit).toBe(9990);
    expect(priced.lines[0]!.displayTotal).toBe(29970);
    expect(priced.subtotal).toBe(29970);
    expect(priced.shippingTotal).toBe(3990);
    expect(priced.total).toBe(29970 + 3990 + priced.rounding);
    expect(priced.rounding).toBe(0);
  });

  it('un producto exento no lleva IVA y retiro no cobra despacho', () => {
    const priced = priceOrder([line({ isExempt: true, netUnit: 2000, quantity: 2 })], 0);
    expect(priced.lines[0]!.grossUnit).toBe(2000);
    expect(priced.total).toBe(4000);
    expect(priced.ivaAmount).toBe(0);
    expect(priced.shippingTotal).toBe(0);
    expect(priced.shippingNet).toBe(0);
  });

  it('con despacho el neto del despacho absorbe el redondeo: lo que se ve y lo que se cobra casi siempre calzan', () => {
    // Una tienda fija precios finales ($9.990, $4.990…) y el neto del catálogo sale de ahí.
    let withRounding = 0;
    const total = 800;
    for (let seed = 1; seed <= total; seed++) {
      const lines = Array.from({ length: 1 + (seed % 3) }, (_, i) =>
        line({ productId: `p${i}`, netUnit: calculateNeto(990 + ((seed * 7 + i * 13) % 200) * 100), quantity: 1 + ((seed + i) % 4) })
      );
      const shipping = 1990 + (seed % 10) * 500;
      const priced = priceOrder(lines, shipping);
      expect(priced.subtotal + priced.shippingTotal + priced.rounding).toBe(priced.total);
      for (const l of priced.lines) expect(l.grossUnit).toBe(calculateGrossPrice(l.netUnit, l.isExempt));
      // El neto del despacho se mueve solo unos pesos respecto de gross / 1,19.
      expect(Math.abs(priced.shippingNet - calculateNeto(shipping))).toBeLessThanOrEqual(3);
      expect(Math.abs(priced.rounding)).toBeLessThanOrEqual(1);
      if (priced.rounding !== 0) withRounding++;
    }
    expect(withRounding).toBeLessThan(total * 0.25);
  });

  it('sin despacho y con un solo producto lo que se ve y lo que se cobra son lo mismo', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const priced = priceOrder([line({ netUnit: calculateNeto(990 + (seed % 200) * 100), quantity: 1 })], 0);
      expect(priced.rounding).toBe(0);
      expect(priced.total).toBe(priced.lines[0]!.grossUnit);
    }
  });

  it('con netos arbitrarios el ajuste crece con las unidades, pero el total sigue siendo el del documento', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const lines = Array.from({ length: 1 + (seed % 5) }, (_, i) =>
        line({ productId: `p${i}`, netUnit: 100 + ((seed * 37 + i * 911) % 50000), quantity: 1 + ((seed + i) % 6), isExempt: (seed + i) % 7 === 0 })
      );
      const priced = priceOrder(lines, seed % 3 === 0 ? 0 : 990 + (seed % 20) * 100);
      const doc = computeDocument([
        ...lines.map((l) => ({ unitPrice: l.netUnit, quantity: l.quantity, isExempt: l.isExempt })),
        ...(priced.shippingTotal > 0 ? [{ unitPrice: priced.shippingNet, quantity: 1, isExempt: false }] : []),
      ]);
      expect(priced.total).toBe(doc.totals.totalAmount);
      expect(priced.subtotal + priced.shippingTotal + priced.rounding).toBe(priced.total);
      const units = lines.reduce((sum, l) => sum + l.quantity, 0);
      expect(Math.abs(priced.rounding)).toBeLessThanOrEqual(Math.ceil(units / 2) + 1);
    }
  });

  it('los valores contables de las líneas suman el neto y el IVA del documento', () => {
    const priced = priceOrder([line({ netUnit: 1001, quantity: 3 }), line({ productId: 'p2', netUnit: 777, quantity: 5 })], 0);
    expect(priced.lines.reduce((s, l) => s + l.iva, 0)).toBe(priced.ivaAmount);
    expect(priced.lines.reduce((s, l) => s + l.subtotal, 0)).toBe(priced.netAmount + priced.exemptAmount);
  });
});

describe('ciclo de vida del pedido', () => {
  const order = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
    status: 'OPEN', paymentStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED', deliveryMethod: 'SHIPPING', paymentProvider: 'WEBPAY', ...over,
  });

  it('un pedido pagado con despacho avanza preparar → despachar → entregar, solo hacia adelante', () => {
    expect(availableFulfillmentActions(order())).toEqual(['PREPARE', 'SHIP']);
    expect(availableFulfillmentActions(order({ fulfillmentStatus: 'PREPARING' }))).toEqual(['SHIP']);
    expect(availableFulfillmentActions(order({ fulfillmentStatus: 'SHIPPED' }))).toEqual(['DELIVER']);
    expect(availableFulfillmentActions(order({ fulfillmentStatus: 'DELIVERED' }))).toEqual([]);
    expect(canApplyFulfillment(order({ fulfillmentStatus: 'SHIPPED' }), 'PREPARE')).toMatchObject({ ok: false });
  });

  it('con retiro se ofrece «listo para retirar» y no despachar', () => {
    const retiro = order({ deliveryMethod: 'PICKUP' });
    expect(availableFulfillmentActions(retiro)).toEqual(['PREPARE', 'READY_FOR_PICKUP']);
    expect(canApplyFulfillment(retiro, 'SHIP')).toMatchObject({ ok: false });
    expect(canApplyFulfillment(order(), 'READY_FOR_PICKUP')).toMatchObject({ ok: false });
    expect(availableFulfillmentActions(order({ deliveryMethod: 'PICKUP', fulfillmentStatus: 'READY_FOR_PICKUP' }))).toEqual(['DELIVER']);
  });

  it('sin pago confirmado no se prepara ni se despacha', () => {
    const sinPago = order({ paymentStatus: 'PENDING', paymentProvider: 'TRANSFER' });
    expect(availableFulfillmentActions(sinPago)).toEqual([]);
    expect(canApplyFulfillment(sinPago, 'PREPARE')).toEqual({ ok: false, reason: 'Primero confirma el pago del pedido.' });
  });

  it('quien paga al retirar puede tener su pedido listo antes de cobrar, pero no entregarlo sin cobrar', () => {
    const alRetirar = order({ paymentStatus: 'PENDING', paymentProvider: 'PAY_ON_PICKUP', deliveryMethod: 'PICKUP' });
    expect(availableFulfillmentActions(alRetirar)).toEqual(['PREPARE', 'READY_FOR_PICKUP']);
    expect(canApplyFulfillment({ ...alRetirar, fulfillmentStatus: 'READY_FOR_PICKUP' }, 'DELIVER')).toMatchObject({ ok: false });
  });

  it('un pedido cerrado no avanza', () => {
    for (const status of ['CANCELLED', 'EXPIRED'] as const) expect(availableFulfillmentActions(order({ status }))).toEqual([]);
  });

  it('cancelar: pagado exige permiso de administración, entregado ya no se cancela', () => {
    expect(canCancel(order({ paymentStatus: 'PENDING' }))).toEqual({ ok: true, needsManage: false });
    expect(canCancel(order())).toEqual({ ok: true, needsManage: true });
    expect(canCancel(order({ fulfillmentStatus: 'DELIVERED' }))).toMatchObject({ ok: false });
    expect(canCancel(order({ status: 'CANCELLED' }))).toMatchObject({ ok: false });
  });

  it('el pago a mano solo se confirma en transferencia o al retirar, y una sola vez', () => {
    expect(canConfirmManualPayment(order({ paymentStatus: 'PENDING', paymentProvider: 'TRANSFER' }))).toEqual({ ok: true });
    expect(canConfirmManualPayment(order({ paymentStatus: 'PENDING', paymentProvider: 'PAY_ON_PICKUP' }))).toEqual({ ok: true });
    expect(canConfirmManualPayment(order({ paymentStatus: 'PENDING', paymentProvider: 'WEBPAY' }))).toMatchObject({ ok: false });
    expect(canConfirmManualPayment(order({ paymentProvider: 'TRANSFER' }))).toMatchObject({ ok: false });
    expect(canConfirmManualPayment(order({ status: 'EXPIRED', paymentStatus: 'PENDING', paymentProvider: 'TRANSFER' }))).toMatchObject({ ok: false });
  });

  it('la línea de tiempo del comprador marca el paso actual', () => {
    const steps = buildTimeline(order({ paymentStatus: 'PENDING', paymentProvider: 'KHIPU' }));
    expect(steps.map((s) => s.key)).toEqual(['received', 'paid', 'preparing', 'shipped', 'delivered']);
    expect(steps.find((s) => s.current)?.key).toBe('paid');
    const enCamino = buildTimeline(order({ fulfillmentStatus: 'SHIPPED' }));
    expect(enCamino.filter((s) => s.done).map((s) => s.key)).toEqual(['received', 'paid', 'preparing', 'shipped']);
    expect(enCamino.find((s) => s.current)?.key).toBe('delivered');
    const alRetirar = buildTimeline(order({ deliveryMethod: 'PICKUP', paymentProvider: 'PAY_ON_PICKUP', paymentStatus: 'PENDING' }));
    expect(alRetirar.map((s) => s.key)).toEqual(['received', 'preparing', 'ready', 'delivered']);
    expect(buildTimeline(order({ fulfillmentStatus: 'DELIVERED' })).every((s) => s.done && !s.current)).toBe(true);
  });
});

describe('medios de pago', () => {
  const setup = (over: Partial<StorePaymentSetup> = {}): StorePaymentSetup => ({
    enabled: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'], khipuConfigured: true, webpayConfigured: true, bankTransferInfo: 'Banco X, cuenta 123', pickupEnabled: true, ...over,
  });

  it('solo se ofrece lo que está encendido Y tiene lo necesario para funcionar', () => {
    expect(usableProviders(setup())).toEqual(['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP']);
    expect(usableProviders(setup({ khipuConfigured: false }))).not.toContain('KHIPU');
    expect(usableProviders(setup({ webpayConfigured: false }))).not.toContain('WEBPAY');
    expect(usableProviders(setup({ bankTransferInfo: '  ' }))).not.toContain('TRANSFER');
    expect(usableProviders(setup({ enabled: ['WEBPAY'] }))).toEqual(['WEBPAY']);
    expect(usableProviders(setup({ enabled: [] }))).toEqual([]);
  });

  it('pagar al retirar solo existe con retiro habilitado y no con despacho', () => {
    expect(usableProviders(setup({ pickupEnabled: false }))).not.toContain('PAY_ON_PICKUP');
    expect(usableProviders(setup(), 'SHIPPING')).not.toContain('PAY_ON_PICKUP');
    expect(usableProviders(setup(), 'PICKUP')).toContain('PAY_ON_PICKUP');
  });

  it('el stock se guarda una hora en línea y las horas configuradas en pagos manuales, con límites', () => {
    expect(holdMinutes('WEBPAY', 48)).toBe(ONLINE_HOLD_MINUTES);
    expect(holdMinutes('KHIPU', 1)).toBe(ONLINE_HOLD_MINUTES);
    expect(holdMinutes('TRANSFER', 24)).toBe(24 * 60);
    expect(holdMinutes('TRANSFER', 0)).toBe(DEFAULT_TRANSFER_HOLD_HOURS * 60);
    expect(holdMinutes('TRANSFER', 99999)).toBe(MAX_TRANSFER_HOLD_HOURS * 60);
    expect(holdMinutes('PAY_ON_PICKUP', 72)).toBe(72 * 60);
  });

  it('lee lo guardado: solo medios conocidos y sin repetir', () => {
    expect(parsePaymentMethods(['WEBPAY', 'BITCOIN', 'WEBPAY', 'KHIPU'])).toEqual(['KHIPU', 'WEBPAY']);
    expect(parsePaymentMethods('x')).toEqual([]);
  });
});

describe('dirección del producto', () => {
  it('sale del nombre, sin tildes ni símbolos, y no se repite dentro de la tienda', () => {
    expect(productSlug('Aceite Maravilla Chef 900 ml', [])).toBe('aceite-maravilla-chef-900-ml');
    expect(productSlug('Ñandú & Ají — 100%', [])).toBe('nandu-aji-100');
    expect(productSlug('Aceite', ['aceite'])).toBe('aceite-2');
    expect(productSlug('Aceite', ['aceite', 'aceite-2', 'aceite-3'])).toBe('aceite-4');
    expect(productSlug('!!!', [])).toBe('producto');
    expect(productSlug('x'.repeat(200), []).length).toBeLessThanOrEqual(60);
    expect(productSlug('y'.repeat(200), ['y'.repeat(60)]).length).toBeLessThanOrEqual(60);
  });

  it('las rutas de la tienda no pueden ser la dirección de una página del sitio', () => {
    for (const slug of ['tienda', 'carrito', 'finalizar-compra', 'producto', 'pedido']) expect(isValidPageSlug(slug)).toBe(false);
    expect(isValidPageSlug('nosotros')).toBe(true);
  });
});

describe('cuerpo del checkout', () => {
  const base = {
    idempotencyKey: 'ck_abcdefghijklmnop1234',
    lines: [{ productId: 'p1', quantity: 2 }],
    customer: { name: 'Ana Pérez', email: 'ANA@Correo.cl', phone: '+56 9 1234 5678', rut: '' },
    deliveryMethod: 'PICKUP' as const,
    paymentProvider: 'TRANSFER' as const,
    acceptTerms: true as const,
  };
  const address = { region: REGION_NAMES[6]!, comuna: 'Providencia', street: 'Los Aromos 123', extra: '' };

  it('un retiro simple es válido y normaliza el correo', () => {
    const parsed = checkoutSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customer.email).toBe('ana@correo.cl');
      expect(parsed.data.documentType).toBe('BOLETA');
    }
  });

  it('el despacho exige dirección y tarifa elegida', () => {
    const sin = checkoutSchema.safeParse({ ...base, deliveryMethod: 'SHIPPING' });
    expect(sin.success).toBe(false);
    if (!sin.success) expect(sin.error.issues.map((i) => i.path.join('.')).sort()).toEqual(['address', 'shippingRateId']);
    expect(checkoutSchema.safeParse({ ...base, deliveryMethod: 'SHIPPING', address, shippingRateId: 'r1' }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, deliveryMethod: 'SHIPPING', address: { ...address, region: 'Narnia' }, shippingRateId: 'r1' }).success).toBe(false);
  });

  it('la factura exige los datos de la empresa con RUT válido', () => {
    expect(checkoutSchema.safeParse({ ...base, documentType: 'FACTURA' }).success).toBe(false);
    const billing = { rut: '76.086.428-5', razonSocial: 'Mi Empresa SpA', giro: 'Comercio', address: 'Av. Siempre Viva 742', comuna: 'Temuco' };
    expect(checkoutSchema.safeParse({ ...base, documentType: 'FACTURA', billing }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, documentType: 'FACTURA', billing: { ...billing, rut: '11.111.111-2' } }).success).toBe(false);
  });

  it('el RUT del comprador, si lo da, debe ser válido y queda formateado', () => {
    const ok = checkoutSchema.safeParse({ ...base, customer: { ...base.customer, rut: '760864285' } });
    expect(ok.success && ok.data.customer.rut).toBe('76.086.428-5');
    expect(checkoutSchema.safeParse({ ...base, customer: { ...base.customer, rut: '12.345.678-0' } }).success).toBe(false);
  });

  it('rechaza carrito vacío, productos repetidos, cantidades imposibles y términos sin aceptar', () => {
    expect(checkoutSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, lines: [{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }] }).success).toBe(false);
    for (const quantity of [0, -1, 1.5, MAX_LINE_QUANTITY + 1]) expect(checkoutSchema.safeParse({ ...base, lines: [{ productId: 'p1', quantity }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, idempotencyKey: 'corta' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentProvider: 'BITCOIN' }).success).toBe(false);
  });

  it('el cuerpo no puede traer precios: los campos de más se descartan', () => {
    const parsed = checkoutSchema.safeParse({ ...base, total: 1, lines: [{ productId: 'p1', quantity: 1, price: 1 }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('total');
      expect(parsed.data.lines[0]).toEqual({ productId: 'p1', quantity: 1 });
    }
  });

  it('la cotización acepta un carrito vacío (el carrito recién abierto) y acota el tamaño', () => {
    expect(quoteSchema.safeParse({}).success).toBe(true);
    expect(quoteSchema.parse({}).lines).toEqual([]);
    expect(quoteSchema.safeParse({ lines: Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({ productId: `p${i}`, quantity: 1 })) }).success).toBe(false);
  });
});
