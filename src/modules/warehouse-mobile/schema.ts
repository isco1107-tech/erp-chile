import { z } from 'zod';
import { UNITS } from '@/modules/inventory/schema';
import { MAX_NOTE_LENGTH, MOBILE_MODES, WASTE_REASONS, isTransferMode, MODE_DEFINITIONS } from '@/lib/warehouse-mobile/modes';

/**
 * Contrato entre el celular del bodeguero y el servidor. Lo importan los dos
 * lados: la app valida antes de poner una operación en su cola, y el servidor
 * la vuelve a validar al recibirla (nada de lo que llega del celular se da por
 * bueno).
 */

/** Operaciones por envío. Más que esto parte el envío en varios. */
export const MAX_OPS_PER_BATCH = 25;

/** Tope de cantidad por línea: un cero de más (1.000.000) se rechaza en vez de mover el stock. */
export const MAX_QUANTITY = 1_000_000;

/** Tope de costo unitario (CLP): evita desbordar `InventoryMovement.totalCost`. */
export const MAX_UNIT_COST = 100_000_000;

/** Clave que el celular genera por operación (UUID o equivalente). */
export const clientOpIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Clave de operación inválida');

const idSchema = z.string().min(1).max(64);

/** Cantidad positiva con hasta 3 decimales (kilos, litros). */
export const quantitySchema = z
  .number()
  .positive('La cantidad debe ser mayor a cero')
  .max(MAX_QUANTITY, 'La cantidad es demasiado grande')
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, 'Usa hasta 3 decimales');

const unitCostSchema = z.number().min(0, 'El costo no puede ser negativo').max(MAX_UNIT_COST, 'El costo es demasiado grande');

const referenceSchema = z.string().trim().max(60, 'Máximo 60 caracteres');

const noteSchema = z.string().trim().max(MAX_NOTE_LENGTH, `Máximo ${MAX_NOTE_LENGTH} caracteres`);

const lotFields = {
  lotNumber: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  expiryDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida')]).optional(),
};

/** Código de barras: lo que un lector puede escribir (mismo criterio que el catálogo). */
const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64, 'Máximo 64 caracteres')
  .regex(/^[\x21-\x7e]+$/, 'El código de barras solo admite letras, números y símbolos, sin espacios');

const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(40, 'Máximo 40 caracteres')
  .regex(/^[A-Za-z0-9._\-/]+$/, 'El SKU solo admite letras, números y . _ - /');

/** Producto que el bodeguero crea desde el celular, con lo que la foto o la etiqueta mostró. */
export const newProductSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre al producto').max(120, 'Máximo 120 caracteres'),
  /** Vacío = el servidor asigna el siguiente SKU libre (PRD-000123). */
  sku: skuSchema.optional(),
  barcode: barcodeSchema.optional(),
  brand: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  description: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  unit: z.enum(UNITS).default('UN'),
  categoryId: idSchema.optional(),
  /** Categoría que no existe todavía: el servidor la busca por nombre y, si no está, la crea. */
  categoryName: z.string().trim().min(2).max(60).optional(),
  netPrice: z.number().int('El precio debe ser un número entero').min(0).max(MAX_UNIT_COST).optional(),
  isExempt: z.boolean().optional(),
  minStock: z.number().int().min(0).max(MAX_QUANTITY).optional(),
  tracksLots: z.boolean().optional(),
  /** Foto subida por `/api/bodega/photo`. El servidor comprueba que sea de nuestro almacenamiento. */
  imageUrl: z.string().url().max(500).optional(),
});

export type NewProductInput = z.infer<typeof newProductSchema>;

const capturedAtSchema = z.iso.datetime().optional();

export const moveOpSchema = z
  .object({
    kind: z.literal('MOVE'),
    clientOpId: clientOpIdSchema,
    mode: z.enum(MOBILE_MODES),
    productId: idSchema,
    warehouseId: idSchema,
    targetWarehouseId: idSchema.optional(),
    quantity: quantitySchema,
    unitCost: unitCostSchema.optional(),
    reference: referenceSchema.optional(),
    reason: z.enum(WASTE_REASONS).optional(),
    note: noteSchema.optional(),
    ...lotFields,
    capturedAt: capturedAtSchema,
  })
  .superRefine((op, ctx) => {
    if (isTransferMode(op.mode)) {
      if (!op.targetWarehouseId) ctx.addIssue({ code: 'custom', path: ['targetWarehouseId'], message: 'Elige la bodega de destino' });
      else if (op.targetWarehouseId === op.warehouseId) {
        ctx.addIssue({ code: 'custom', path: ['targetWarehouseId'], message: 'La bodega de destino debe ser distinta de la de origen' });
      }
    }
    if (MODE_DEFINITIONS[op.mode].asksReason && !op.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Indica el motivo' });
    }
  });

export type MoveOp = z.infer<typeof moveOpSchema>;

/** Modos con los que se puede dar de alta un producto: llega mercadería o queda como inventario inicial. */
const CREATE_MODES = ['RECEIVE', 'SURPLUS'] as const;

export const createProductOpSchema = z.object({
  kind: z.literal('CREATE_PRODUCT'),
  clientOpId: clientOpIdSchema,
  mode: z.enum(CREATE_MODES),
  warehouseId: idSchema,
  product: newProductSchema,
  quantity: quantitySchema,
  unitCost: unitCostSchema.optional(),
  reference: referenceSchema.optional(),
  note: noteSchema.optional(),
  ...lotFields,
  /**
   * El bodeguero ya vio que existe un producto parecido y decidió que este es
   * otro. Sin esto, un nombre+marca que ya existe se devuelve como duplicado.
   */
  confirmDistinct: z.boolean().optional(),
  capturedAt: capturedAtSchema,
});

export type CreateProductOp = z.infer<typeof createProductOpSchema>;

export const syncOperationSchema = z.discriminatedUnion('kind', [moveOpSchema, createProductOpSchema]);

export type SyncOperation = z.infer<typeof syncOperationSchema>;

/**
 * El envío trae operaciones sin validar: una mala no debe tumbar a las demás,
 * así que cada una se valida por separado (ver `sync.service.ts`).
 */
export const syncRequestSchema = z.object({
  ops: z.array(z.unknown()).min(1, 'No hay operaciones que enviar').max(MAX_OPS_PER_BATCH, `Máximo ${MAX_OPS_PER_BATCH} operaciones por envío`),
});

/** Búsqueda manual y por código. */
export const lookupQuerySchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().min(2).max(80).optional(),
  warehouseId: idSchema.optional(),
});
