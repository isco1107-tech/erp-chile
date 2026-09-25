import { z } from 'zod';

export const DEPRECIATION_METHODS = ['LINEAL', 'ACELERADA', 'SIN_DEPRECIACION'] as const;
export const DEPRECIATION_METHOD_LABELS: Record<(typeof DEPRECIATION_METHODS)[number], string> = {
  LINEAL: 'Lineal (vida útil normal)',
  ACELERADA: 'Acelerada (1/3 de la vida útil)',
  SIN_DEPRECIACION: 'No se deprecia (terrenos)',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const fixedAssetSchema = z
  .object({
    code: z.string().trim().min(1, 'Asigna un código interno al bien').max(40),
    name: z.string().trim().min(2, 'Describe el bien').max(160),
    category: z.string().trim().min(2, 'Elige una categoría').max(120),
    description: optionalText(1000),
    location: optionalText(160),
    responsible: optionalText(160),
    acquisitionDate: z.coerce.date({ error: 'Indica la fecha de adquisición' }),
    depreciationStartDate: z.coerce.date().optional(),
    acquisitionCost: z.number().int('El costo debe ser un número entero').positive('El costo debe ser mayor a cero'),
    residualValue: z.number().int().min(0, 'El valor residual no puede ser negativo'),
    usefulLifeMonths: z.number().int().min(0).max(1200),
    method: z.enum(DEPRECIATION_METHODS),
    supplierContactId: optionalText(64),
    invoiceReference: optionalText(80),
    notes: optionalText(2000),
  })
  .refine((data) => data.residualValue < data.acquisitionCost, { message: 'El valor residual debe ser menor que el costo', path: ['residualValue'] })
  .refine((data) => data.method === 'SIN_DEPRECIACION' || data.usefulLifeMonths >= 12, {
    message: 'La vida útil debe ser de al menos 12 meses',
    path: ['usefulLifeMonths'],
  });

export const disposeAssetSchema = z.object({
  disposalDate: z.coerce.date({ error: 'Indica la fecha de baja' }),
  disposalAmount: z.number().int().min(0, 'El monto de venta no puede ser negativo'),
});

export const postDepreciationSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;
export type DisposeAssetInput = z.infer<typeof disposeAssetSchema>;

// ─── Mantenciones (Ola 6) ────────────────────────────────────────────────────

export const MAINTENANCE_KINDS = ['PREVENTIVE', 'CORRECTIVE', 'INSPECTION'] as const;
export const MAINTENANCE_KIND_LABELS: Record<(typeof MAINTENANCE_KINDS)[number], string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  INSPECTION: 'Inspección',
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const maintenanceSchema = z
  .object({
    date: isoDay,
    kind: z.enum(MAINTENANCE_KINDS),
    description: z.string().trim().min(3, 'Describe la mantención').max(500),
    cost: z.number().int('Monto en pesos enteros').min(0).max(10_000_000_000),
    provider: z.string().trim().max(120).optional(),
    nextDueDate: z.union([z.literal(''), isoDay]).optional(),
  })
  .refine((value) => !value.nextDueDate || value.nextDueDate > value.date, { path: ['nextDueDate'], message: 'La próxima mantención debe ser posterior' });

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
