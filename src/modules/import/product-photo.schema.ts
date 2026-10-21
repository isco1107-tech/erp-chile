import { z } from 'zod';
import { productCreateSchema } from '@/modules/inventory/schema';

/**
 * Confirmación de un producto propuesto por foto. Reutiliza TAL CUAL la
 * validación del alta normal de productos (`productCreateSchema`): código de
 * barras imprimible, marca ≤ 80, imagen solo de nuestro almacenamiento, precio
 * neto entero ≥ 0, etc. Solo cambia que el SKU es opcional (se genera) y que se
 * acepta una categoría por nombre.
 *
 * `isExempt` viene de lo que el usuario marcó en la revisión; sin él, el
 * producto nace afecto a IVA. El modelo nunca lo decide.
 */
export const productPhotoConfirmSchema = productCreateSchema
  .extend({
    sku: z.string().trim().min(1, 'El SKU no puede quedar vacío').max(60, 'Máximo 60 caracteres').optional(),
    /** Categoría existente. Tiene prioridad sobre `categoryName`. */
    categoryId: z.string().trim().min(1).optional(),
    /** Categoría nueva (o existente por nombre) cuando no se eligió una de la lista. */
    categoryName: z.string().trim().min(2, 'El nombre de la categoría es muy corto').max(80, 'Máximo 80 caracteres').optional(),
    /** El usuario vio los productos parecidos y quiere crearlo igual. */
    acknowledgeNameDuplicates: z.boolean().default(false),
  })
  .refine((value) => value.name.trim().length >= 2, { message: 'El nombre es obligatorio', path: ['name'] });

export type ProductPhotoConfirmInput = z.infer<typeof productPhotoConfirmSchema>;
