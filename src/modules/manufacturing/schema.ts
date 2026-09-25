import { z } from 'zod';

export const PRODUCTION_STATUS_LABELS = {
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Terminada',
  CANCELLED: 'Anulada',
} as const;

const isoDay = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')]).optional();

export const bomSchema = z.object({
  productId: z.string().min(1, 'Elige el producto que se fabrica'),
  name: z.string().trim().min(2, 'Ponle un nombre a la receta').max(80),
  outputQuantity: z.number().positive('La receta debe producir una cantidad mayor a cero').max(1_000_000),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
  components: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().positive('Cantidad mayor a cero').max(1_000_000) }))
    .min(1, 'Agrega al menos un insumo')
    .max(100),
});

export type BomInput = z.infer<typeof bomSchema>;

export const productionOrderSchema = z.object({
  bomId: z.string().min(1, 'Elige la receta'),
  quantity: z.number().positive('La cantidad debe ser mayor a cero').max(10_000_000),
  warehouseId: z.string().min(1, 'Elige la bodega'),
  plannedDate: isoDay,
  notes: z.string().trim().max(1000).optional(),
});

export type ProductionOrderInput = z.infer<typeof productionOrderSchema>;

export const completeProductionSchema = z.object({
  /** Cantidad realmente producida (puede diferir de la planificada). */
  producedQuantity: z.number().positive('La cantidad producida debe ser mayor a cero').max(10_000_000),
  /** Consumo real por componente de la orden; si falta, se usa lo planificado. */
  consumed: z.record(z.string(), z.number().min(0).max(10_000_000)).default({}),
  additionalCost: z.number().int('Monto en pesos enteros').min(0).max(10_000_000_000).default(0),
  additionalCostNote: z.string().trim().max(200).optional(),
});

export type CompleteProductionInput = z.infer<typeof completeProductionSchema>;
