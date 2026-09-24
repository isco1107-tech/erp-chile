import { z } from 'zod';
import { PAYMENT_METHODS } from '@/modules/sales/schema';
import { CONTRACT_DTE_TYPES } from '@/modules/contracts/schema';

/** Horas en decimal (1,5 = 1 h 30 min) a minutos enteros. */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** Minutos a "1 h 30 min" para mostrar. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Monto de un registro: horas × tarifa, redondeado a peso entero. */
export function entryAmount(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate);
}

export const timeEntrySchema = z.object({
  date: z.coerce.date('Indica la fecha'),
  minutes: z.number().int().min(1, 'Registra al menos 1 minuto').max(24 * 60, 'Un registro no puede superar 24 horas'),
  description: z.string().trim().min(2, 'Describe qué hiciste').max(500),
  contactId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  serviceContractId: z.string().min(1).optional(),
  billable: z.boolean().default(true),
  hourlyRate: z.number().int().min(0).max(10_000_000).default(0),
  /** Solo quien tiene `timesheets:manage` puede registrar a nombre de otra persona. */
  userId: z.string().min(1).optional(),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;

export const timeEntryFilterSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  userId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  onlyUnbilled: z.boolean().optional(),
});

export type TimeEntryFilter = z.infer<typeof timeEntryFilterSchema>;

export const billTimeEntriesSchema = z.object({
  contactId: z.string().min(1, 'Elige el cliente'),
  entryIds: z.array(z.string().min(1)).min(1, 'Selecciona al menos un registro').max(500),
  dteType: z.enum(CONTRACT_DTE_TYPES).default('FACTURA_33'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CREDITO_30'),
  /** Una línea por registro, o una sola línea con el total de horas. */
  grouping: z.enum(['PER_ENTRY', 'SINGLE_LINE']).default('PER_ENTRY'),
  isExempt: z.boolean().default(false),
});

export type BillTimeEntriesInput = z.infer<typeof billTimeEntriesSchema>;
