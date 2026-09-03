import { z } from 'zod';

export const UNITS = ['UN', 'KG', 'MT', 'LTS', 'CJA', 'PAR'] as const;

export const productCreateSchema = z.object({
  sku: z.string().min(1, 'El SKU es obligatorio'),
  name: z.string().min(2, 'El nombre es obligatorio'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  unit: z.string().min(1).default('UN'),
  isTrackable: z.boolean().optional(),
  isExempt: z.boolean().optional(),
  netPrice: z
    .number()
    .int('El precio neto debe ser un número entero')
    .min(0, 'El precio neto no puede ser negativo'),
  minStock: z.number().int('El stock mínimo debe ser un número entero').min(0).optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const categoryCreateSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  description: z.string().optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const warehouseCreateSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  code: z.string().min(1, 'El código es obligatorio'),
  address: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>;

export const MOVEMENT_TYPES = ['PURCHASE_IN', 'SALE_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER'] as const;

export const stockMovementSchema = z
  .object({
    productId: z.string().min(1, 'Seleccione un producto'),
    warehouseId: z.string().min(1, 'Seleccione una bodega'),
    type: z.enum(MOVEMENT_TYPES),
    quantity: z.number().positive('La cantidad debe ser mayor a cero'),
    unitCost: z.number().min(0, 'El costo unitario no puede ser negativo').optional(),
    targetWarehouseId: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => !(data.type === 'PURCHASE_IN' || data.type === 'ADJUSTMENT_IN') || data.unitCost !== undefined,
    { message: 'El costo unitario es obligatorio para entradas de stock', path: ['unitCost'] }
  )
  .refine((data) => data.type !== 'TRANSFER' || !!data.targetWarehouseId, {
    message: 'Debe indicar la bodega de destino',
    path: ['targetWarehouseId'],
  })
  .refine((data) => data.type !== 'TRANSFER' || data.targetWarehouseId !== data.warehouseId, {
    message: 'La bodega de destino debe ser distinta de la de origen',
    path: ['targetWarehouseId'],
  });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
