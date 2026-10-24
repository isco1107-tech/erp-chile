import { z } from 'zod';
import { EXPIRY_ALERT_DAY_OPTIONS, LIABLE_PARTIES, SHRINKAGE_REASON_KEYS, isCalendarDay } from '@/lib/inventory/shrinkage';

/** Responsable sugerido por motivo (lista cerrada de motivos y de responsables). */
export const shrinkageDefaultsSchema = z.partialRecord(z.enum(SHRINKAGE_REASON_KEYS), z.enum(LIABLE_PARTIES));

export const shrinkageSettingsSchema = z
  .object({
    defaults: shrinkageDefaultsSchema,
    expiryAlerts: z.boolean(),
    expiryAlertDays: z.number().int().refine((value) => (EXPIRY_ALERT_DAY_OPTIONS as readonly number[]).includes(value), 'Elige los días de la lista'),
  })
  .strict();

/** Asignar quién responde por una pérdida. `party: null` la deja sin asignar. */
export const assignLiabilitySchema = z
  .object({
    movementId: z.string().min(1).max(40),
    party: z.enum(LIABLE_PARTIES).nullable(),
    supplierId: z.string().min(1).max(40).nullable().optional(),
  })
  .strict()
  .refine((value) => value.party !== 'SUPPLIER' || Boolean(value.supplierId), { message: 'Elige el proveedor que responde', path: ['supplierId'] });

/** Confirmar las sugerencias de una bodega y período (los mismos filtros de la pantalla). */
export const applySuggestionsSchema = z
  .object({
    warehouseId: z.string().min(1).max(40),
    from: z.string().refine(isCalendarDay),
    to: z.string().refine(isCalendarDay),
    reason: z.enum(SHRINKAGE_REASON_KEYS).optional(),
  })
  .strict();
