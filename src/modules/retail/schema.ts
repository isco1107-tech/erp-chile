import { z } from 'zod';
import { isDeadStockDays } from '@/lib/retail/dead-stock';

/** Ajustes de stock muerto: el umbral sale de una lista cerrada (ver `DEAD_STOCK_DAY_OPTIONS`). */
export const deadStockSettingsSchema = z
  .object({
    deadStockDays: z.number().int().refine(isDeadStockDays, 'Elige un umbral de la lista'),
    deadStockAlerts: z.boolean(),
  })
  .strict();
