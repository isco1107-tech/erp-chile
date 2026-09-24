import 'server-only';

/**
 * Cliente mínimo de la API v3 de Khipu (pago por transferencia bancaria en
 * Chile), sobre `fetch` y sin SDK — mismo criterio que `mailer.ts`: son dos
 * llamadas HTTP y no justifican sumar una dependencia.
 *
 * Docs: https://docs.khipu.com/portal/es/payment-api/ — autenticación con el
 * header `x-api-key` de la cuenta de cobro de cada empresa.
 *
 * Regla de seguridad del módulo: la notificación entrante de Khipu solo se
 * usa como "aviso" de que algo cambió. El estado real se obtiene SIEMPRE con
 * `getKhipuPayment` (autenticado con la API key de la empresa), así que un
 * POST falsificado a la URL de notificación no puede marcar nada como pagado.
 */

const KHIPU_API_BASE = process.env.KHIPU_API_BASE_URL?.replace(/\/$/, '') || 'https://payment-api.khipu.com';
const REQUEST_TIMEOUT_MS = 15_000;

export class KhipuApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface KhipuCreatePaymentInput {
  subject: string;
  amount: number;
  /** Id propio de la orden: vuelve en `transaction_id` y se contrasta al confirmar. */
  transactionId: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  expiresAt: Date;
  payerName: string;
  /** Opcional: un cliente de una factura puede no tener correo registrado. */
  payerEmail?: string;
  body?: string;
}

export interface KhipuCreatedPayment {
  paymentId: string;
  paymentUrl: string;
}

/** Subconjunto de la respuesta de `GET /v3/payments/{id}` que usa este módulo. */
export interface KhipuPayment {
  payment_id: string;
  status: string;
  status_detail?: string;
  amount: number;
  currency: string;
  transaction_id?: string;
  receipt_url?: string | null;
  bank?: string | null;
  payer_name?: string | null;
}

async function khipuFetch(apiKey: string, path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${KHIPU_API_BASE}${path}`, {
    ...init,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    // El detalle va a observabilidad desde quien llama; acá solo se conserva
    // el status para distinguir credencial inválida (401/403) de caída.
    const detail = await response.text().catch(() => '');
    throw new KhipuApiError(`Khipu respondió ${response.status}: ${detail.slice(0, 500)}`, response.status);
  }
  return response.json();
}

export async function createKhipuPayment(apiKey: string, input: KhipuCreatePaymentInput): Promise<KhipuCreatedPayment> {
  const json = (await khipuFetch(apiKey, '/v3/payments', {
    method: 'POST',
    body: JSON.stringify({
      subject: input.subject.slice(0, 255),
      currency: 'CLP',
      amount: input.amount,
      transaction_id: input.transactionId,
      body: input.body,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      notify_api_version: '3.0',
      expires_date: input.expiresAt.toISOString(),
      payer_name: input.payerName,
      payer_email: input.payerEmail,
      send_email: false,
      send_reminders: false,
    }),
  })) as { payment_id?: unknown; payment_url?: unknown };

  if (typeof json.payment_id !== 'string' || typeof json.payment_url !== 'string') {
    throw new KhipuApiError('Respuesta de Khipu sin payment_id/payment_url', 502);
  }
  return { paymentId: json.payment_id, paymentUrl: json.payment_url };
}

export async function getKhipuPayment(apiKey: string, paymentId: string): Promise<KhipuPayment> {
  const json = (await khipuFetch(apiKey, `/v3/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' })) as KhipuPayment;
  if (typeof json.payment_id !== 'string' || typeof json.status !== 'string') {
    throw new KhipuApiError('Respuesta de Khipu sin payment_id/status', 502);
  }
  return json;
}
