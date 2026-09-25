'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Category } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { constraintInvolves, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import type { ProductPackaging } from '@prisma/client';
import { categoryCreateSchema, productCreateSchema, productPackagingSchema, productUpdateSchema } from '../schema';
import * as productsService from '../services/products.service';
import type { CodeMatch, ListProductsResult, ProductWithStock } from '../services/products.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function redactCosts<T extends { costPricePMP: number }>(product: T): T {
  return { ...product, costPricePMP: 0 };
}

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' && constraintInvolves(error, 'barcode')) return 'Ese código de barras ya está asignado a otro producto o empaque';
    if (error.code === 'P2002') return 'Ya existe un producto con ese SKU en esta empresa';
    if (error.code === 'P2003') return 'No se puede eliminar: el producto tiene movimientos o stock asociado';
  }
  return toFriendlyErrorMessage(error);
}

export async function listProductsAction(
  query?: string,
  categoryId?: string
): Promise<ActionResult<ProductWithStock[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const data = await productsService.listProducts(session.companyId, { query, categoryId });
    // El PMP se redacta si el rol no lo permite O si la empresa no contrató el
    // módulo de costeo: `can` ya cruza ambas cosas.
    if (!can(session, 'products:costs')) {
      return { success: true, data: data.map(redactCosts) };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Versión paginada server-side, exclusiva de `ProductsClient`. Ver el
 * comentario en `products.service.ts::listProductsPage` sobre por qué
 * `listProductsAction` (arriba) se dejó intacta para el resto de pantallas.
 */
export async function listProductsPageAction(
  query?: string,
  categoryId?: string,
  page = 1,
  pageSize = 25
): Promise<ActionResult<ListProductsResult>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const result = await productsService.listProductsPage(session.companyId, { query, categoryId, page, pageSize });
    // Misma redacción de PMP que en `listProductsAction`.
    if (!can(session, 'products:costs')) {
      return { success: true, data: { items: result.items.map(redactCosts), total: result.total } };
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getProductAction(id: string): Promise<ActionResult<ProductWithStock>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const product = await productsService.getProduct(session.companyId, id);
    if (!product) return { success: false, error: 'Producto no encontrado' };
    if (!can(session, 'products:costs')) {
      return { success: true, data: redactCosts(product) };
    }
    return { success: true, data: product };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createProductAction(input: unknown): Promise<ActionResult<ProductWithStock>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await productsService.createProduct(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Product',
      entityId: created.id,
      metadata: { sku: created.sku, name: created.name },
    });
    revalidatePath('/dashboard/products');
    revalidatePath('/dashboard/inventory');
    const data = await productsService.getProduct(session.companyId, created.id);
    return { success: true, data: can(session, 'products:costs') ? data! : redactCosts(data!), message: 'Producto creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<ActionResult<ProductWithStock>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    const parsed = productUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await productsService.updateProduct(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      metadata: { changes: parsed.data },
    });
    revalidatePath('/dashboard/products');
    revalidatePath('/dashboard/inventory');
    const data = await productsService.getProduct(session.companyId, id);
    return { success: true, data: can(session, 'products:costs') ? data! : redactCosts(data!), message: 'Producto actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    await productsService.deleteProduct(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
    });
    revalidatePath('/dashboard/products');
    revalidatePath('/dashboard/inventory');
    return { success: true, data: null, message: 'Producto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listCategoriesAction(): Promise<ActionResult<Category[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const data = await productsService.listCategories(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<Category>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    const parsed = categoryCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productsService.createCategory(session.companyId, parsed.data);
    revalidatePath('/dashboard/products');
    return { success: true, data, message: 'Categoría creada' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: 'Ya existe una categoría con ese nombre' };
    }
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPackagingsAction(productId: string): Promise<ActionResult<ProductPackaging[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    return { success: true, data: await productsService.listPackagings(session.companyId, productId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPackagingAction(productId: string, input: unknown): Promise<ActionResult<ProductPackaging>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    const parsed = productPackagingSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productsService.createPackaging(session.companyId, productId, parsed.data);
    revalidatePath('/dashboard/products');
    return { success: true, data, message: 'Empaque agregado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deletePackagingAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('products:write');
    await productsService.deletePackaging(session.companyId, id);
    revalidatePath('/dashboard/products');
    return { success: true, data: null, message: 'Empaque eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Lo que devuelve el escáner: producto y cuántas unidades representa el código. */
export async function findProductByCodeAction(code: string): Promise<ActionResult<CodeMatch | null>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const match = await productsService.findProductByCode(session.companyId, String(code).slice(0, 64));
    if (match && !can(session, 'products:costs')) match.product = redactCosts(match.product);
    return { success: true, data: match };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listLotTrackedProductIdsAction(productIds: string[]): Promise<ActionResult<string[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const ids = Array.isArray(productIds) ? productIds.filter((id): id is string => typeof id === 'string') : [];
    const data = await productsService.listLotTrackedProductIds(session.companyId, ids);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
