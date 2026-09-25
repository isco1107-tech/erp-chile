import { z } from 'zod';
import { SERVICE_STATUSES } from '@/lib/service/tickets';

export const SERVICE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export const SERVICE_PRIORITY_LABELS: Record<(typeof SERVICE_PRIORITIES)[number], string> = { LOW: 'Baja', NORMAL: 'Normal', HIGH: 'Urgente' };

const isoDay = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')]).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const serviceTicketSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el cliente'),
  equipment: z.string().trim().min(2, 'Describe el equipo').max(120),
  brand: optionalText(60),
  model: optionalText(60),
  serialNumber: optionalText(60),
  accessories: optionalText(200),
  reportedIssue: z.string().trim().min(3, 'Describe la falla que reporta el cliente').max(1000),
  priority: z.enum(SERVICE_PRIORITIES),
  promisedDate: isoDay,
  warranty: z.boolean().default(false),
  technicianId: z.string().min(1).nullable().optional(),
  notes: optionalText(1000),
});

export type ServiceTicketInput = z.infer<typeof serviceTicketSchema>;

export const serviceDiagnosisSchema = z.object({
  diagnosis: z.string().trim().max(2000),
  technicianId: z.string().min(1).nullable().optional(),
  promisedDate: isoDay,
  priority: z.enum(SERVICE_PRIORITIES),
});

export const serviceLinesSchema = z
  .array(
    z.object({
      kind: z.enum(['PART', 'LABOR']),
      productId: z.string().min(1).nullable().optional(),
      description: z.string().trim().min(1, 'Describe la línea').max(160),
      quantity: z.number().positive('Cantidad mayor a cero').max(100_000),
      unitPrice: z.number().int('Precio en pesos enteros').min(0).max(1_000_000_000),
    })
  )
  .max(60);

export const serviceStatusSchema = z.object({
  status: z.enum(SERVICE_STATUSES),
  note: z.string().trim().max(1000).optional(),
  visibleToCustomer: z.boolean().default(true),
});

export const serviceNoteSchema = z.object({
  note: z.string().trim().min(1, 'Escribe la nota').max(1000),
  visibleToCustomer: z.boolean().default(false),
});

export const serviceBillingSchema = z.object({
  warehouseId: z.string().min(1, 'Elige la bodega desde donde salen los repuestos'),
  paymentMethod: z.string().min(1),
});

export const publicEstimateDecisionSchema = z.object({
  approve: z.boolean(),
  comment: z.string().trim().max(500).optional(),
});
