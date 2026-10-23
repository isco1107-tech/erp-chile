import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { blobPathnameStartsWith, isAllowedBlobUrl } from '@/lib/security/blob-url';
import { productSlug } from '@/lib/ecommerce/slug';
import { StoreError, StoreNotFoundError } from '../errors';
import type { CatalogListQuery, StoreProductInput } from '../schema';
import { getStoreSettings } from './store-settings.service';
import { getAvailability } from './store-stock.service';

/**
 * Qué productos del inventario se venden en la tienda de un sitio y cómo se presentan.
 * El precio y el stock NO se guardan acá: salen siempre del catálogo y del kardex.
 */

export const CATALOG_PAGE_SIZE = 30;

export interface StoreImage {
  url: string;
  alt: string;
}

export interface StoreCatalogRow {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  imageUrl: string | null;
  grossPrice: number;
  isExempt: boolean;
  /** Unidades vendibles hoy en la bodega de la tienda; `null` = sin control de stock. */
  available: number | null;
  published: boolean;
  slug: string | null;
  title: string | null;
  collection: string | null;
  featured: boolean;
}

export interface StoreCatalogPage {
  rows: StoreCatalogRow[];
  total: number;
  page: number;
  pageSize: number;
  publishedCount: number;
}

/** Solo imágenes de nuestro almacenamiento y de ESTA empresa: la biblioteca del sitio y las fotos de producto. */
export function assertOwnImages(companyId: string, urls: string[]): void {
  const prefixes = [`web-sites/${companyId}/`, `products/${companyId}/`, `branding/${companyId}/`];
  for (const url of urls) {
    if (!url) continue;
    if (!isAllowedBlobUrl(url) || !prefixes.some((prefix) => blobPathnameStartsWith(url, prefix))) {
      throw new StoreError('Una foto no viene de la biblioteca de tu sitio. Súbela en «Imágenes» del sitio y elígela desde ahí.', 400, 'images');
    }
  }
}

/** Foto que se puede mostrar: de nuestro almacenamiento y de la empresa; si no, se omite. */
export function ownImageOrNull(companyId: string, url: string | null | undefined): string | null {
  if (!url) return null;
  const prefixes = [`web-sites/${companyId}/`, `products/${companyId}/`, `branding/${companyId}/`];
  return isAllowedBlobUrl(url) && prefixes.some((prefix) => blobPathnameStartsWith(url, prefix)) ? url : null;
}

export function parseStoreImages(raw: unknown, companyId: string): StoreImage[] {
  if (!Array.isArray(raw)) return [];
  const images: StoreImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { url, alt } = item as Record<string, unknown>;
    const safe = typeof url === 'string' ? ownImageOrNull(companyId, url) : null;
    if (safe) images.push({ url: safe, alt: typeof alt === 'string' ? alt.slice(0, 160) : '' });
    if (images.length >= 8) break;
  }
  return images;
}

async function assertSite(companyId: string, siteId: string): Promise<void> {
  const site = await prisma.webSite.findFirst({ where: { id: siteId, companyId }, select: { id: true } });
  if (!site) throw new StoreNotFoundError('Sitio no encontrado');
}

export async function listStoreCatalog(companyId: string, siteId: string, query: CatalogListQuery): Promise<StoreCatalogPage> {
  await assertSite(companyId, siteId);
  const settings = await getStoreSettings(companyId, siteId);
  const search = query.q?.trim();

  const where: Prisma.ProductWhereInput = {
    companyId,
    isActive: true,
    ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }, { brand: { contains: search, mode: 'insensitive' } }] } : {}),
    ...(query.filter === 'published' ? { storeListings: { some: { siteId, published: true } } } : {}),
    ...(query.filter === 'unpublished' ? { storeListings: { none: { siteId, published: true } } } : {}),
  };

  const [total, products, publishedCount] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
      select: {
        id: true, sku: true, name: true, brand: true, unit: true, imageUrl: true, grossPrice: true, isExempt: true,
        storeListings: { where: { siteId }, select: { published: true, slug: true, title: true, collection: true, featured: true } },
      },
    }),
    prisma.storeProduct.count({ where: { companyId, siteId, published: true, product: { isActive: true } } }),
  ]);

  const availability = settings.warehouseId ? await getAvailability(companyId, settings.warehouseId, products.map((product) => product.id)) : new Map();

  return {
    total,
    page: query.page,
    pageSize: CATALOG_PAGE_SIZE,
    publishedCount,
    rows: products.map((product) => {
      const listing = product.storeListings[0] ?? null;
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        imageUrl: ownImageOrNull(companyId, product.imageUrl),
        grossPrice: product.grossPrice,
        isExempt: product.isExempt,
        available: availability.has(product.id) ? (availability.get(product.id)?.available ?? null) : settings.warehouseId ? 0 : null,
        published: listing?.published ?? false,
        slug: listing?.slug ?? null,
        title: listing?.title ?? null,
        collection: listing?.collection ?? null,
        featured: listing?.featured ?? false,
      };
    }),
  };
}

export interface StoreProductDetail {
  productId: string;
  sku: string;
  name: string;
  erpDescription: string;
  erpImageUrl: string | null;
  grossPrice: number;
  published: boolean;
  slug: string;
  title: string;
  summary: string;
  description: string;
  images: StoreImage[];
  compareAtPrice: number | null;
  collection: string;
  featured: boolean;
  sortOrder: number;
  maxPerOrder: number | null;
  /** Colecciones ya usadas en la tienda, para sugerirlas. */
  collections: string[];
}

export async function getStoreProduct(companyId: string, siteId: string, productId: string): Promise<StoreProductDetail> {
  await assertSite(companyId, siteId);
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: {
      id: true, sku: true, name: true, description: true, imageUrl: true, grossPrice: true,
      storeListings: { where: { siteId } },
    },
  });
  if (!product) throw new StoreNotFoundError('Producto no encontrado');
  const listing = product.storeListings[0] ?? null;
  const collections = await prisma.storeProduct.findMany({ where: { companyId, siteId, collection: { not: null } }, distinct: ['collection'], select: { collection: true }, take: 50 });
  const taken = await usedSlugs(companyId, siteId, listing?.id);
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    erpDescription: product.description ?? '',
    erpImageUrl: ownImageOrNull(companyId, product.imageUrl),
    grossPrice: product.grossPrice,
    published: listing?.published ?? false,
    slug: listing?.slug ?? productSlug(product.name, taken),
    title: listing?.title ?? '',
    summary: listing?.summary ?? '',
    description: listing?.description ?? '',
    images: listing ? parseStoreImages(listing.images, companyId) : [],
    compareAtPrice: listing?.compareAtPrice ?? null,
    collection: listing?.collection ?? '',
    featured: listing?.featured ?? false,
    sortOrder: listing?.sortOrder ?? 0,
    maxPerOrder: listing?.maxPerOrder ?? null,
    collections: collections.map((row) => row.collection!).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
  };
}

async function usedSlugs(companyId: string, siteId: string, exceptListingId?: string | null): Promise<Set<string>> {
  const rows = await prisma.storeProduct.findMany({ where: { companyId, siteId, ...(exceptListingId ? { NOT: { id: exceptListingId } } : {}) }, select: { slug: true } });
  return new Set(rows.map((row) => row.slug));
}

/** Crea o actualiza la ficha de venta de un producto en la tienda del sitio. No cambia si está publicado. */
export async function saveStoreProduct(companyId: string, siteId: string, productId: string, input: StoreProductInput): Promise<void> {
  await assertSite(companyId, siteId);
  const product = await prisma.product.findFirst({ where: { id: productId, companyId, isActive: true }, select: { id: true, name: true, grossPrice: true } });
  if (!product) throw new StoreNotFoundError('Producto no encontrado o archivado');
  assertOwnImages(companyId, input.images.map((image) => image.url));
  if (input.compareAtPrice !== null && input.compareAtPrice <= product.grossPrice) {
    throw new StoreError('El precio anterior debe ser mayor que el precio actual para mostrarlo tachado.', 400, 'compareAtPrice');
  }

  const existing = await prisma.storeProduct.findFirst({ where: { companyId, siteId, productId }, select: { id: true, slug: true } });
  const taken = await usedSlugs(companyId, siteId, existing?.id);
  const wanted = input.slug ?? existing?.slug ?? productSlug(product.name, taken);
  if (taken.has(wanted)) throw new StoreError('Esa dirección ya la usa otro producto de la tienda. Prueba con otra.', 400, 'slug');

  const data = {
    slug: wanted,
    title: input.title || null,
    summary: input.summary || null,
    description: input.description || null,
    images: input.images.map((image) => ({ url: image.url, alt: image.alt })),
    compareAtPrice: input.compareAtPrice,
    collection: input.collection || null,
    featured: input.featured,
    sortOrder: input.sortOrder,
    maxPerOrder: input.maxPerOrder,
  };
  try {
    if (existing) {
      await prisma.storeProduct.updateMany({ where: { id: existing.id, companyId, siteId }, data });
    } else {
      await prisma.storeProduct.create({ data: { companyId, siteId, productId, published: false, ...data } });
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new StoreError('Esa dirección ya la usa otro producto de la tienda. Prueba con otra.', 400, 'slug');
    throw error;
  }
}

/** Publica o despublica varios productos a la vez; los que no tenían ficha reciben una mínima (con la foto del inventario). */
export async function setProductsPublished(companyId: string, siteId: string, productIds: string[], published: boolean): Promise<number> {
  await assertSite(companyId, siteId);
  const ids = [...new Set(productIds)];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, companyId, isActive: true },
    select: { id: true, name: true, imageUrl: true },
  });
  if (products.length === 0) throw new StoreNotFoundError('No encontramos esos productos');

  const existing = await prisma.storeProduct.findMany({ where: { companyId, siteId, productId: { in: products.map((product) => product.id) } }, select: { id: true, productId: true } });
  const existingBy = new Map(existing.map((row) => [row.productId, row.id]));
  const taken = await usedSlugs(companyId, siteId);

  const toCreate = products.filter((product) => !existingBy.has(product.id));
  if (published && toCreate.length > 0) {
    await prisma.storeProduct.createMany({
      data: toCreate.map((product) => {
        const slug = productSlug(product.name, taken);
        taken.add(slug);
        const image = ownImageOrNull(companyId, product.imageUrl);
        return { companyId, siteId, productId: product.id, published: true, slug, images: image ? [{ url: image, alt: product.name.slice(0, 160) }] : [] };
      }),
      skipDuplicates: true,
    });
  }
  const result = await prisma.storeProduct.updateMany({ where: { companyId, siteId, productId: { in: products.map((product) => product.id) } }, data: { published } });
  return result.count;
}

export async function removeStoreProduct(companyId: string, siteId: string, productId: string): Promise<void> {
  await assertSite(companyId, siteId);
  await prisma.storeProduct.deleteMany({ where: { companyId, siteId, productId } });
}
