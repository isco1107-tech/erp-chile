import { z } from 'zod';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { commissionBpsSchema } from '@/lib/consignment/commission';
import { WASTE_REASONS, reasonRequiresNote } from '@/lib/warehouse-mobile/modes';

/** Código de barras: lo que un lector puede escribir (ASCII imprimible, sin espacios a los lados). */
const barcodeField = z
  .string()
  .trim()
  .max(64, 'Máximo 64 caracteres')
  .regex(/^[\x21-\x7e]*$/, 'El código de barras solo admite letras, números y símbolos, sin espacios')
  .optional();

export const UNITS = ['UN', 'KG', 'MT', 'LTS', 'CJA', 'PAR'] as const;

/** Nombre de cada unidad para mostrar; el código es lo que se guarda (y lo que va al DTE). */
export const UNIT_LABELS: Record<(typeof UNITS)[number], string> = {
  UN: 'Unidad',
  KG: 'Kilo',
  MT: 'Metro',
  LTS: 'Litro',
  CJA: 'Caja',
  PAR: 'Par',
};

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
  /** Seller dueño del producto (consignación). Vacío o `null` = producto propio. */
  consignorId: z.string().min(1).nullable().optional(),
  /** Comisión propia del producto en puntos base. `null` = la del seller. */
  consignmentCommissionBps: commissionBpsSchema.nullable().optional(),
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

/** Recepción de mercadería de un seller (consignación): el producto ya trae su dueño. */
export const consignmentReceiveSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  quantity: z.number().positive('La cantidad debe ser mayor a cero').max(1_000_000, 'La cantidad es demasiado grande: revisa los ceros'),
  reference: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  /** Solo productos con lotes: lote y vencimiento de lo que entra. */
  lotNumber: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  expiryDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida')]).optional(),
});

/** Devolución de mercadería al seller (sale de la bodega sin venderse). */
export const consignmentReturnSchema = consignmentReceiveSchema.pick({ productId: true, warehouseId: true, quantity: true, reference: true, notes: true });

const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((value) => !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().startsWith(value), 'Fecha inválida');

/** Una fecha de pago real: de este siglo y no más allá de mañana (el navegador puede ir un día adelantado). */
const paymentDay = calendarDay.refine((value) => value >= '2000-01-01' && value <= new Date(Date.now() + 36 * 60 * 60_000).toISOString().slice(0, 10), 'La fecha de pago no es válida');

/** Generar la liquidación de lo pendiente de un seller (con un ajuste manual opcional). */
export const settlementGenerateSchema = z
  .object({
    consignorId: z.string().min(1, 'Selecciona un seller'),
    /** CLP con signo: una nota de crédito por precio, un descuento acordado… Con su motivo. */
    adjustmentAmount: z.number().int('El ajuste debe ser un monto entero').min(-100_000_000, 'Ajuste demasiado grande').max(100_000_000, 'Ajuste demasiado grande').default(0),
    adjustmentNote: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
    note: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
    /** Intento de la pantalla: reenviarlo devuelve la liquidación ya creada en vez de generar otra. */
    idempotencyKey: z.string().trim().min(8, 'Clave inválida').max(100, 'Clave inválida').optional(),
    /** Lo que la persona vio en la vista previa: si las ventas cambiaron mientras tanto, se rechaza en vez de liquidar otro monto. */
    expectedPayoutAmount: z.number().int().optional(),
  })
  .refine((data) => data.adjustmentAmount === 0 || (data.adjustmentNote ?? '').length >= 3, {
    message: 'Explica el motivo del ajuste',
    path: ['adjustmentNote'],
  });

/** Marcar una liquidación como pagada al seller. */
export const settlementPaySchema = z.object({
  id: z.string().min(1),
  paidAt: paymentDay,
  reference: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
});

/** Anular una liquidación que aún no se pagó. */
export const settlementVoidSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, 'Indica el motivo de la anulación').max(200, 'Máximo 200 caracteres'),
});

export type SettlementGenerateInput = z.infer<typeof settlementGenerateSchema>;
export type SettlementPayInput = z.infer<typeof settlementPaySchema>;
export type SettlementVoidInput = z.infer<typeof settlementVoidSchema>;
export type ConsignmentReceiveInput = z.infer<typeof consignmentReceiveSchema>;
export type ConsignmentReturnInput = z.infer<typeof consignmentReturnSchema>;

/**
 * Movimientos que una persona puede registrar a mano. «Salida por venta» NO
 * está: una venta sin boleta ni factura dejaba stock descontado sin ingreso,
 * sin cobro y contada como vendida en Retail. Las ventas salen de Ventas o del POS.
 */
export const MOVEMENT_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER', 'PURCHASE_IN'] as const;

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
    /** Motivo de una salida por ajuste: la misma lista cerrada de la bodega móvil. */
    reasonCode: z.enum(WASTE_REASONS, 'Elige el motivo de la salida').optional(),
  })
  .refine((data) => data.type !== 'ADJUSTMENT_OUT' || data.reasonCode !== undefined, {
    message: 'Elige el motivo de la salida (vencido, dañado, pérdida…)',
    path: ['reasonCode'],
  })
  .refine((data) => !reasonRequiresNote(data.reasonCode) || Boolean(data.notes?.trim()), {
    message: 'Con «Otro motivo» cuenta en las notas qué pasó',
    path: ['notes'],
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
