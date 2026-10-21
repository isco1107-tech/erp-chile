import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const PROCEDURE_CATEGORIES = ['OPERACION', 'CALIDAD', 'HIGIENE', 'VENTAS', 'ADMINISTRACION', 'INDUCCION'] as const;
export const PROCEDURE_CATEGORY_LABELS: Record<(typeof PROCEDURE_CATEGORIES)[number], string> = {
  OPERACION: 'Operación',
  CALIDAD: 'Calidad',
  HIGIENE: 'Higiene',
  VENTAS: 'Ventas y despacho',
  ADMINISTRACION: 'Administración',
  INDUCCION: 'Inducción',
};

export const PROCEDURE_STATUS_LABELS = { DRAFT: 'Borrador', ACTIVE: 'Vigente', ARCHIVED: 'Archivado' } as const;

export const INSPECTION_KINDS = ['INCOMING', 'IN_PROCESS', 'FINISHED'] as const;
export const INSPECTION_KIND_LABELS: Record<(typeof INSPECTION_KINDS)[number], string> = {
  INCOMING: 'Recepción de materia prima',
  IN_PROCESS: 'Durante el proceso',
  FINISHED: 'Producto terminado',
};

export const SUPPLIER_TYPES = ['PRODUCTOR', 'PROVEEDOR_INSUMOS', 'ENVASES', 'TRANSPORTE', 'OTRO'] as const;
export const SUPPLIER_TYPE_LABELS: Record<(typeof SUPPLIER_TYPES)[number], string> = {
  PRODUCTOR: 'Productor agrícola',
  PROVEEDOR_INSUMOS: 'Proveedor de insumos',
  ENVASES: 'Envases y etiquetas',
  TRANSPORTE: 'Transporte',
  OTRO: 'Otro',
};

export const procedureSchema = z.object({
  title: z.string().trim().min(3, 'Ponle un título al procedimiento').max(120),
  category: z.enum(PROCEDURE_CATEGORIES),
  summary: optionalText(200),
  content: z.string().trim().min(10, 'Escribe los pasos del procedimiento').max(8000, 'Máximo 8.000 caracteres'),
  reviewEveryDays: z.number().int('Días enteros').min(7, 'Mínimo 7 días').max(730, 'Máximo 730 días').nullable().optional(),
});
export type ProcedureInput = z.infer<typeof procedureSchema>;

export const qualityParameterSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{2,40}$/, 'Identificador inválido'),
    name: z.string().trim().min(2, 'Nombra el parámetro').max(80),
    type: z.enum(['NUMBER', 'CHECK']),
    unit: z.string().trim().max(12).optional(),
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
    required: z.boolean(),
  })
  .refine((p) => p.min == null || p.max == null || p.min <= p.max, { message: 'El mínimo no puede ser mayor que el máximo' });

export const templateSchema = z.object({
  name: z.string().trim().min(3, 'Ponle un nombre a la plantilla').max(80),
  kind: z.enum(INSPECTION_KINDS),
  parameters: z
    .array(qualityParameterSchema)
    .min(1, 'Agrega al menos un parámetro')
    .max(30, 'Máximo 30 parámetros')
    .refine((list) => new Set(list.map((p) => p.key)).size === list.length, { message: 'Hay parámetros repetidos' }),
  isActive: z.boolean().default(true),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const inspectionSchema = z.object({
  templateId: z.string().min(1, 'Elige la plantilla'),
  productId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  lotNumber: z.string().trim().max(60).optional(),
  values: z.record(z.string(), z.union([z.number().finite(), z.boolean(), z.null()])),
  notes: optionalText(1000),
  correctiveAction: optionalText(1000),
});
export type InspectionInput = z.infer<typeof inspectionSchema>;

export const supplierProfileSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el productor o proveedor'),
  supplierType: z.enum(SUPPLIER_TYPES),
  suppliedProducts: optionalText(300),
  certifications: optionalText(300),
  isLocalProducer: z.boolean().default(true),
  isActive: z.boolean().default(true),
  notes: optionalText(1000),
});
export type SupplierProfileInput = z.infer<typeof supplierProfileSchema>;
