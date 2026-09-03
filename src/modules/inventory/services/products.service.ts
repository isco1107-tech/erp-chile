import { prisma } from '@/lib/prisma';
import type { Category, Prisma, Product } from '@prisma/client';
import { calculateGrossPrice } from '@/lib/chile/tax';
import type { CategoryCreateInput, ProductCreateInput, ProductUpdateInput } from '../schema';

export type ProductWithStock = Product & { category: Category | null; totalStock: number };

export async function listProducts(
  companyId: string,
  options?: { query?: string; categoryId?: string }
): Promise<ProductWithStock[]> {
  const where: Prisma.ProductWhereInput = { companyId };
  const trimmed = options?.query?.trim();
  if (trimmed) {
    const like: Prisma.StringFilter = { contains: trimmed, mode: 'insensitive' };
    where.OR = [{ sku: like }, { name: like }];
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
    where.OR = [{ sku: like }, { name: like }];
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
  };
  if (input.sku) data.sku = input.sku;
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
