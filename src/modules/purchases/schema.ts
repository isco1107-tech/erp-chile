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
});

export type GoodsReceiptItemInput = z.infer<typeof goodsReceiptItemSchema>;

export const goodsReceiptCreateSchema = z.object({
  orderId: z.string().min(1, 'Seleccione una orden de compra'),
  warehouseId: z.string().min(1, 'Seleccione una bodega'),
  notes: z.string().optional(),
  items: z.array(goodsReceiptItemSchema).min(1, 'Agregue al menos un ítem a recibir'),
});

export type GoodsReceiptCreateInput = z.infer<typeof goodsReceiptCreateSchema>;
