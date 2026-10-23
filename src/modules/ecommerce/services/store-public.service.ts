import 'server-only';

import type { CatalogSort } from '@/lib/ecommerce/store-route';

import { Prisma, StoreDeliveryMethod, StorePaymentProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MAX_LINE_QUANTITY, type CartLine } from '@/lib/ecommerce/cart';
import { purchasableQuantity, stockLabel, type StockLabel } from '@/lib/ecommerce/availability';
import { PAYMENT_PROVIDER_INFO, parsePaymentMethods, usableProviders } from '@/lib/ecommerce/payment';
import { priceOrder, type OrderPricing } from '@/lib/ecommerce/pricing';
import { etaLabel, parseShippingRates, ratesForRegion, shippingPrice, type StoreShippingRate } from '@/lib/ecommerce/shipping';
import { calculateGrossPrice } from '@/lib/chile/tax';
import { StoreError } from '../errors';
import { ownImageOrNull, parseStoreImages, type StoreImage } from './store-catalog.service';
import { getAvailability } from './store-stock.service';

/**
 * Lo que ve y hace quien compra, sin sesión. La empresa sale SIEMPRE del sitio (por su
 * dirección o su dominio propio): nunca de un dato que mande el navegador. Una tienda
 * solo existe para el público si el sitio está publicado, la empresa opera, tiene los
 * módulos y la tienda está abierta con bodega.
 */

export const STORE_PAGE_SIZE = 24;

export interface PublicStoreSettings {
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupInstructions: string;
  shippingEnabled: boolean;
  shippingRates: StoreShippingRate[];
  /** Medios de pago que de verdad funcionan (sin datos de la pasarela). */
  paymentProviders: StorePaymentProvider[];
  invoiceEnabled: boolean;
  termsText: string;
  returnsText: string;
  minOrderAmount: number;
  supportPhone: string;
  transferHoldHours: number;
}

export interface PublicStoreContext {
  companyId: string;
  companyName: string;
  siteId: string;
  siteSlug: string;
  siteName: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  warehouseId: string;
  settings: PublicStoreSettings;
}

const SITE_SELECT = {
  id: true,
  companyId: true,
  name: true,
  slug: true,
  status: true,
  customDomain: true,
  customDomainVerifiedAt: true,
  company: {
    select: {
      businessName: true,
      status: true,
      features: { select: { hasEcommerce: true } },
      settings: { select: { khipuApiCredential: true } },
    },
  },
  store: {
    select: {
      enabled: true,
      warehouseId: true,
      supportPhone: true,
      pickupEnabled: true,
      pickupAddress: true,
      pickupInstructions: true,
      shippingEnabled: true,
      shippingRates: true,
      paymentMethods: true,
      bankTransferInfo: true,
      transferHoldHours: true,
      webpayCommerceCode: true,
      webpayApiSecret: true,
      invoiceEnabled: true,
      termsText: true,
      returnsText: true,
      minOrderAmount: true,
    },
  },
} satisfies Prisma.WebSiteSelect;

type SiteRow = Prisma.WebSiteGetPayload<{ select: typeof SITE_SELECT }>;

/**
 * `tracking`: solo para seguimiento de pedidos ya hechos. Aunque la tienda esté cerrada (o sin
 * bodega) el comprador sigue viendo su pedido; el sitio, la empresa y el módulo sí deben estar activos.
 */
function toContext(site: SiteRow | null, options: { tracking?: boolean } = {}): PublicStoreContext | null {
  if (!site || site.status !== 'PUBLISHED') return null;
  const { company, store } = site;
  if (company.status !== 'ACTIVE' && company.status !== 'TRIAL') return null;
  if (!company.features?.hasEcommerce) return null;
  if (!store) return null;
  if (!options.tracking && (!store.enabled || !store.warehouseId)) return null;

  const paymentProviders = usableProviders({
    enabled: parsePaymentMethods(store.paymentMethods),
    khipuConfigured: Boolean(company.settings?.khipuApiCredential),
    webpayConfigured: Boolean(store.webpayCommerceCode?.trim() && store.webpayApiSecret),
    bankTransferInfo: store.bankTransferInfo,
    pickupEnabled: store.pickupEnabled,
  });

  return {
    companyId: site.companyId,
    companyName: company.businessName,
    siteId: site.id,
    siteSlug: site.slug,
    siteName: site.name,
    customDomain: site.customDomain,
    customDomainVerified: Boolean(site.customDomainVerifiedAt),
    warehouseId: store.warehouseId ?? '',
    settings: {
      pickupEnabled: store.pickupEnabled,
      pickupAddress: store.pickupAddress ?? '',
      pickupInstructions: store.pickupInstructions ?? '',
      shippingEnabled: store.shippingEnabled,
      shippingRates: parseShippingRates(store.shippingRates),
      paymentProviders,
      invoiceEnabled: store.invoiceEnabled,
      termsText: store.termsText ?? '',
      returnsText: store.returnsText ?? '',
      minOrderAmount: store.minOrderAmount,
      supportPhone: store.supportPhone ?? '',
      transferHoldHours: store.transferHoldHours,
    },
  };
}

/** Tienda abierta del sitio con esa dirección (`/web/[slug]`); `null` si no existe o no está a la venta. */
export async function resolvePublicStore(slug: string): Promise<PublicStoreContext | null> {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return null;
  return toContext(await prisma.webSite.findUnique({ where: { slug }, select: SITE_SELECT }));
}

/** Como `resolvePublicStore`, pero también con la tienda cerrada: solo para que el comprador siga viendo su pedido. */
export async function resolveStoreForOrders(slug: string): Promise<PublicStoreContext | null> {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return null;
  return toContext(await prisma.webSite.findUnique({ where: { slug }, select: SITE_SELECT }), { tracking: true });
}

/** Como `resolvePublicStoreByDomain`, pero también con la tienda cerrada (seguimiento de pedidos). */
export async function resolveStoreForOrdersByDomain(domain: string): Promise<PublicStoreContext | null> {
  const site = await prisma.webSite.findUnique({ where: { customDomain: domain }, select: SITE_SELECT });
  if (!site?.customDomainVerifiedAt) return null;
  return toContext(site, { tracking: true });
}

/** Tienda abierta del sitio con ese dominio propio (ya verificado). */
export async function resolvePublicStoreByDomain(domain: string): Promise<PublicStoreContext | null> {
  const site = await prisma.webSite.findUnique({ where: { customDomain: domain }, select: SITE_SELECT });
  if (!site?.customDomainVerifiedAt) return null;
  return toContext(site);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export interface PublicProductCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  imageAlt: string;
  grossPrice: number;
  compareAtPrice: number | null;
  collection: string | null;
  featured: boolean;
  stock: StockLabel;
  /** Unidades que se pueden pedir hoy; `null` = sin control de stock. */
  available: number | null;
  maxPerOrder: number | null;
}

export interface PublicProductDetail extends PublicProductCard {
  description: string;
  images: StoreImage[];
  sku: string;
  brand: string | null;
  unit: string;
}

type ListingWithProduct = Prisma.StoreProductGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        sku: true;
        name: true;
        brand: true;
        unit: true;
        description: true;
        imageUrl: true;
        netPrice: true;
        isExempt: true;
        isTrackable: true;
      };
    };
  };
}>;

const LISTING_INCLUDE = {
  product: {
    select: { id: true, sku: true, name: true, brand: true, unit: true, description: true, imageUrl: true, netPrice: true, isExempt: true, isTrackable: true },
  },
} satisfies Prisma.StoreProductInclude;

function cardOf(ctx: PublicStoreContext, listing: ListingWithProduct, available: number | null): PublicProductCard {
  const images = parseStoreImages(listing.images, ctx.companyId);
  const fallback = ownImageOrNull(ctx.companyId, listing.product.imageUrl);
  const title = listing.title?.trim() || listing.product.name;
  const grossPrice = calculateGrossPrice(listing.product.netPrice, listing.product.isExempt);
  return {
    id: listing.productId,
    slug: listing.slug,
    title,
    summary: listing.summary ?? '',
    imageUrl: images[0]?.url ?? fallback,
    imageAlt: images[0]?.alt || title,
    grossPrice,
    compareAtPrice: listing.compareAtPrice && listing.compareAtPrice > grossPrice ? listing.compareAtPrice : null,
    collection: listing.collection,
    featured: listing.featured,
    stock: stockLabel(available),
    // Al público no se le cuenta el stock exacto: solo hasta lo que cabe en un pedido.
    available: available === null ? null : Math.min(available, MAX_LINE_QUANTITY),
    maxPerOrder: listing.maxPerOrder,
  };
}

const PUBLISHED_WHERE = (ctx: PublicStoreContext): Prisma.StoreProductWhereInput => ({
  companyId: ctx.companyId,
  siteId: ctx.siteId,
  published: true,
  product: { isActive: true, companyId: ctx.companyId },
});

export interface PublicCatalogPage {
  products: PublicProductCard[];
  collections: Array<{ name: string; count: number }>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listPublicProducts(
  ctx: PublicStoreContext,
  query: { collection?: string; q?: string; page?: number; featuredOnly?: boolean; limit?: number; sort?: CatalogSort },
): Promise<PublicCatalogPage> {
  const search = query.q?.trim().slice(0, 80);
  const escapedSearch = search?.replace(/[\\%_]/g, '\\$&');
  const page = Math.max(1, Math.min(500, Math.floor(query.page ?? 1)));
  const pageSize = Math.max(1, Math.min(STORE_PAGE_SIZE, query.limit ?? STORE_PAGE_SIZE));
  const base = PUBLISHED_WHERE(ctx);
  const where: Prisma.StoreProductWhereInput = {
    ...base,
    ...(query.collection ? { collection: query.collection } : {}),
    ...(query.featuredOnly ? { featured: true } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: escapedSearch, mode: 'insensitive' } },
            { product: { name: { contains: escapedSearch, mode: 'insensitive' } } },
            { product: { brand: { contains: escapedSearch, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  // Sort by what the buyer actually sees: the ERP final price or the storefront title.
  const sortByValue = query.sort === 'price-asc' || query.sort === 'price-desc' || query.sort === 'name';
  const searchPattern = search ? `%${escapedSearch}%` : null;
  const order =
    query.sort === 'name'
      ? Prisma.sql`LOWER(COALESCE(NULLIF(BTRIM(s.title), ''), p.name)) ASC`
      : Prisma.sql`ROUND((CASE WHEN p."isExempt" THEN p."netPrice" ELSE p."netPrice" * 1.19 END)::numeric) ${query.sort === 'price-asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;
  const sortedIds = sortByValue
    ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM "StoreProduct" s JOIN "Product" p ON p.id = s."productId" AND p."companyId" = s."companyId"
    WHERE s."companyId" = ${ctx.companyId} AND s."siteId" = ${ctx.siteId} AND s.published = true AND p."isActive" = true
    ${query.collection ? Prisma.sql`AND s.collection = ${query.collection}` : Prisma.empty}
    ${query.featuredOnly ? Prisma.sql`AND s.featured = true` : Prisma.empty}
    ${search ? Prisma.sql`AND (s.title ILIKE ${searchPattern} OR p.name ILIKE ${searchPattern} OR p.brand ILIKE ${searchPattern})` : Prisma.empty}
    ORDER BY ${order}, s.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `)
    : null;
  const [total, listings, grouped] = await Promise.all([
    prisma.storeProduct.count({ where }),
    prisma.storeProduct.findMany({
      where: sortedIds ? { ...where, id: { in: sortedIds.map((row) => row.id) } } : where,
      include: LISTING_INCLUDE,
      orderBy: query.sort === 'newest' ? [{ createdAt: 'desc' }, { id: 'asc' }] : [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: sortedIds ? 0 : (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.storeProduct.groupBy({ by: ['collection'], where: { ...base, collection: { not: null } }, _count: { _all: true } }),
  ]);
  if (sortedIds) {
    const rank = new Map(sortedIds.map((row, i) => [row.id, i]));
    listings.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }
  const availability = await getAvailability(
    ctx.companyId,
    ctx.warehouseId,
    listings.map((listing) => listing.productId),
  );

  return {
    total,
    page,
    pageSize,
    products: listings.map((listing) => cardOf(ctx, listing, availability.get(listing.productId)?.available ?? (listing.product.isTrackable ? 0 : null))),
    collections: grouped
      .filter((row): row is typeof row & { collection: string } => Boolean(row.collection))
      .map((row) => ({ name: row.collection, count: row._count._all }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

export async function getPublicProduct(ctx: PublicStoreContext, slug: string): Promise<PublicProductDetail | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const listing = await prisma.storeProduct.findFirst({ where: { ...PUBLISHED_WHERE(ctx), slug }, include: LISTING_INCLUDE });
  if (!listing) return null;
  const availability = await getAvailability(ctx.companyId, ctx.warehouseId, [listing.productId]);
  const available = availability.get(listing.productId)?.available ?? (listing.product.isTrackable ? 0 : null);
  const images = parseStoreImages(listing.images, ctx.companyId);
  const card = cardOf(ctx, listing, available);
  return {
    ...card,
    description: listing.description?.trim() || listing.product.description || '',
    images: images.length > 0 ? images : card.imageUrl ? [{ url: card.imageUrl, alt: card.title }] : [],
    sku: listing.product.sku,
    brand: listing.product.brand,
    unit: listing.product.unit,
  };
}

// ---------------------------------------------------------------------------
// Cotización del carrito
// ---------------------------------------------------------------------------

export type QuoteProblem = 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'REDUCED';

export interface QuoteLine {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  grossUnit: number;
  /** Lo que se puede pedir de verdad (puede ser menos que lo que había en el carrito). */
  quantity: number;
  requestedQuantity: number;
  available: number | null;
  maxPerOrder: number | null;
  displayTotal: number;
  problem: QuoteProblem | null;
}

export interface QuoteShippingOption {
  id: string;
  name: string;
  price: number;
  eta: string | null;
  note: string;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  /** Productos del carrito que ya no se pueden comprar y hay que sacar. */
  removedProductIds: string[];
  shippingOptions: QuoteShippingOption[];
  /** La tienda despacha a domicilio (tiene tarifas). */
  shippingEnabled: boolean;
  /** Regiones a las que llega algún despacho; `null` = todo Chile. */
  shippingRegions: string[] | null;
  pickup: { address: string; instructions: string } | null;
  minOrderAmount: number;
  belowMinimum: boolean;
  /** Medios de pago con su texto, ya filtrados por lo que funciona. */
  paymentProviders: Array<{ id: StorePaymentProvider; label: string; description: string; requiresPickup: boolean }>;
  invoiceEnabled: boolean;
  /** Totales con el despacho elegido (si se pidió uno válido); si no, solo los productos. */
  pricing: OrderPricing | null;
  ready: boolean;
}

export interface QuoteRequest {
  lines: CartLine[];
  region?: string;
  deliveryMethod?: StoreDeliveryMethod;
  shippingRateId?: string;
}

/**
 * Valoriza el carrito con los datos REALES de la tienda. Nunca falla por stock: ajusta
 * cantidades y marca el problema de cada línea para que el comprador lo vea antes de pagar.
 */
export async function quoteCart(ctx: PublicStoreContext, request: QuoteRequest): Promise<Quote> {
  const ids = [...new Set(request.lines.map((line) => line.productId))];
  const listings =
    ids.length === 0 ? [] : await prisma.storeProduct.findMany({ where: { ...PUBLISHED_WHERE(ctx), productId: { in: ids } }, include: LISTING_INCLUDE });
  const byProduct = new Map(listings.map((listing) => [listing.productId, listing]));
  const availability = await getAvailability(
    ctx.companyId,
    ctx.warehouseId,
    listings.map((listing) => listing.productId),
  );

  const lines: QuoteLine[] = [];
  const removed: string[] = [];
  const seen = new Set<string>();
  for (const requested of request.lines) {
    if (seen.has(requested.productId)) continue;
    seen.add(requested.productId);
    const listing = byProduct.get(requested.productId);
    if (!listing) {
      removed.push(requested.productId);
      continue;
    }
    const available = availability.get(listing.productId)?.available ?? (listing.product.isTrackable ? 0 : null);
    const quantity = purchasableQuantity(Math.min(requested.quantity, MAX_LINE_QUANTITY), available, listing.maxPerOrder);
    const card = cardOf(ctx, listing, available);
    lines.push({
      productId: listing.productId,
      slug: listing.slug,
      name: card.title,
      imageUrl: card.imageUrl,
      grossUnit: card.grossPrice,
      quantity,
      requestedQuantity: requested.quantity,
      available: card.available,
      maxPerOrder: listing.maxPerOrder,
      displayTotal: card.grossPrice * quantity,
      problem: quantity === 0 ? 'OUT_OF_STOCK' : quantity < requested.quantity ? 'REDUCED' : null,
    });
  }

  const buyable = lines.filter((line) => line.quantity > 0);
  const subtotal = buyable.reduce((sum, line) => sum + line.displayTotal, 0);

  // Despacho: tarifas de la región elegida, con el precio ya rebajado si el pedido llega al monto de envío gratis.
  const shippingOptions: QuoteShippingOption[] =
    ctx.settings.shippingEnabled && request.region
      ? ratesForRegion(ctx.settings.shippingRates, request.region).map((rate) => ({
          id: rate.id,
          name: rate.name,
          price: shippingPrice(rate, subtotal),
          eta: etaLabel(rate),
          note: rate.note,
        }))
      : [];

  let pricing: OrderPricing | null = null;
  if (buyable.length > 0) {
    let shippingGross = 0;
    if (request.deliveryMethod === 'SHIPPING') {
      const chosen = shippingOptions.find((option) => option.id === request.shippingRateId);
      shippingGross = chosen?.price ?? 0;
    }
    pricing = priceOrder(
      buyable.map((line) => {
        const listing = byProduct.get(line.productId)!;
        return {
          productId: line.productId,
          sku: listing.product.sku,
          name: line.name,
          imageUrl: line.imageUrl,
          unit: listing.product.unit,
          isExempt: listing.product.isExempt,
          netUnit: listing.product.netPrice,
          quantity: line.quantity,
        };
      }),
      shippingGross,
    );
  }

  const belowMinimum = ctx.settings.minOrderAmount > 0 && subtotal < ctx.settings.minOrderAmount;
  return {
    lines,
    subtotal,
    removedProductIds: removed,
    shippingOptions,
    shippingEnabled: ctx.settings.shippingEnabled && ctx.settings.shippingRates.length > 0,
    shippingRegions: shippingRegionsOf(ctx),
    pickup: ctx.settings.pickupEnabled ? { address: ctx.settings.pickupAddress, instructions: ctx.settings.pickupInstructions } : null,
    minOrderAmount: ctx.settings.minOrderAmount,
    belowMinimum,
    paymentProviders: ctx.settings.paymentProviders.map((id) => ({
      id,
      label: PAYMENT_PROVIDER_INFO[id].label,
      description: PAYMENT_PROVIDER_INFO[id].description,
      requiresPickup: id === 'PAY_ON_PICKUP',
    })),
    invoiceEnabled: ctx.settings.invoiceEnabled,
    pricing,
    ready: buyable.length > 0 && lines.every((line) => line.problem !== 'OUT_OF_STOCK') && !belowMinimum,
  };
}

/** Regiones donde algún despacho aplica; `null` si alguna tarifa llega a todo Chile (o no hay despacho que listar). */
function shippingRegionsOf(ctx: PublicStoreContext): string[] | null {
  if (!ctx.settings.shippingEnabled || ctx.settings.shippingRates.length === 0) return [];
  if (ctx.settings.shippingRates.some((rate) => rate.regions.length === 0)) return null;
  return [...new Set(ctx.settings.shippingRates.flatMap((rate) => rate.regions))];
}

export function assertCartNotEmpty(lines: readonly CartLine[]): void {
  if (lines.length === 0) throw new StoreError('Tu carrito está vacío.');
}

/** Pedidos que esta tienda recibió en los últimos `minutes`: tope por sitio, contado en la base (el límite en memoria no se comparte entre instancias). */
export async function countRecentOrders(companyId: string, siteId: string, minutes: number): Promise<number> {
  return prisma.storeOrder.count({ where: { companyId, siteId, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
}

/** Direcciones de la tienda para el mapa del sitio (relativas a la raíz): el catálogo y cada ficha publicada. */
export async function listStoreSitemapPaths(ctx: PublicStoreContext, limit = 2000): Promise<Array<{ path: string; lastModified: Date }>> {
  const listings = await prisma.storeProduct.findMany({
    where: PUBLISHED_WHERE(ctx),
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return [
    { path: 'tienda', lastModified: listings[0]?.updatedAt ?? new Date() },
    ...listings.map((listing) => ({ path: `producto/${listing.slug}`, lastModified: listing.updatedAt })),
  ];
}
