import type { StoreDeliveryMethod, StorePaymentProvider } from '@prisma/client';

/**
 * Medios de pago de la tienda. Dos familias:
 *  - en línea (Khipu, Webpay Plus): el pago se confirma SOLO consultando a la pasarela,
 *    con monto y referencia exactos; ni el aviso ni el regreso del navegador se creen;
 *  - manuales (transferencia, pago al retirar): el pedido queda esperando y una persona
 *    del equipo confirma el pago.
 */

export const PAYMENT_PROVIDERS = ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'] as const satisfies readonly StorePaymentProvider[];

export interface PaymentProviderInfo {
  label: string;
  /** Lo que lee el comprador al elegirlo. */
  description: string;
  online: boolean;
}

export const PAYMENT_PROVIDER_INFO: Record<StorePaymentProvider, PaymentProviderInfo> = {
  KHIPU: { label: 'Transferencia con Khipu', description: 'Pagas desde la app de tu banco; se confirma en minutos.', online: true },
  WEBPAY: { label: 'Tarjeta (Webpay Plus)', description: 'Débito, crédito o prepago, en el sitio seguro de Transbank.', online: true },
  TRANSFER: { label: 'Transferencia bancaria', description: 'Te mostramos los datos; el pedido se confirma cuando recibimos tu pago.', online: false },
  PAY_ON_PICKUP: { label: 'Pagar al retirar', description: 'Reservamos tu pedido y pagas cuando lo retiras.', online: false },
};

/** Minutos que se guarda el stock de un pedido que se paga en línea. */
export const ONLINE_HOLD_MINUTES = 60;

/** Horas por omisión (y límites) del stock guardado para pagos manuales. */
export const DEFAULT_TRANSFER_HOLD_HOURS = 48;
export const MIN_TRANSFER_HOLD_HOURS = 1;
export const MAX_TRANSFER_HOLD_HOURS = 24 * 14;

export function holdMinutes(provider: StorePaymentProvider, transferHoldHours: number): number {
  if (PAYMENT_PROVIDER_INFO[provider].online) return ONLINE_HOLD_MINUTES;
  const hours = Math.min(MAX_TRANSFER_HOLD_HOURS, Math.max(MIN_TRANSFER_HOLD_HOURS, Math.floor(transferHoldHours) || DEFAULT_TRANSFER_HOLD_HOURS));
  return hours * 60;
}

export interface StorePaymentSetup {
  /** Medios que la empresa dejó encendidos. */
  enabled: readonly StorePaymentProvider[];
  /** La empresa tiene su llave de Khipu guardada. */
  khipuConfigured: boolean;
  /** Webpay Plus con código de comercio y llave. */
  webpayConfigured: boolean;
  bankTransferInfo: string | null;
  pickupEnabled: boolean;
}

/** Medios que de verdad se pueden ofrecer: encendidos Y con lo necesario para funcionar. */
export function usableProviders(setup: StorePaymentSetup, delivery: StoreDeliveryMethod | null = null): StorePaymentProvider[] {
  return PAYMENT_PROVIDERS.filter((provider) => {
    if (!setup.enabled.includes(provider)) return false;
    switch (provider) {
      case 'KHIPU':
        return setup.khipuConfigured;
      case 'WEBPAY':
        return setup.webpayConfigured;
      case 'TRANSFER':
        return Boolean(setup.bankTransferInfo?.trim());
      case 'PAY_ON_PICKUP':
        return setup.pickupEnabled && delivery !== 'SHIPPING';
    }
  });
}

/** Lee `paymentMethods` guardado (JSON): solo medios conocidos, sin repetir. */
export function parsePaymentMethods(raw: unknown): StorePaymentProvider[] {
  if (!Array.isArray(raw)) return [];
  return PAYMENT_PROVIDERS.filter((provider) => raw.includes(provider));
}
