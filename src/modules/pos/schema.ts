import { z } from 'zod';

/**
 * Medios de pago aceptados en el mostrador. Es un subconjunto de
 * `PAYMENT_METHODS` de ventas: en un POS no existe el crédito a 30 días, y
 * separar débito de crédito importa para el arqueo (ninguno entra al cajón).
 */
export const POS_PAYMENT_METHODS = ['EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA'] as const;

export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export const POS_PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA_DEBITO: 'Débito',
  TARJETA_CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transferencia',
};

/** Solo el efectivo entra físicamente al cajón y por tanto afecta el arqueo. */
export const CASH_PAYMENT_METHODS: PosPaymentMethod[] = ['EFECTIVO'];

/**
 * Tipos de DTE emitibles directamente desde la caja del supermercado:
 * - Boleta Electrónica Afecta (39) y Exenta (41)
 * - Factura Electrónica Afecta (33) y Exenta (34) cuando un cliente con RUT
 *   solicita factura en la caja.
 */
export const POS_DTE_TYPES = ['BOLETA_39', 'BOLETA_EXENTA_41', 'FACTURA_33', 'FACTURA_EXENTA_34'] as const;

export type PosDteType = (typeof POS_DTE_TYPES)[number];

export const POS_DTE_TYPE_LABELS: Record<PosDteType, string> = {
  BOLETA_39: 'Boleta Electrónica (39)',
  BOLETA_EXENTA_41: 'Boleta Exenta (41)',
  FACTURA_33: 'Factura Electrónica (33)',
  FACTURA_EXENTA_34: 'Factura Exenta (34)',
};

export const POS_DTE_SHORT_LABELS: Record<string, string> = {
  BOLETA_39: 'Boleta 39',
  BOLETA_EXENTA_41: 'Boleta Ex. 41',
  FACTURA_33: 'Factura 33',
  FACTURA_EXENTA_34: 'Factura Ex. 34',
  NOTA_CREDITO_61: 'Nota Crédito 61',
  NOTA_DEBITO_56: 'Nota Débito 56',
};

export const openShiftSchema = z.object({
  cashRegisterId: z.string().min(1, 'Seleccione una caja'),
  initialAmount: z
    .number()
    .int('El monto inicial debe ser un número entero')
    .min(0, 'El monto inicial no puede ser negativo'),
  openingNotes: z.string().max(300).optional().or(z.literal('')),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  // Lo que el cajero cuenta físicamente. El esperado NO lo envía el cliente: se
  // recalcula en el servidor, o el descuadre sería declarable por quien lo causa.
  actualAmount: z
    .number()
    .int('El monto contado debe ser un número entero')
    .min(0, 'El monto contado no puede ser negativo'),
  closingNotes: z.string().max(500).optional().or(z.literal('')),
});

export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(['INFLOW', 'OUTFLOW']),
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
  reason: z.string().min(3, 'Indique el motivo del movimiento').max(200),
});

export type CashMovementInput = z.infer<typeof cashMovementSchema>;

// `unitPrice`/`discountPercent` quedan opcionales a propósito: el terminal
// (`PosTerminal.tsx`) no los envía por defecto, y `pos.service.ts` ignora
// `unitPrice` siempre — el precio lo pone el servidor desde el catálogo o la
// lista de precios del cliente, nunca el cliente (evitaría vender a $1 desde
// la consola del navegador). Exigirlos aquí bloqueaba toda venta de mostrador
// con "Datos inválidos" antes de llegar al servicio.
export const posSaleItemSchema = z.object({
  productId: z.string().min(1, 'Producto inválido'),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  unitPrice: z.number().int('El precio debe ser un número entero').min(0, 'El precio no puede ser negativo').optional(),
  discountPercent: z.number().min(0).max(100).optional(),
});

export const posSaleSchema = z
  .object({
    items: z.array(posSaleItemSchema).min(1, 'Agregue al menos un producto'),
    paymentMethod: z.enum(POS_PAYMENT_METHODS, 'Selecciona una forma de pago'),
    /** Tipo de DTE a emitir en caja; por defecto `BOLETA_39`. */
    dteType: z.enum(POS_DTE_TYPES).optional(),
    /** Efectivo entregado por el cliente; sirve para calcular el vuelto. */
    cashReceived: z.number().int().min(0).optional(),
    /** RUT opcional del cliente en boletas, obligatorio en facturas. */
    customerRut: z.string().optional().or(z.literal('')),
    /** Datos opcionales del receptor (para crear/actualizar ficha al emitir Factura en caja). */
    customerName: z.string().max(120).optional().or(z.literal('')),
    customerGiro: z.string().max(120).optional().or(z.literal('')),
    customerAddress: z.string().max(150).optional().or(z.literal('')),
    customerComuna: z.string().max(60).optional().or(z.literal('')),
    notes: z.string().max(300).optional().or(z.literal('')),
    idempotencyKey: z.string().optional(),
  })
  // Sin este refinamiento, omitir `cashReceived` saltaba por completo la
  // comprobación de "efectivo suficiente" del servicio y la venta se registraba
  // como pagada en efectivo sin que nadie hubiera entregado dinero.
  .refine((data) => data.paymentMethod !== 'EFECTIVO' || data.cashReceived !== undefined, {
    message: 'Indique el efectivo recibido para una venta en efectivo',
    path: ['cashReceived'],
  })
  .refine(
    (data) => {
      if (data.dteType !== 'FACTURA_33' && data.dteType !== 'FACTURA_EXENTA_34') return true;
      const rut = data.customerRut?.trim() ?? '';
      return rut.length > 0 && rut.replace(/\D/g, '') !== '666666666';
    },
    {
      message: 'Para emitir Factura en caja debe indicar el RUT del cliente receptor',
      path: ['customerRut'],
    }
  );

export type PosSaleInput = z.infer<typeof posSaleSchema>;

export const cashRegisterCreateSchema = z.object({
  name: z.string().min(2, 'El nombre de la caja es obligatorio').max(60),
  warehouseId: z.string().min(1, 'Seleccione la bodega desde la que descuenta stock'),
});

export type CashRegisterCreateInput = z.infer<typeof cashRegisterCreateSchema>;

export const posCreditNoteSchema = z.object({
  originalDocumentId: z.string().min(1, 'Seleccione el documento original'),
  reason: z.string().min(3, 'Indique el motivo de la devolución').max(200),
  /** Si es `true`, registra un retiro de efectivo en el turno actual por el monto devuelto. */
  refundCashFromDrawer: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, 'Producto inválido'),
        quantity: z.number().positive('La cantidad a devolver debe ser mayor a cero'),
      })
    )
    .min(1, 'Seleccione al menos un producto a devolver')
    .optional(),
});

export type PosCreditNoteInput = z.infer<typeof posCreditNoteSchema>;
