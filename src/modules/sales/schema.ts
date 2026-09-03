import { z } from 'zod';

export const DTE_TYPES = [
  'COTIZACION',
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'BOLETA_EXENTA_41',
  'GUIA_DESPACHO_52',
  'NOTA_CREDITO_61',
  'NOTA_DEBITO_56',
] as const;

export const DTE_TYPE_LABELS: Record<(typeof DTE_TYPES)[number], string> = {
  COTIZACION: 'Cotización',
  FACTURA_33: 'Factura Electrónica',
  FACTURA_EXENTA_34: 'Factura Exenta Electrónica',
  BOLETA_39: 'Boleta Electrónica',
  BOLETA_EXENTA_41: 'Boleta Exenta Electrónica',
  GUIA_DESPACHO_52: 'Guía de Despacho Electrónica',
  NOTA_CREDITO_61: 'Nota de Crédito Electrónica',
  NOTA_DEBITO_56: 'Nota de Débito Electrónica',
};

/** Tipos de DTE que, al emitirse, descuentan stock automáticamente (salida de mercadería). */
export const STOCK_AFFECTING_DTE_TYPES: (typeof DTE_TYPES)[number][] = [
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'BOLETA_EXENTA_41',
  'GUIA_DESPACHO_52',
];

/** Tipos que no son documentos tributarios reales y por tanto no consumen folio SII. */
export const NON_FOLIO_DTE_TYPES: (typeof DTE_TYPES)[number][] = ['COTIZACION'];

/**
 * Tipos de DTE que representan una venta real y pueden generar un `Payment`
 * de caja cuando se cobran al contado.
 */
export const CASH_ELIGIBLE_DTE_TYPES: (typeof DTE_TYPES)[number][] = [
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'BOLETA_EXENTA_41',
  'NOTA_DEBITO_56',
];

export const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CREDITO_30'] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Tarjeta de Débito',
  TARJETA_CREDITO: 'Tarjeta de Crédito',
  CREDITO_30: 'Crédito 30 días',
};

export const salesDocumentItemSchema = z.object({
  productId: z.string().optional(),
  sku: z.string().optional(),
  description: z.string().min(1, 'La descripción es obligatoria'),
  quantity: z.number().min(0, 'La cantidad no puede ser negativa'),
  unitPrice: z.number().int('El precio debe ser un número entero').min(0, 'El precio no puede ser negativo'),
  isExempt: z.boolean().optional(),
  discountPercent: z.number().min(0, 'El descuento no puede ser negativo').max(100, 'El descuento no puede superar 100%').optional(),
});

export type SalesDocumentItemInput = z.infer<typeof salesDocumentItemSchema>;

export const salesDocumentCreateSchema = z.object({
  contactId: z.string().min(1, 'Seleccione un cliente'),
  warehouseId: z.string().min(1, 'Seleccione una bodega'),
  dteType: z.enum(DTE_TYPES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  dueDate: z.string().optional(),
  referenceFolio: z.number().int().positive().optional(),
  referenceType: z.enum(DTE_TYPES).optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  items: z.array(salesDocumentItemSchema).min(1, 'Agregue al menos un ítem'),
}).superRefine((value, ctx) => {
  if ((value.dteType === 'NOTA_CREDITO_61' || value.dteType === 'NOTA_DEBITO_56') && (!value.referenceFolio || !value.referenceType)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceFolio'], message: 'Las notas de crédito y débito requieren referencia al DTE original' });
  }
});

export type SalesDocumentCreateInput = z.infer<typeof salesDocumentCreateSchema>;
