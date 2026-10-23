import { z } from 'zod';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from './cart';
import { PAYMENT_PROVIDERS } from './payment';
import { shippingAddressSchema } from './shipping';

/**
 * Lo que el comprador manda al pagar. El cuerpo se acota acá; el SERVIDOR vuelve a
 * leer el catálogo, el stock, las tarifas y los medios de pago de la tienda: del
 * navegador solo se toman productos, cantidades y datos de contacto. Nunca precios.
 */

export const checkoutLineSchema = z.object({
  productId: z.string().trim().min(1).max(40),
  quantity: z.number().int().min(1, 'La cantidad mínima es 1').max(MAX_LINE_QUANTITY, `Máximo ${MAX_LINE_QUANTITY} unidades por producto`),
});

export const quoteSchema = z.object({
  lines: z.array(checkoutLineSchema).max(MAX_CART_LINES).default([]),
  /** Región elegida para calcular el despacho (opcional: sin ella no se ofrecen tarifas). */
  region: z.string().trim().max(80).optional(),
  /** Forma de entrega y tarifa elegidas: con ellas el total incluye el despacho. */
  deliveryMethod: z.enum(['SHIPPING', 'PICKUP']).optional(),
  shippingRateId: z.string().trim().max(40).optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

const rutField = z
  .string()
  .trim()
  .max(14)
  .refine((value) => validateRut(value), 'El RUT no es válido')
  .transform((value) => formatRut(cleanRut(value)));

const optionalRut = z.union([z.literal(''), rutField]).optional();

export const billingSchema = z.object({
  rut: rutField,
  razonSocial: z.string().trim().min(2, 'Escribe la razón social').max(120),
  giro: z.string().trim().min(2, 'Escribe el giro').max(120),
  address: z.string().trim().min(4, 'Escribe la dirección de la empresa').max(160),
  comuna: z.string().trim().min(2, 'Escribe la comuna').max(60),
});

export const customerSchema = z.object({
  name: z.string().trim().min(3, 'Escribe tu nombre completo').max(80),
  email: z.string().trim().toLowerCase().email('Escribe un correo válido').max(120),
  phone: z
    .string()
    .trim()
    .min(7, 'Escribe un teléfono de contacto')
    .max(20)
    .regex(/^\+?[\d\s()-]{7,20}$/, 'El teléfono solo puede llevar números, espacios y +'),
  rut: optionalRut,
});

export const checkoutSchema = z
  .object({
    /** Lo genera el navegador una vez por intento de compra: reintentar no duplica el pedido. */
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Clave de compra inválida'),
    lines: z.array(checkoutLineSchema).min(1, 'Tu carrito está vacío').max(MAX_CART_LINES),
    customer: customerSchema,
    documentType: z.enum(['BOLETA', 'FACTURA']).default('BOLETA'),
    billing: billingSchema.optional(),
    deliveryMethod: z.enum(['SHIPPING', 'PICKUP']),
    address: shippingAddressSchema.optional(),
    shippingRateId: z.string().trim().max(40).optional(),
    paymentProvider: z.enum(PAYMENT_PROVIDERS, 'Elige cómo quieres pagar'),
    notes: z.string().trim().max(300, 'Las indicaciones pueden tener hasta 300 caracteres').optional(),
    acceptTerms: z.literal(true, 'Debes aceptar los términos de la compra'),
    /** Señuelo anti-bots: una persona lo deja vacío. */
    website: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.deliveryMethod === 'SHIPPING') {
      if (!value.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Escribe la dirección de despacho' });
      if (!value.shippingRateId) ctx.addIssue({ code: 'custom', path: ['shippingRateId'], message: 'Elige cómo quieres recibir tu pedido' });
    }
    if (value.documentType === 'FACTURA' && !value.billing) {
      ctx.addIssue({ code: 'custom', path: ['billing'], message: 'Para factura necesitamos los datos de la empresa' });
    }
    const ids = value.lines.map((line) => line.productId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Hay productos repetidos en el carrito' });
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Clave de intento de compra para el navegador (se guarda con el carrito y se renueva al cambiarlo). */
export function newIdempotencyKey(random: () => string): string {
  return `ck_${random().replace(/[^A-Za-z0-9]/g, '').slice(0, 40).padEnd(16, '0')}`;
}
