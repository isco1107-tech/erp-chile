import { z } from 'zod';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

/** Código de barras: lo que un lector puede escribir (ASCII imprimible, sin espacios a los lados). */
const barcodeField = z
  .string()
  .trim()
  .max(64, 'Máximo 64 caracteres')
  .regex(/^[\x21-\x7e]*$/, 'El código de barras solo admite letras, números y símbolos, sin espacios')
  .optional();

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
  barcode: barcodeField,
  brand: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  imageUrl: z
    .string()
    .url('URL de imagen inválida')
    .refine((url) => isAllowedBlobUrl(url), 'La imagen debe subirse desde el sistema')
    .optional()
    .or(z.literal('')),
  tracksLots: z.boolean().optional(),
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
    type: z.enum(MOVEMENT_TYPES, 'Selecciona un tipo de movimiento'),
    quantity: z.number().positive('La cantidad debe ser mayor a cero'),
    unitCost: z.number().min(0, 'El costo unitario no puede ser negativo').optional(),
    targetWarehouseId: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
    /** Solo productos con lotes: lote y vencimiento de lo que entra. */
    lotNumber: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
    expiryDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida')]).optional(),
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

export const productPackagingSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre (ej. Caja x12)').max(60, 'Máximo 60 caracteres'),
  factor: z.number().positive('Las unidades por empaque deben ser mayores a cero').max(1_000_000, 'Demasiadas unidades'),
  barcode: barcodeField,
});

export type ProductPackagingInput = z.infer<typeof productPackagingSchema>;

// ─── Toma de inventario ──────────────────────────────────────────────────────

export const inventoryCountCreateSchema = z.object({
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  categoryId: z.string().optional(),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

export const inventoryCountEntriesSchema = z
  .array(
    z.object({
      lineId: z.string().min(1),
      countedQuantity: z.number().min(0, 'La cantidad contada no puede ser negativa').nullable(),
    })
  )
  .max(20_000);
