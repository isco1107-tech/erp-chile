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

export const posSaleItemSchema = z.object({
  productId: z.string().min(1, 'Producto inválido'),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  unitPrice: z.number().int('El precio debe ser un número entero').min(0, 'El precio no puede ser negativo'),
  discountPercent: z.number().min(0).max(100).optional(),
});

export const posSaleSchema = z
  .object({
    items: z.array(posSaleItemSchema).min(1, 'Agregue al menos un producto'),
    paymentMethod: z.enum(POS_PAYMENT_METHODS, 'Selecciona una forma de pago'),
    /** Efectivo entregado por el cliente; sirve para calcular el vuelto. */
    cashReceived: z.number().int().min(0).optional(),
    /** RUT opcional del cliente. Sin él la boleta va al receptor genérico del SII. */
    customerRut: z.string().optional().or(z.literal('')),
    idempotencyKey: z.string().optional(),
  })
  // Sin este refinamiento, omitir `cashReceived` saltaba por completo la
  // comprobación de "efectivo suficiente" del servicio y la venta se registraba
  // como pagada en efectivo sin que nadie hubiera entregado dinero.
  .refine((data) => data.paymentMethod !== 'EFECTIVO' || data.cashReceived !== undefined, {
    message: 'Indique el efectivo recibido para una venta en efectivo',
    path: ['cashReceived'],
  });

export type PosSaleInput = z.infer<typeof posSaleSchema>;

export const cashRegisterCreateSchema = z.object({
  name: z.string().min(2, 'El nombre de la caja es obligatorio').max(60),
  warehouseId: z.string().min(1, 'Seleccione la bodega desde la que descuenta stock'),
});

export type CashRegisterCreateInput = z.infer<typeof cashRegisterCreateSchema>;
