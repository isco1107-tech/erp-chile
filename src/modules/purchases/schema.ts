import { z } from 'zod';

export const PURCHASE_DOCUMENT_TYPES = ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'GUIA_DESPACHO', 'OTRO'] as const;

export const PURCHASE_DOCUMENT_TYPE_LABELS: Record<(typeof PURCHASE_DOCUMENT_TYPES)[number], string> = {
  FACTURA: 'Factura',
  BOLETA: 'Boleta',
  NOTA_CREDITO: 'Nota de Crédito',
  NOTA_DEBITO: 'Nota de Débito',
  GUIA_DESPACHO: 'Guía de Despacho',
  OTRO: 'Otro',
};

/**
 * Efecto de cada tipo de documento de compra sobre el inventario.
 *
 * - `IN`: recepción de mercadería. Entra a stock y recalcula el PMP.
 * - `OUT`: devolución al proveedor. Sale al PMP vigente, que no se altera —
 *   promediar de nuevo una salida corrompería el costo.
 * - `NONE`: el documento no mueve unidades. Una Nota de Débito de proveedor
 *   corrige precio, no cantidad, y aplicarla como entrada inflaría el stock.
 *
 * Vive en el esquema para que el formulario y el servicio compartan la misma
 * regla: la UI oculta el selector de producto donde no corresponde y el
 * servicio la vuelve a imponer.
 */
export const PURCHASE_STOCK_DIRECTION = {
  FACTURA: 'IN',
  BOLETA: 'IN',
  GUIA_DESPACHO: 'IN',
  NOTA_CREDITO: 'OUT',
  NOTA_DEBITO: 'NONE',
  OTRO: 'NONE',
} as const satisfies Record<(typeof PURCHASE_DOCUMENT_TYPES)[number], 'IN' | 'OUT' | 'NONE'>;

/**
 * Tipos de documento de compra que pueden ser el original que una Nota de
 * Crédito corrige (los que sí agregaron stock/deuda). El folio de compra es
 * único por `(companyId, contactId, documentType, folio)` (N-17): el mismo
 * número de folio puede pertenecer a la vez a una Factura, una Boleta y una
 * Nota de Crédito/Débito del mismo proveedor, así que buscar el documento
 * referenciado solo por folio puede encontrar el tipo equivocado. Acotar a
 * estos tipos evita que una NC "encuentre" otra NC/ND/OTRO con el mismo
 * folio en vez del documento que en verdad originó la deuda.
 */
export const PURCHASE_CREDITABLE_DOCUMENT_TYPES: (typeof PURCHASE_DOCUMENT_TYPES)[number][] = (
  Object.keys(PURCHASE_STOCK_DIRECTION) as (typeof PURCHASE_DOCUMENT_TYPES)[number][]
).filter((type) => PURCHASE_STOCK_DIRECTION[type] === 'IN');

export const purchaseDocumentItemSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria'),
  // Enlazar la línea a un producto es lo que dispara la entrada de stock y el
  // recálculo de PMP. Sin productId la línea es puro gasto (servicio, flete).
  productId: z.string().optional(),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  unitCost: z.number().int('El costo debe ser un número entero').min(0, 'El costo no puede ser negativo'),
  isExempt: z.boolean().optional(),
  // Solo cuando la factura referencia una Orden de Compra (`purchaseOrderId`
  // a nivel de documento): a qué línea de la OC corresponde, para el
  // matching de 3 vías. Explícito en vez de auto-matchear por productId
  // porque una OC puede tener dos líneas del mismo producto.
  purchaseOrderItemId: z.string().optional(),
});

export type PurchaseDocumentItemInput = z.infer<typeof purchaseDocumentItemSchema>;

export const purchaseDocumentCreateSchema = z.object({
  contactId: z.string().min(1, 'Seleccione un proveedor'),
  // Bodega de recepción: destino de las líneas que sí enlazan producto.
  warehouseId: z.string().optional(),
  documentType: z.enum(PURCHASE_DOCUMENT_TYPES, 'Selecciona un tipo de documento'),
  folio: z.string().min(1, 'Ingrese el folio del documento del proveedor'),
  // Folio del documento original que esta NC/ND corrige, del mismo proveedor.
  referenceFolio: z.string().optional(),
  issueDate: z.string().min(1, 'Ingrese la fecha de emisión'),
  dueDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseDocumentItemSchema).min(1, 'Agregue al menos un ítem'),
  // Presente solo cuando la factura formaliza una Orden de Compra ya
  // recibida: activa el matching de 3 vías y suprime el movimiento de stock
  // (la Recepción de Mercadería ya lo aplicó).
  purchaseOrderId: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.documentType === 'NOTA_CREDITO' && !value.referenceFolio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceFolio'],
      message: 'Una Nota de Crédito de proveedor requiere el folio de la compra que corrige',
    });
  }
  if (value.documentType === 'NOTA_CREDITO' && value.purchaseOrderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['purchaseOrderId'],
      message: 'Una Nota de Crédito no puede referenciar una Orden de Compra',
    });
  }
});

export type PurchaseDocumentCreateInput = z.infer<typeof purchaseDocumentCreateSchema>;

export const purchaseOrderItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1, 'La descripción es obligatoria'),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  unitCost: z.number().int('El costo debe ser un número entero').min(0, 'El costo no puede ser negativo'),
});

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderCreateSchema = z.object({
  contactId: z.string().min(1, 'Seleccione un proveedor'),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemSchema).min(1, 'Agregue al menos un ítem'),
});

export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

export const goodsReceiptItemSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  /** Solo productos con lotes: lote y vencimiento de lo recibido. */
  lotNumber: z.string().trim().max(40, 'El lote admite máximo 40 caracteres').optional(),
  expiryDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida')]).optional(),
});

export type GoodsReceiptItemInput = z.infer<typeof goodsReceiptItemSchema>;

export const goodsReceiptCreateSchema = z.object({
  orderId: z.string().min(1, 'Seleccione una orden de compra'),
  warehouseId: z.string().min(1, 'Seleccione una bodega'),
  notes: z.string().optional(),
  items: z.array(goodsReceiptItemSchema).min(1, 'Agregue al menos un ítem a recibir'),
});

export type GoodsReceiptCreateInput = z.infer<typeof goodsReceiptCreateSchema>;

// ─── Solicitudes de compra y cotizaciones (Ola 6) ────────────────────────────

export const PURCHASE_REQUEST_STATUS_LABELS = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Por aprobar',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  ORDERED: 'Con OC',
  CANCELLED: 'Anulada',
} as const;

const isoDay = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')]).optional();

export const purchaseRequestItemSchema = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().trim().min(1, 'Describe qué se necesita').max(200),
  quantity: z.number().positive('La cantidad debe ser mayor a cero').max(1_000_000),
  unit: z.string().trim().max(20).optional(),
});

export const purchaseRequestSchema = z.object({
  title: z.string().trim().min(3, 'Ponle un título a la solicitud').max(120),
  neededBy: isoDay,
  notes: z.string().trim().max(1000).optional(),
  items: z.array(purchaseRequestItemSchema).min(1, 'Agrega al menos un ítem').max(100, 'Máximo 100 ítems por solicitud'),
});

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export const supplierQuoteSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el proveedor'),
  quoteNumber: z.string().trim().max(40).optional(),
  validUntil: isoDay,
  leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
  paymentTerms: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(z.object({ requestItemId: z.string().min(1), unitCost: z.number().int('Precio en pesos enteros').min(0).max(1_000_000_000) }))
    .min(1, 'Ingresa el precio de al menos un ítem'),
});

export type SupplierQuoteInput = z.infer<typeof supplierQuoteSchema>;

/** Adjudicación: ítem de la solicitud → cotización elegida. */
export const purchaseAwardSchema = z.object({
  award: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0, 'Adjudica al menos un ítem'),
  expectedDate: isoDay,
});

// ─── Importaciones (Ola 6) ───────────────────────────────────────────────────

export const IMPORT_STATUS_LABELS = { OPEN: 'Abierta', CLOSED: 'Ingresada', CANCELLED: 'Anulada' } as const;
export const IMPORT_CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'JPY', 'BRL', 'ARS', 'MXN'] as const;
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;

export const importShipmentSchema = z.object({
  reference: z.string().trim().min(2, 'Indica una referencia (N° de embarque, BL o proforma)').max(60),
  contactId: z.string().min(1).nullable().optional(),
  currency: z.enum(IMPORT_CURRENCIES),
  exchangeRate: z.number().positive('El tipo de cambio debe ser mayor a cero').max(100_000),
  incoterm: z.enum(INCOTERMS).nullable().optional(),
  dinNumber: z.string().trim().max(30).optional(),
  arrivalDate: isoDay,
  warehouseId: z.string().min(1).nullable().optional(),
  allocationMethod: z.enum(['VALUE', 'QUANTITY']),
  notes: z.string().trim().max(1000).optional(),
});

export type ImportShipmentInput = z.infer<typeof importShipmentSchema>;

export const importItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1, 'Selecciona el producto'),
      quantity: z.number().positive('La cantidad debe ser mayor a cero').max(10_000_000),
      unitPriceForeign: z.number().min(0, 'El precio no puede ser negativo').max(100_000_000),
    })
  )
  .max(300, 'Máximo 300 productos por carpeta');

export const importCostsSchema = z
  .array(
    z.object({
      kind: z.enum(['FREIGHT', 'INSURANCE', 'DUTY', 'CUSTOMS_AGENT', 'PORT', 'TRANSPORT', 'OTHER']),
      description: z.string().trim().min(1, 'Describe el costo').max(120),
      amount: z.number().int('Monto en pesos enteros').min(0).max(10_000_000_000),
      purchaseDocumentId: z.string().min(1).nullable().optional(),
    })
  )
  .max(50);
