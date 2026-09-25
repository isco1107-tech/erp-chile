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
  /** Línea de la nota de venta que esta línea factura o despacha. */
  salesOrderItemId: z.string().optional(),
});

export type SalesDocumentItemInput = z.infer<typeof salesDocumentItemSchema>;

export const salesDocumentCreateSchema = z.object({
  contactId: z.string().min(1, 'Seleccione un cliente'),
  warehouseId: z.string().min(1, 'Seleccione una bodega'),
  dteType: z.enum(DTE_TYPES, 'Selecciona un tipo de documento'),
  paymentMethod: z.enum(PAYMENT_METHODS, 'Selecciona una forma de pago'),
  dueDate: z.string().optional(),
  referenceFolio: z.number().int().positive().optional(),
  referenceType: z.enum(DTE_TYPES, 'Selecciona el tipo de documento de referencia').optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  /** Nota de venta desde la que se emite (facturación o despacho parcial). */
  salesOrderId: z.string().optional(),
  /** Vendedor al que se atribuye la venta; por defecto, quien la emite. */
  sellerId: z.string().optional(),
  items: z.array(salesDocumentItemSchema).min(1, 'Agregue al menos un ítem'),
}).superRefine((value, ctx) => {
  if ((value.dteType === 'NOTA_CREDITO_61' || value.dteType === 'NOTA_DEBITO_56') && (!value.referenceFolio || !value.referenceType)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceFolio'], message: 'Las notas de crédito y débito requieren referencia al DTE original' });
  }
});

export type SalesDocumentCreateInput = z.infer<typeof salesDocumentCreateSchema>;

// ─── Notas de venta ──────────────────────────────────────────────────────────

export const salesOrderItemSchema = salesDocumentItemSchema.omit({ salesOrderItemId: true }).extend({
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
});

export const salesOrderCreateSchema = z.object({
  contactId: z.string().min(1, 'Seleccione un cliente'),
  warehouseId: z.string().min(1, 'Seleccione una bodega'),
  paymentMethod: z.enum(PAYMENT_METHODS, 'Selecciona una forma de pago'),
  deliveryDate: z.string().optional(),
  notes: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  sellerId: z.string().optional(),
  /** Cotización de origen, si la nota nace de una. */
  quoteId: z.string().optional(),
  items: z.array(salesOrderItemSchema).min(1, 'Agregue al menos un ítem'),
});

export type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;

export const salesOrderCloseSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo').max(255, 'Máximo 255 caracteres'),
});

// ─── Listas de precios ───────────────────────────────────────────────────────

export const priceListSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  isActive: z.boolean().default(true),
});

export type PriceListInput = z.infer<typeof priceListSchema>;

export const priceListItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1),
      minQuantity: z.number().positive('La cantidad mínima debe ser mayor a cero').default(1),
      netPrice: z.number().int('El precio debe ser un número entero').min(0, 'El precio no puede ser negativo'),
    })
  )
  .max(20_000, 'Demasiadas filas en una sola lista')
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const key = `${row.productId}:${row.minQuantity}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index, 'minQuantity'], message: 'Hay dos precios para el mismo producto y cantidad mínima' });
      seen.add(key);
    });
  });

export type PriceListItemsInput = z.infer<typeof priceListItemsSchema>;

export const priceListBulkSchema = z.object({
  /** Ajuste sobre el precio base del catálogo: -12 = 12% menos. */
  percent: z.number().min(-90, 'El descuento máximo es 90%').max(500, 'El recargo máximo es 500%'),
  categoryId: z.string().optional(),
});

// ─── Comisiones ──────────────────────────────────────────────────────────────

export const commissionRateSchema = z.object({
  userId: z.string().min(1, 'Selecciona un vendedor'),
  ratePercent: z.number().min(0, 'La comisión no puede ser negativa').max(50, 'La comisión máxima es 50%'),
  basis: z.enum(['ISSUED', 'COLLECTED']).default('ISSUED'),
});

export type CommissionRateInput = z.infer<typeof commissionRateSchema>;
