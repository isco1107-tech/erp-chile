'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { constraintInvolves, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { createProduct } from '@/modules/inventory/services/products.service';
import { productPhotoConfirmSchema } from '../product-photo.schema';
import { findDuplicateProducts, suggestFreeSku } from '../services/product-photo.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export interface CreatedFromPhoto {
  id: string;
  sku: string;
  name: string;
}

/**
 * Paso final del alta por foto: crea el producto que el usuario revisó.
 *
 * No confía en el borrador del modelo: vuelve a validar todo con el mismo
 * esquema y el mismo servicio que el alta manual (`createProduct`, que además
 * verifica que el código de barras no esté usado por otro producto o empaque y
 * que la categoría sea de la empresa). `isExempt` es lo que el usuario marcó;
 * por defecto, afecto.
 */
export async function confirmProductFromPhotoAction(input: unknown): Promise<ActionResult<CreatedFromPhoto>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:write');
    companyId = session.companyId;

    const parsed = productPhotoConfirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos del producto no válidos' };
    const { categoryName, acknowledgeNameDuplicates, sku: requestedSku, ...productInput } = parsed.data;

    // El código de barras repetido lo rechaza `createProduct`; los nombres
    // parecidos solo avisan, y el usuario puede decidir que no es un duplicado.
    if (!acknowledgeNameDuplicates) {
      const similar = (await findDuplicateProducts(session.companyId, { name: productInput.name, barcode: null })).filter((hit) => hit.reason === 'name');
      if (similar.length > 0) {
        const first = similar[0]!;
        return {
          success: false,
          error: `Ya existe un producto parecido: "${first.name}" (SKU ${first.sku}). Si es otro producto, confirma que quieres crearlo igual.`,
        };
      }
    }

    let categoryId = productInput.categoryId;
    if (!categoryId && categoryName) {
      const category = await prisma.category.upsert({
        where: { companyId_name: { companyId: session.companyId, name: categoryName } },
        update: {},
        create: { companyId: session.companyId, name: categoryName },
        select: { id: true },
      });
      categoryId = category.id;
    }

    // SKU generado: si otra alta lo tomó entre la consulta y el insert, se
    // reintenta con el siguiente libre. Uno elegido por el usuario no se cambia.
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const sku = requestedSku ?? (await suggestFreeSku(session.companyId, productInput.name, productInput.barcode ?? null));
      try {
        created = await createProduct(session.companyId, { ...productInput, sku, categoryId });
      } catch (error) {
        const skuRace = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && constraintInvolves(error, 'sku');
        if (!skuRace || requestedSku) throw error;
      }
    }
    if (!created) return { success: false, error: 'No se pudo asignar un SKU libre. Escribe uno e inténtalo de nuevo.' };

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Product',
      entityId: created.id,
      metadata: { sku: created.sku, name: created.name, origen: 'foto' },
    });
    revalidatePath('/dashboard/products');
    revalidatePath('/dashboard/inventory');
    return { success: true, data: { id: created.id, sku: created.sku, name: created.name }, message: 'Producto creado correctamente' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      if (constraintInvolves(error, 'barcode')) return { success: false, error: 'Ese código de barras ya está asignado a otro producto o empaque' };
      if (constraintInvolves(error, 'sku')) return { success: false, error: 'Ya existe un producto con ese SKU en tu empresa' };
    }
    // Los Error "normales" de los servicios ya traen un mensaje en español para el usuario
    // (p. ej. "El código de barras ya lo usa el producto ..."); lo del driver se traduce.
    const isBusinessMessage = error instanceof Error && error.constructor === Error;
    if (!isBusinessMessage) captureException(error, { module: 'importacion', companyId, extra: { reason: 'product-photo-confirm' } });
    return { success: false, error: toFriendlyErrorMessage(error) };
  }
}
