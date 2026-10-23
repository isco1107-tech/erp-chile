import 'server-only';

/**
 * Cliente mínimo de la API REST de Webpay Plus (Transbank, v1.2), sobre `fetch` y sin
 * SDK — mismo criterio que `khipu.ts`: son tres llamadas HTTP.
 *
 * Docs: https://www.transbankdevelopers.cl/referencia/webpay — autenticación con los
 * headers `Tbk-Api-Key-Id` (código de comercio) y `Tbk-Api-Key-Secret` de cada empresa.
 * El ambiente de integración (pruebas) y el de producción son hosts distintos.
 *
 * Regla de seguridad del módulo: el regreso del navegador (`token_ws`) solo se usa para
 * ubicar la transacción. El estado real se obtiene SIEMPRE con `commit`/`status`
 * (autenticados con las llaves de la empresa), así que una URL de regreso falsificada no
 * puede marcar nada como pagado.
 */

const HOSTS = { integration: 'https://webpay3gint.transbank.cl', production: 'https://webpay3g.transbank.cl' } as const;
const API_PATH = '/rswebpaytransaction/api/webpay/v1.2/transactions';
/**
 * Solo para pruebas de punta a punta con una pasarela simulada (igual que `KHIPU_API_BASE_URL`): cambia el host de las
 * llamadas del SERVIDOR a la API. No afecta a la dirección a la que se manda al comprador, que sigue validándose contra
 * los hosts oficiales de Transbank (`isWebpayUrl`). No se define en producción.
 */
const API_BASE_OVERRIDE = process.env.VERCEL_ENV === 'production' ? undefined : process.env.WEBPAY_API_BASE_URL?.replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 20_000;

export class WebpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface WebpayCredentials {
  commerceCode: string;
  apiSecret: string;
  production: boolean;
}

export interface WebpayCreated {
  token: string;
  /** Dirección de Transbank a la que se manda al comprador (con `token_ws`). */
  url: string;
}

/** Subconjunto de la respuesta de `commit`/`status` que usa este módulo. */
export interface WebpayTransaction {
  status: string;
  response_code?: number;
  amount: number;
  buy_order: string;
  session_id?: string;
  authorization_code?: string;
  payment_type_code?: string;
  installments_number?: number;
  card_detail?: { card_number?: string };
  transaction_date?: string;
}

async function webpayFetch(credentials: WebpayCredentials, path: string, init: RequestInit): Promise<unknown> {
  const base = API_BASE_OVERRIDE || (credentials.production ? HOSTS.production : HOSTS.integration);
  const response = await fetch(`${base}${API_PATH}${path}`, {
    ...init,
    headers: {
      'Tbk-Api-Key-Id': credentials.commerceCode,
      'Tbk-Api-Key-Secret': credentials.apiSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) {
    // El detalle va a observabilidad desde quien llama; acá se conserva el status para
    // distinguir credenciales inválidas (401/403) de una caída o de una transacción ya confirmada (422).
    const detail = await response.text().catch(() => '');
    throw new WebpayApiError(`Webpay respondió ${response.status}: ${detail.slice(0, 500)}`, response.status);
  }
  return response.json();
}

export async function createWebpayTransaction(
  credentials: WebpayCredentials,
  input: { buyOrder: string; sessionId: string; amount: number; returnUrl: string }
): Promise<WebpayCreated> {
  const json = (await webpayFetch(credentials, '', {
    method: 'POST',
    body: JSON.stringify({ buy_order: input.buyOrder.slice(0, 26), session_id: input.sessionId.slice(0, 61), amount: input.amount, return_url: input.returnUrl.slice(0, 256) }),
  })) as { token?: unknown; url?: unknown };
  if (typeof json.token !== 'string' || typeof json.url !== 'string') throw new WebpayApiError('Respuesta de Webpay sin token/url', 502);
  return { token: json.token, url: json.url };
}

function asTransaction(json: unknown): WebpayTransaction {
  const tx = json as Partial<WebpayTransaction>;
  if (typeof tx?.status !== 'string' || typeof tx.buy_order !== 'string') throw new WebpayApiError('Respuesta de Webpay sin status/buy_order', 502);
  return tx as WebpayTransaction;
}

/** Confirma la transacción tras el regreso del comprador. Solo se puede hacer una vez por token. */
export async function commitWebpayTransaction(credentials: WebpayCredentials, token: string): Promise<WebpayTransaction> {
  return asTransaction(await webpayFetch(credentials, `/${encodeURIComponent(token)}`, { method: 'PUT' }));
}

/** Consulta el estado de una transacción (sirve para reintentar sin volver a confirmar). */
export async function getWebpayTransaction(credentials: WebpayCredentials, token: string): Promise<WebpayTransaction> {
  return asTransaction(await webpayFetch(credentials, `/${encodeURIComponent(token)}`, { method: 'GET' }));
}
