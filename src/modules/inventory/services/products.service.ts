import { prisma } from '@/lib/prisma';
import type { Category, Prisma, Product, ProductPackaging } from '@prisma/client';
import { calculateGrossPrice } from '@/lib/chile/tax';
import type { CategoryCreateInput, ProductCreateInput, ProductPackagingInput, ProductUpdateInput } from '../schema';

export type ProductWithStock = Product & { category: Category | null; totalStock: number };

export async function listProducts(
  companyId: string,
  options?: { query?: string; categoryId?: string }
): Promise<ProductWithStock[]> {
  const where: Prisma.ProductWhereInput = { companyId };
  const trimmed = options?.query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ sku: like }, { name: like }, { brand: like }, { barcode: trimmed }, { packagings: { some: { barcode: trimmed } } }];
  }
  if (options?.categoryId) where.categoryId = options.categoryId;

  const products = await prisma.product.findMany({
    where,
    include: { category: true, stocks: { select: { quantity: true } } },
    orderBy: { name: 'asc' },
    take: 300,
  });

  return products.map(({ stocks, ...product }) => ({
    ...product,
    totalStock: stocks.reduce((sum, s) => sum + s.quantity, 0),
  }));
}

/**
 * Fila de la tabla de `ProductsClient`: no necesita el `Product` completo, solo
 * lo que la tabla pinta más lo mínimo que `ProductForm` necesita para editar
 * directo desde la fila (sin pasar por `getProductAction`). Se deja fuera
 * `companyId`, `createdAt`, `updatedAt` y las colecciones de movimientos.
 */
export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  unit: string;
  isTrackable: boolean;
  isExempt: boolean;
  netPrice: number;
  grossPrice: number;
  minStock: number;
  costPricePMP: number;
  totalStock: number;
  barcode: string | null;
  brand: string | null;
  imageUrl: string | null;
  tracksLots: boolean;
}

export interface ListProductsResult {
  items: ProductListItem[];
  total: number;
}

const PRODUCTS_DEFAULT_PAGE_SIZE = 25;

/**
 * Versión paginada server-side de `listProducts`, exclusiva para la tabla de
 * gestión (`ProductsClient`). `listProducts` (sin paginar, tope 300) se deja
 * intacta a propósito: la siguen usando varios selectores de producto
 * (`SalesDocumentForm`, `PurchaseDocumentForm`, `PurchaseOrderForm`,
 * `StockMovementForm`, `CommandMenu`, `InventoryClient`) que esperan el
 * arreglo completo, no `{ items, total }` — cambiarle el contrato habría roto
 * esas seis pantallas fuera del alcance de este cambio.
 */
export async function listProductsPage(
  companyId: string,
  options?: { query?: string; categoryId?: string; page?: number; pageSize?: number }
): Promise<ListProductsResult> {
  const where: Prisma.ProductWhereInput = { companyId };
  const trimmed = options?.query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ sku: like }, { name: like }, { brand: like }, { barcode: trimmed }, { packagings: { some: { barcode: trimmed } } }];
  }
  if (options?.categoryId) where.categoryId = options.categoryId;

  const page = options?.page && options.page > 0 ? options.page : 1;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : PRODUCTS_DEFAULT_PAGE_SIZE;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
        unit: true,
        isTrackable: true,
        isExempt: true,
        netPrice: true,
        grossPrice: true,
        minStock: true,
        costPricePMP: true,
        barcode: true,
        brand: true,
        imageUrl: true,
        tracksLots: true,
        stocks: { select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: products.map(({ stocks, ...product }) => ({
      ...product,
      totalStock: stocks.reduce((sum, s) => sum + s.quantity, 0),
    })),
    total,
  };
}

export async function getProduct(companyId: string, id: string): Promise<ProductWithStock | null> {
  const product = await prisma.product.findFirst({
    where: { companyId, id },
    include: { category: true, stocks: { select: { quantity: true } } },
  });
  if (!product) return null;
  const { stocks, ...rest } = product;
  return { ...rest, totalStock: stocks.reduce((sum, s) => sum + s.quantity, 0) };
}

/**
 * `Product.categoryId` no tiene una FK compuesta con `companyId`, así que Prisma
 * por sí solo acepta enlazar la categoría de otra empresa. Como el id llega
 * desde el cliente, la pertenencia al tenant se comprueba explícitamente: sin
 * esto, el nombre de una categoría ajena aparecía en listados y en el Excel.
 */
async function assertCategoryBelongsToCompany(companyId: string, categoryId: string): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, companyId } });
  if (!category) throw new Error('Categoría no encontrada');
}

export async function createProduct(companyId: string, input: ProductCreateInput): Promise<Product> {
  if (input.categoryId) await assertCategoryBelongsToCompany(companyId, input.categoryId);
  if (input.barcode) await assertBarcodeFree(companyId, input.barcode);

  return prisma.product.create({
    data: {
      companyId,
      sku: input.sku,
      name: input.name,
      description: input.description || undefined,
      categoryId: input.categoryId || undefined,
      unit: input.unit || 'UN',
      isTrackable: input.isTrackable ?? true,
      isExempt: input.isExempt ?? false,
      netPrice: input.netPrice,
      grossPrice: calculateGrossPrice(input.netPrice, input.isExempt ?? false),
      minStock: input.minStock ?? 0,
      barcode: input.barcode || undefined,
      brand: input.brand || undefined,
      imageUrl: input.imageUrl || undefined,
      tracksLots: input.tracksLots ?? false,
    },
  });
}

export async function updateProduct(companyId: string, id: string, input: ProductUpdateInput): Promise<Product> {
  // `updateMany` es lo que garantiza el filtro por `companyId`, y solo acepta
  // escalares: la categoría se asigna por su FK, no con `connect`.
  const data: Prisma.ProductUncheckedUpdateManyInput = {
    name: input.name,
    description: input.description === '' ? null : input.description,
    unit: input.unit,
    isTrackable: input.isTrackable,
    isExempt: input.isExempt,
    minStock: input.minStock,
    barcode: input.barcode === undefined ? undefined : input.barcode || null,
    brand: input.brand === undefined ? undefined : input.brand || null,
    imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl || null,
    tracksLots: input.tracksLots,
  };
  if (input.sku) data.sku = input.sku;
  if (input.barcode) await assertBarcodeFree(companyId, input.barcode, id);
  if (input.categoryId !== undefined) {
    if (input.categoryId === '') {
      data.categoryId = null;
    } else {
      await assertCategoryBelongsToCompany(companyId, input.categoryId);
      data.categoryId = input.categoryId;
    }
  }
  // El bruto se recalcula si cambia el neto O la condición de exento. Antes
  // solo miraba el neto, así que marcar un producto como exento sin tocar su
  // precio lo dejaba con el 19% viejo guardado en `grossPrice`.
  if (input.netPrice !== undefined || input.isExempt !== undefined) {
    const current = await prisma.product.findFirst({
      where: { companyId, id },
      select: { netPrice: true, isExempt: true },
    });
    if (!current) throw new Error('Producto no encontrado');

    const netPrice = input.netPrice ?? current.netPrice;
    const isExempt = input.isExempt ?? current.isExempt;
    data.netPrice = netPrice;
    data.grossPrice = calculateGrossPrice(netPrice, isExempt);
  }

  const result = await prisma.product.updateMany({ where: { companyId, id }, data });
  if (result.count === 0) throw new Error('Producto no encontrado');

  const updated = await prisma.product.findFirst({ where: { companyId, id } });
  if (!updated) throw new Error('Producto no encontrado');
  return updated;
}

export async function deleteProduct(companyId: string, id: string): Promise<void> {
  const result = await prisma.product.deleteMany({ where: { companyId, id } });
  if (result.count === 0) throw new Error('Producto no encontrado');
}

export async function listCategories(companyId: string): Promise<Category[]> {
  return prisma.category.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
}

export async function createCategory(companyId: string, input: CategoryCreateInput): Promise<Category> {
  return prisma.category.create({
    data: { companyId, name: input.name, description: input.description || undefined },
  });
}

// ─── Empaques y búsqueda por código ──────────────────────────────────────────

export async function listPackagings(companyId: string, productId: string): Promise<ProductPackaging[]> {
  return prisma.productPackaging.findMany({ where: { companyId, productId }, orderBy: { factor: 'asc' } });
}

export async function createPackaging(companyId: string, productId: string, input: ProductPackagingInput): Promise<ProductPackaging> {
  const product = await prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
  if (!product) throw new Error('Producto no encontrado');
  if (input.barcode) await assertBarcodeFree(companyId, input.barcode);
  return prisma.productPackaging.create({
    data: { companyId, productId, name: input.name, factor: input.factor, barcode: input.barcode || undefined },
  });
}

export async function deletePackaging(companyId: string, id: string): Promise<void> {
  const result = await prisma.productPackaging.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Empaque no encontrado');
}

/**
 * Un mismo código no puede ser a la vez de un producto y de un empaque: el
 * lector no sabría si agregar 1 unidad o una caja.
 */
export async function assertBarcodeFree(companyId: string, barcode: string, exceptProductId?: string): Promise<void> {
  const [product, packaging] = await Promise.all([
    prisma.product.findFirst({ where: { companyId, barcode, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) }, select: { name: true } }),
    prisma.productPackaging.findFirst({ where: { companyId, barcode }, select: { name: true, product: { select: { name: true } } } }),
  ]);
  if (product) throw new Error(`El código de barras ya lo usa el producto "${product.name}"`);
  if (packaging) throw new Error(`El código de barras ya lo usa el empaque "${packaging.name}" de ${packaging.product.name}`);
}

export interface CodeMatch {
  product: Product;
  /** Unidades que representa el código (1 = unidad, 12 = caja de 12). */
  factor: number;
  packagingName: string | null;
}

/** Resuelve un código leído por escáner: código del producto, de un empaque o SKU exacto. */
export async function findProductByCode(companyId: string, code: string): Promise<CodeMatch | null> {
  const value = code.trim();
  if (!value) return null;
  const byBarcode = await prisma.product.findFirst({ where: { companyId, barcode: value } });
  if (byBarcode) return { product: byBarcode, factor: 1, packagingName: null };
  const packaging = await prisma.productPackaging.findFirst({ where: { companyId, barcode: value }, include: { product: true } });
  if (packaging) return { product: packaging.product, factor: packaging.factor, packagingName: packaging.name };
  const bySku = await prisma.product.findFirst({ where: { companyId, sku: { equals: value, mode: 'insensitive' } } });
  return bySku ? { product: bySku, factor: 1, packagingName: null } : null;
}

/** De una lista de productos, cuáles llevan lotes (para pedir lote y vencimiento al recibir). */
export async function listLotTrackedProductIds(companyId: string, productIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(productIds)].slice(0, 500);
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({ where: { companyId, id: { in: ids }, tracksLots: true }, select: { id: true } });
  return rows.map((row) => row.id);
}
