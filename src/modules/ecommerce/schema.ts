import { z } from 'zod';
import { PAYMENT_PROVIDERS, MAX_TRANSFER_HOLD_HOURS, MIN_TRANSFER_HOLD_HOURS } from '@/lib/ecommerce/payment';
import { shippingRatesSchema } from '@/lib/ecommerce/shipping';
import { PRODUCT_SLUG_RE } from '@/lib/ecommerce/slug';
import type { FulfillmentAction } from '@/lib/ecommerce/order-state';

const text = (max: number) => z.string().trim().max(max).default('');

/** Ajustes de la tienda de un sitio. `webpayApiSecret` vacío conserva el guardado; solo `clearWebpaySecret` lo borra. */
export const storeSettingsSchema = z.object({
  warehouseId: z.string().trim().min(1, 'Elige la bodega de la que sale lo que vendes').nullable(),
  notifyEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email('Escribe un correo válido').max(120)]).default(''),
  supportPhone: z.string().trim().max(30).regex(/^[\d\s()+-]*$/, 'El teléfono solo puede llevar números, espacios y +').default(''),
  pickupEnabled: z.boolean(),
  pickupAddress: text(200),
  pickupInstructions: text(300),
  shippingEnabled: z.boolean(),
  shippingRates: shippingRatesSchema,
  paymentMethods: z.array(z.enum(PAYMENT_PROVIDERS)).max(PAYMENT_PROVIDERS.length),
  bankTransferInfo: text(600),
  transferHoldHours: z.number().int().min(MIN_TRANSFER_HOLD_HOURS).max(MAX_TRANSFER_HOLD_HOURS),
  webpayCommerceCode: z.string().trim().max(20).regex(/^\d*$/, 'El código de comercio solo lleva números').default(''),
  webpayApiSecret: z.string().trim().max(200).default(''),
  clearWebpaySecret: z.boolean().default(false),
  webpayProduction: z.boolean(),
  invoiceEnabled: z.boolean(),
  termsText: text(6000),
  returnsText: text(6000),
  minOrderAmount: z.number().int().min(0).max(10_000_000),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

export const storeImageSchema = z.object({
  url: z.string().trim().min(1).max(500),
  alt: z.string().trim().max(160).default(''),
});

/** Ficha de venta de un producto publicado. */
export const storeProductSchema = z.object({
  title: text(120),
  summary: text(200),
  description: text(4000),
  images: z.array(storeImageSchema).max(8, 'Hasta 8 fotos por producto'),
  compareAtPrice: z.number().int().min(1).max(100_000_000).nullable(),
  collection: text(40),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
  maxPerOrder: z.number().int().min(1).max(99).nullable(),
  slug: z.string().trim().min(2).max(60).regex(PRODUCT_SLUG_RE, 'Usa solo minúsculas, números y guiones').optional(),
});

export type StoreProductInput = z.infer<typeof storeProductSchema>;

export const publishProductsSchema = z.object({
  productIds: z.array(z.string().trim().min(1).max(40)).min(1, 'Elige al menos un producto').max(200, 'Hasta 200 productos a la vez'),
  published: z.boolean(),
});

export const catalogListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  filter: z.enum(['all', 'published', 'unpublished']).default('all'),
  page: z.number().int().min(1).max(1000).default(1),
});

export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

export const FULFILLMENT_ACTIONS = ['PREPARE', 'READY_FOR_PICKUP', 'SHIP', 'DELIVER'] as const satisfies readonly FulfillmentAction[];

export const fulfillmentInputSchema = z.object({
  action: z.enum(FULFILLMENT_ACTIONS),
  carrier: z.string().trim().max(60).default(''),
  trackingNumber: z.string().trim().max(60).default(''),
  /** Enlace de seguimiento del transportista, pegado por el equipo. */
  trackingUrl: z.string().trim().max(500).default(''),
});

export type FulfillmentInput = z.infer<typeof fulfillmentInputSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Cuéntanos el motivo').max(300),
  /** El dinero ya se devolvió por fuera (pasarela o banco): el pedido queda «Reembolsado». */
  refunded: z.boolean().default(false),
  refundNote: z.string().trim().max(200).default(''),
});

export const orderListQuerySchema = z.object({
  siteId: z.string().trim().max(40).optional(),
  view: z.enum(['all', 'to-confirm', 'to-prepare', 'to-ship', 'attention', 'closed']).default('all'),
  q: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(1000).default(1),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const confirmPaymentSchema = z.object({
  /** Forma de pago con que se emite la venta en el ERP; vacío = la que corresponde al medio elegido. */
  method: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO']).optional(),
  /** Referencia del pago (número de transferencia, comprobante…). */
  note: z.string().trim().max(200).default(''),
});

export const refundSchema = z.object({
  note: z.string().trim().max(200).default(''),
});
