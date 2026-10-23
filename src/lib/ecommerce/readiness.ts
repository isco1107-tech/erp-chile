import type { StorePaymentProvider } from '@prisma/client';
import { usableProviders, type StorePaymentSetup } from './payment';

/**
 * «Qué le falta» para abrir la tienda al público. Mismo espíritu que la lista del
 * sitio: lo OBLIGATORIO bloquea la apertura (lo revisa el servidor, no el navegador)
 * y lo recomendado solo avisa. Puro.
 */

export interface StoreReadinessInput {
  /** Estado del sitio al que pertenece la tienda: la tienda solo se ve si el sitio está publicado. */
  siteStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  hasWarehouse: boolean;
  publishedProducts: number;
  /** Productos publicados que hoy no se pueden comprar (agotados). */
  soldOutProducts: number;
  pickupEnabled: boolean;
  pickupAddress: string;
  shippingEnabled: boolean;
  shippingRates: number;
  payment: StorePaymentSetup;
  termsText: string;
  supportPhone: string;
  /** Páginas del sitio cuya dirección choca con una ruta de la tienda (`tienda`, `carrito`…). */
  conflictingPages: string[];
}

export interface StoreReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint: string;
}

export interface StoreReadinessReport {
  items: StoreReadinessItem[];
  canOpen: boolean;
  missing: StoreReadinessItem[];
}

export function evaluateStoreReadiness(input: StoreReadinessInput): StoreReadinessReport {
  const providers: StorePaymentProvider[] = usableProviders(input.payment);
  const deliveryOk = (input.pickupEnabled && input.pickupAddress.trim().length > 0) || (input.shippingEnabled && input.shippingRates > 0);

  const items: StoreReadinessItem[] = [
    {
      key: 'site-published',
      label: 'El sitio está publicado',
      ok: input.siteStatus === 'PUBLISHED',
      required: true,
      hint: 'La tienda vive dentro del sitio: sin publicarlo nadie puede entrar a comprar.',
    },
    {
      key: 'warehouse',
      label: 'Elegiste la bodega de la que sale lo que vendes',
      ok: input.hasWarehouse,
      required: true,
      hint: 'Su stock es el que se muestra y el que se descuenta al cobrar.',
    },
    {
      key: 'products',
      label: 'Publicaste al menos un producto',
      ok: input.publishedProducts > 0,
      required: true,
      hint: 'En «Productos» elige cuáles del inventario se venden por internet.',
    },
    {
      key: 'payments',
      label: 'Tienes al menos un medio de pago funcionando',
      ok: providers.length > 0,
      required: true,
      hint: 'Enciende un medio y completa sus datos: Khipu necesita su llave, Webpay su código de comercio y llave, la transferencia tus datos bancarios.',
    },
    {
      key: 'delivery',
      label: 'Los compradores pueden recibir su pedido',
      ok: deliveryOk,
      required: true,
      hint: 'Habilita el retiro (con su dirección) o crea al menos una tarifa de despacho.',
    },
    {
      key: 'page-conflicts',
      label: 'Ninguna página del sitio usa una dirección de la tienda',
      ok: input.conflictingPages.length === 0,
      required: true,
      hint: input.conflictingPages.length ? `Cambia la dirección de: ${input.conflictingPages.map((slug) => `«${slug}»`).join(', ')}. La tienda usa tienda, producto, carrito, finalizar-compra y pedido.` : 'La tienda usa las direcciones tienda, producto, carrito, finalizar-compra y pedido.',
    },
    {
      key: 'terms',
      label: 'Escribiste los términos de la compra',
      ok: input.termsText.trim().length >= 40,
      required: false,
      hint: 'Despachos, cambios y devoluciones. El comprador los acepta al pagar y te protegen a ti.',
    },
    {
      key: 'support',
      label: 'Dejaste un teléfono o WhatsApp para dudas',
      ok: input.supportPhone.trim().length > 0,
      required: false,
      hint: 'Aparece en el carrito y en el seguimiento del pedido.',
    },
    {
      key: 'stock',
      label: 'Todo lo publicado tiene stock',
      ok: input.soldOutProducts === 0,
      required: false,
      hint: input.soldOutProducts ? `${input.soldOutProducts} ${input.soldOutProducts === 1 ? 'producto publicado está agotado' : 'productos publicados están agotados'}: se ven como «Agotado».` : 'Los agotados se ven como «Agotado» y no se pueden comprar.',
    },
  ];

  const missing = items.filter((item) => item.required && !item.ok);
  return { items, canOpen: missing.length === 0, missing };
}
