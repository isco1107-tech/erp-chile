import { encryptPaymentCredential } from '../src/lib/payments/crypto';
import { db, owner } from './db';

/**
 * Tienda de demostración para los recorridos de la tienda en línea: arma, sobre la empresa de pruebas, un sitio
 * publicado con su tienda abierta (retiro, despacho, los cuatro medios de pago) y un catálogo con casos
 * incómodos (precio tachado, últimas unidades, agotado, servicio sin stock, nombre larguísimo).
 *
 * Idempotente: se puede correr antes de cada corrida contra la misma base. Las fotos son direcciones válidas de
 * nuestro almacenamiento que NO existen (no hay almacenamiento real en las pruebas): cada prueba las intercepta
 * con `page.route` y las sirve ella misma (`fakeProductImages`).
 */
export const STORE_SLUG = 'tienda-e2e';
export const STORE_NAME = 'Almacén Los Aromos';
export const REGION_RM = 'Región Metropolitana de Santiago';
export const REGION_ARAUCANIA = 'Región de La Araucanía';

export interface DemoProduct {
  sku: string;
  slug: string;
  name: string;
  /** Precio con IVA que ve el comprador (el neto se deriva). */
  gross: number;
  stock: number;
  collection: string | null;
  extra?: { compareAtPrice?: number; maxPerOrder?: number; trackable?: boolean; featured?: boolean; summary?: string; description?: string; photos?: number };
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { sku: 'E2E-ACE-900', slug: 'aceite-maravilla', name: 'Aceite de maravilla 900 ml', gross: 3990, stock: 120, collection: 'Despensa', extra: { featured: true, compareAtPrice: 4990, summary: 'Prensado en frío, ideal para cocinar y aliñar.', description: 'Aceite de maravilla de primera prensada.\n\nBotella de 900 ml. Guárdalo en un lugar fresco y seco.', photos: 3 } },
  { sku: 'E2E-HAR-1KG', slug: 'harina-selecta', name: 'Harina selecta 1 kg', gross: 1190, stock: 40, collection: 'Despensa', extra: { maxPerOrder: 6 } },
  { sku: 'E2E-MIE-500', slug: 'miel-de-ulmo', name: 'Miel de ulmo 500 g', gross: 7490, stock: 3, collection: 'Despensa', extra: { summary: 'Cosecha de la temporada, directo del apicultor.' } },
  { sku: 'E2E-TE-20', slug: 'te-boldo-20', name: 'Té de boldo, caja con 20 bolsitas', gross: 1790, stock: 0, collection: 'Infusiones' },
  { sku: 'E2E-MER-CA', slug: 'merken-ahumado', name: 'Merkén ahumado con cilantro en frasco de vidrio reutilizable de 250 gramos', gross: 4290, stock: 15, collection: 'Infusiones' },
  { sku: 'E2E-SRV-ENV', slug: 'servicio-de-envoltorio', name: 'Servicio de envoltorio para regalo', gross: 2500, stock: 0, collection: 'Servicios', extra: { trackable: false } },
];

/** El neto que, con IVA 19 %, da exactamente `gross` (los precios de prueba se eligen para que calcen). */
function netFor(gross: number): number {
  return Math.round(gross / 1.19);
}

export interface StoreDemo {
  companyId: string;
  siteId: string;
  slug: string;
  warehouseId: string;
  productIds: Record<string, string>;
}

/** Prepara la tienda de pruebas y deja el stock en sus valores iniciales. */
export async function ensureStoreDemo(): Promise<StoreDemo> {
  const { companyId } = await owner();
  const prisma = db();

  await prisma.companyFeatures.upsert({
    where: { companyId },
    update: { hasWebSites: true, hasEcommerce: true, hasInventory: true },
    create: { companyId, hasWebSites: true, hasEcommerce: true, hasInventory: true },
  });
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { khipuApiCredential: encryptPaymentCredential('llave-khipu-e2e') },
    create: { companyId, khipuApiCredential: encryptPaymentCredential('llave-khipu-e2e') },
  });
  await prisma.company.update({ where: { id: companyId }, data: { status: 'ACTIVE' } });

  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } });

  const siteData = { name: STORE_NAME, status: 'PUBLISHED' as const, mode: 'GUIDED' as const, publishedAt: new Date(), publishedBlocks: [], draftBlocks: [] };
  const site = await prisma.webSite.upsert({ where: { slug: STORE_SLUG }, update: { ...siteData, companyId }, create: { ...siteData, companyId, slug: STORE_SLUG } });

  const storeData = {
    enabled: true,
    warehouseId: warehouse.id,
    notifyEmail: 'ventas@aromos.test',
    supportPhone: '+56 9 8765 4321',
    pickupEnabled: true,
    pickupAddress: 'Av. Alemania 0123, Temuco',
    pickupInstructions: 'Lunes a viernes de 9:00 a 18:00',
    shippingEnabled: true,
    shippingRates: [
      { id: 'stgo', name: 'Despacho Santiago', regions: [REGION_RM], price: 3990, freeOver: 40000, minDays: 1, maxDays: 2, note: 'Llega a tu domicilio' },
      { id: 'pais', name: 'Despacho a todo Chile', regions: [], price: 5990, freeOver: null, minDays: 3, maxDays: 6, note: '' },
    ],
    paymentMethods: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'],
    bankTransferInfo: 'Banco Estado\nCuenta vista 12345678\nRUT 76.123.456-7\nAlmacén Los Aromos SpA',
    transferHoldHours: 48,
    webpayCommerceCode: '597055555532',
    webpayApiSecret: encryptPaymentCredential('secreto-webpay-e2e'),
    webpayProduction: false,
    invoiceEnabled: true,
    termsText: 'Los despachos se realizan de lunes a viernes. Los productos perecibles no tienen cambio.',
    returnsText: 'Tienes 10 días para cambiar un producto sellado. Escríbenos por WhatsApp.',
    minOrderAmount: 0,
  };
  await prisma.webSiteStore.upsert({ where: { siteId: site.id }, update: storeData, create: { ...storeData, companyId, siteId: site.id } });

  const productIds: Record<string, string> = {};
  for (const demo of DEMO_PRODUCTS) {
    const net = demo.extra?.trackable === false ? netFor(demo.gross) : netFor(demo.gross);
    const existing = await prisma.product.findFirst({ where: { companyId, sku: demo.sku }, select: { id: true } });
    const productData = { name: demo.name, netPrice: net, grossPrice: demo.gross, isActive: true, isTrackable: demo.extra?.trackable !== false, isExempt: false };
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: productData })
      : await prisma.product.create({ data: { companyId, sku: demo.sku, costPricePMP: Math.round(net * 0.6), ...productData } });
    productIds[demo.slug] = product.id;

    await prisma.stock.upsert({
      where: { companyId_productId_warehouseId: { companyId, productId: product.id, warehouseId: warehouse.id } },
      update: { quantity: demo.stock },
      create: { companyId, productId: product.id, warehouseId: warehouse.id, quantity: demo.stock },
    });
    const photos = Array.from({ length: demo.extra?.photos ?? 1 }, (_, index) => ({ url: demoImageUrl(companyId, `${demo.slug}-${index + 1}`), alt: `${demo.name}, foto ${index + 1}` }));
    const listing = {
      published: true,
      collection: demo.collection,
      featured: demo.extra?.featured ?? false,
      compareAtPrice: demo.extra?.compareAtPrice ?? null,
      maxPerOrder: demo.extra?.maxPerOrder ?? null,
      summary: demo.extra?.summary ?? null,
      description: demo.extra?.description ?? null,
      images: photos,
    };
    await prisma.storeProduct.upsert({
      where: { siteId_productId: { siteId: site.id, productId: product.id } },
      update: listing,
      create: { ...listing, companyId, siteId: site.id, productId: product.id, slug: demo.slug },
    });
  }
  return { companyId, siteId: site.id, slug: STORE_SLUG, warehouseId: warehouse.id, productIds };
}

/** Dirección «de nuestro almacenamiento» (pasa `ownImageOrNull`) que no existe de verdad. */
export function demoImageUrl(companyId: string, name: string): string {
  return `https://e2e.public.blob.vercel-storage.com/products/${companyId}/${name}.svg`;
}

/** Colores distintos por producto para que las miniaturas se distingan en las capturas. */
const PALETTE = ['#c2410c', '#0f766e', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f'];

/** Sirve cada foto de demostración como un SVG de color (lo usan las pruebas con `page.route`). */
export async function fakeProductImages(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/*.public.blob.vercel-storage.com/**', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? 'x');
    const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const color = PALETTE[hash % PALETTE.length]!;
    const label = name.replace(/\.svg$/, '').slice(0, 18);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${color}"/><circle cx="200" cy="170" r="90" fill="#ffffff22"/><text x="200" y="330" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${label}</text></svg>`;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
}

/** Deja la tienda sin pedidos previos de pruebas (por si una corrida anterior dejó apartado el stock). */
export async function resetStoreOrders(): Promise<void> {
  const { companyId } = await owner();
  const prisma = db();
  await prisma.storeStockReservation.deleteMany({ where: { companyId } });
  await prisma.storeOrderEvent.deleteMany({ where: { companyId } });
  await prisma.storeOrderItem.deleteMany({ where: { companyId } });
  await prisma.storeOrder.updateMany({ where: { companyId }, data: { salesDocumentId: null } });
  await prisma.storeOrder.deleteMany({ where: { companyId } });
}

/** Las pasarelas simuladas están conectadas a la app (se levantó con las variables de e2e/README.md). */
export const GATEWAYS_CONFIGURED = Boolean(process.env.KHIPU_API_BASE_URL?.includes('localhost') && process.env.WEBPAY_API_BASE_URL?.includes('localhost'));
export const GATEWAYS_HINT = 'Levanta la app con KHIPU_API_BASE_URL y WEBPAY_API_BASE_URL apuntando a localhost:4010 y APP_URL con su dirección (ver e2e/README.md).';

export interface CheckoutData {
  name?: string;
  email?: string;
  phone?: string;
  delivery: 'pickup' | 'shipping';
  payment: RegExp;
  /** Despacho: región, comuna y calle. */
  address?: { region: string; comuna: string; street: string };
}

/** Llena «Finalizar compra» como lo haría una persona y devuelve el botón de enviar (sin pulsarlo). */
export async function fillCheckout(page: import('@playwright/test').Page, data: CheckoutData): Promise<import('@playwright/test').Locator> {
  await page.getByLabel('Nombre completo').fill(data.name ?? 'Camila Rojas');
  await page.getByLabel('Correo', { exact: false }).first().fill(data.email ?? 'camila@correo.cl');
  await page.getByLabel('Teléfono').fill(data.phone ?? '+56 9 1234 5678');
  if (data.delivery === 'pickup') {
    await page.getByRole('radio', { name: /Retiro en tienda/ }).check();
  } else {
    await page.getByRole('radio', { name: /Despacho a domicilio/ }).check();
    await page.getByLabel('Región').selectOption(data.address?.region ?? REGION_RM);
    await page.getByLabel('Comuna').fill(data.address?.comuna ?? 'Ñuñoa');
    await page.getByLabel('Calle y número').fill(data.address?.street ?? 'Av. Irarrázaval 2401');
  }
  await page.getByRole('radio', { name: data.payment }).check();
  await page.getByRole('checkbox', { name: /Acepto las condiciones/ }).check();
  return page.getByRole('button', { name: /^(Pagar \$|Confirmar pedido)/ });
}

/** Carrito del navegador (una clave por tienda): arma uno sin pasar por el catálogo. */
export async function seedCart(page: import('@playwright/test').Page, lines: Array<{ productId: string; quantity: number }>): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
      } catch {
        /* sin storage */
      }
    },
    { key: `aether-cart:${STORE_SLUG}`, value: JSON.stringify(lines) }
  );
}

/** Pedido de la tienda con ese enlace secreto, leído directo de la base. */
export async function orderByToken(token: string) {
  return db().storeOrder.findUniqueOrThrow({ where: { accessToken: token }, include: { items: true, salesDocument: true } });
}

/** Unidades en la bodega de la tienda de un producto de la demo. */
export async function onHandOf(slug: string): Promise<number> {
  const { companyId } = await owner();
  const demo = await db().storeProduct.findFirstOrThrow({ where: { companyId, slug }, select: { productId: true, siteId: true } });
  const store = await db().webSiteStore.findFirstOrThrow({ where: { siteId: demo.siteId }, select: { warehouseId: true } });
  const stock = await db().stock.findFirst({ where: { companyId, productId: demo.productId, warehouseId: store.warehouseId! }, select: { quantity: true } });
  return stock?.quantity ?? 0;
}
