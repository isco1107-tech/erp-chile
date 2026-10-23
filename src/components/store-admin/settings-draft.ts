import type { StoreSettingsView } from '@/modules/ecommerce/services/store-settings.service';

/**
 * Borrador de los ajustes de la tienda: lo que se edita en las pestañas Envíos, Pagos y Ajustes. Se guarda
 * todo junto (el servidor valida el conjunto); la llave de Webpay nunca viaja desde el servidor: acá solo
 * existe lo que la persona escribe, y vacío conserva la guardada.
 */
export interface SettingsDraft {
  warehouseId: string;
  notifyEmail: string;
  supportPhone: string;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupInstructions: string;
  shippingEnabled: boolean;
  shippingRates: StoreSettingsView['shippingRates'];
  paymentMethods: StoreSettingsView['paymentMethods'];
  bankTransferInfo: string;
  transferHoldHours: number;
  webpayCommerceCode: string;
  webpayApiSecret: string;
  clearWebpaySecret: boolean;
  webpayProduction: boolean;
  invoiceEnabled: boolean;
  termsText: string;
  returnsText: string;
  minOrderAmount: number;
}

export function draftFrom(settings: StoreSettingsView): SettingsDraft {
  return {
    warehouseId: settings.warehouseId ?? '',
    notifyEmail: settings.notifyEmail,
    supportPhone: settings.supportPhone,
    pickupEnabled: settings.pickupEnabled,
    pickupAddress: settings.pickupAddress,
    pickupInstructions: settings.pickupInstructions,
    shippingEnabled: settings.shippingEnabled,
    shippingRates: settings.shippingRates,
    paymentMethods: settings.paymentMethods,
    bankTransferInfo: settings.bankTransferInfo,
    transferHoldHours: settings.transferHoldHours,
    webpayCommerceCode: settings.webpayCommerceCode,
    webpayApiSecret: '',
    clearWebpaySecret: false,
    webpayProduction: settings.webpayProduction,
    invoiceEnabled: settings.invoiceEnabled,
    termsText: settings.termsText,
    returnsText: settings.returnsText,
    minOrderAmount: settings.minOrderAmount,
  };
}

/** Lo que recibe `updateStoreSettingsAction`. */
export function inputFrom(draft: SettingsDraft) {
  return { ...draft, warehouseId: draft.warehouseId || null };
}

export function isDirty(settings: StoreSettingsView, draft: SettingsDraft): boolean {
  return JSON.stringify(draftFrom(settings)) !== JSON.stringify(draft);
}
