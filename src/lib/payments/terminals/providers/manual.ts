import { z } from 'zod';
import { defineProvider } from '../define';
import { assertValidAmountClp } from '../sanitize';
import { TerminalOperationUnsupportedError, type TerminalPayment, type TerminalPaymentMethod } from '../types';

export const MANUAL_PROVIDER_ID = 'manual';

/**
 * Comportamiento actual del ERP: el cajero cobra en la máquina (de cualquier
 * marca) y confirma a mano. No recibe avisos ni consulta nada; existe para que
 * "manual" sea un proveedor más del registro y el flujo de reconciliación sea
 * el mismo que el de una máquina conectada.
 */
export const manualProvider = defineProvider({
  id: MANUAL_PROVIDER_ID,
  label: 'Manual (el cajero confirma)',
  description: 'La máquina no está conectada: el cajero cobra en el terminal y confirma el pago en el ERP.',
  capabilities: ['manual'],
  configSchema: z.object({}),
  fields: [],

  async createCharge(_config, input) {
    assertValidAmountClp(input.amountClp);
    return {
      externalId: null,
      status: 'PENDING',
      instructions: `Cobre ${input.amountClp} CLP en la máquina y confirme el pago en el ERP.`,
    };
  },

  parseWebhook() {
    return { ok: false, reason: 'UNSUPPORTED', message: 'El proveedor manual no recibe avisos' };
  },

  async fetchCharge() {
    throw new TerminalOperationUnsupportedError(MANUAL_PROVIDER_ID, 'fetchCharge');
  },
});

export interface ManualConfirmationInput {
  /** Clave de idempotencia de la confirmación (p. ej. la del request): reintentar no duplica. */
  confirmationId: string;
  amountClp: number;
  method?: TerminalPaymentMethod;
  reference?: string;
  last4?: string;
  authCode?: string;
  now?: Date;
}

/**
 * Convierte la confirmación del cajero en un `TerminalPayment` APPROVED para
 * pasarlo por el mismo `reconcileTerminalPayment` que el resto: el monto lo
 * digita una persona, así que igual se contrasta con la venta esperada.
 */
export function buildManualPayment(input: ManualConfirmationInput): TerminalPayment {
  assertValidAmountClp(input.amountClp);
  if (!input.confirmationId.trim()) throw new Error('Falta la clave de la confirmación manual');
  return {
    providerId: MANUAL_PROVIDER_ID,
    externalId: `manual:${input.confirmationId.trim()}`,
    amountClp: input.amountClp,
    currency: 'CLP',
    status: 'APPROVED',
    method: input.method ?? 'OTHER',
    last4: input.last4,
    authCode: input.authCode,
    reference: input.reference,
    occurredAt: input.now ?? new Date(),
    raw: { source: 'cashier-confirmation' },
  };
}
