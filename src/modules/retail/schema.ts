import { z } from 'zod';
import { isDeadStockDays } from '@/lib/retail/dead-stock';
import { COVER_DAY_OPTIONS, LEAD_DAY_OPTIONS } from '@/lib/retail/reorder';

/** Ajustes de stock muerto: el umbral sale de una lista cerrada (ver `DEAD_STOCK_DAY_OPTIONS`). */
export const deadStockSettingsSchema = z
  .object({
    deadStockDays: z.number().int().refine(isDeadStockDays, 'Elige un umbral de la lista'),
    deadStockAlerts: z.boolean(),
  })
  .strict();

/** Tiempo de entrega por proveedor: `contactId` → días (0 a 120). Hasta 500 proveedores. */
export const supplierLeadDaysSchema = z
  .record(z.string().min(1).max(40), z.number().int().min(0).max(120))
  .refine((value) => Object.keys(value).length <= 500, 'Demasiados proveedores');

const inList = (list: readonly number[]) => (value: number) => list.includes(value);

/** Ajustes de la reposición predictiva. */
export const reorderSettingsSchema = z
  .object({
    reorderLeadDays: z.number().int().refine(inList(LEAD_DAY_OPTIONS), 'Elige un tiempo de entrega de la lista'),
    reorderCoverDays: z.number().int().refine(inList(COVER_DAY_OPTIONS), 'Elige los días a cubrir de la lista'),
    supplierLeadDays: supplierLeadDaysSchema,
  })
  .strict();
