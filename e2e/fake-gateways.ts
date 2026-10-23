import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Pasarelas simuladas (Khipu y Transbank/Webpay) para los recorridos de la tienda. La app llama a la API de la
 * pasarela desde el SERVIDOR, así que no se puede interceptar con `page.route`: este servidor corre en el proceso
 * de la prueba y el servidor de la app lo usa si se levantó con
 *
 *   KHIPU_API_BASE_URL=http://localhost:4010  WEBPAY_API_BASE_URL=http://localhost:4010  APP_URL=http://localhost:3100
 *
 * (ver e2e/README.md). Guarda cada cobro en memoria para que la prueba decida si «pagó» el comprador, y responde
 * lo mismo que la API real en lo que la app consulta (estado, monto, moneda y referencia exactos).
 */

export interface FakeKhipuPayment {
  id: string;
  amount: number;
  transactionId: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  apiKey: string | null;
  status: 'pending' | 'done';
  /** Para probar que la app NO se fía de lo que dice la pasarela sin comprobar el monto. */
  amountOverride: number | null;
}

export interface FakeWebpayTransaction {
  token: string;
  buyOrder: string;
  amount: number;
  returnUrl: string;
  commerceCode: string | null;
  status: 'INITIALIZED' | 'AUTHORIZED' | 'FAILED';
}

export interface FakeGateways {
  port: number;
  khipu: Map<string, FakeKhipuPayment>;
  webpay: Map<string, FakeWebpayTransaction>;
  /** Llamadas recibidas, en orden: sirve para comprobar que la app CONSULTÓ a la pasarela. */
  calls: Array<{ method: string; path: string }>;
  /** El comprador paga en Khipu (el cobro queda «done»). */
  payKhipu(id: string, options?: { amount?: number }): void;
  /** Transbank autoriza (o rechaza) la transacción cuando el comprador vuelve. */
  decideWebpay(token: string, outcome: 'AUTHORIZED' | 'FAILED'): void;
  close(): Promise<void>;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export async function startFakeGateways(port = Number(process.env.E2E_GATEWAY_PORT ?? 4010)): Promise<FakeGateways> {
  const khipu = new Map<string, FakeKhipuPayment>();
  const webpay = new Map<string, FakeWebpayTransaction>();
  const calls: FakeGateways['calls'] = [];
  let khipuCounter = 0;
  let webpayCounter = 0;

  const send = (res: http.ServerResponse, status: number, body: unknown, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const method = req.method ?? 'GET';
    calls.push({ method, path: url.pathname });
    try {
      // ── Khipu: crear y consultar cobros ──────────────────────────────
      if (method === 'POST' && url.pathname === '/v3/payments') {
        const body = JSON.parse(await readBody(req)) as { amount: number; transaction_id: string; return_url: string; cancel_url: string; notify_url: string };
        const id = `kp-e2e-${++khipuCounter}-${Date.now().toString(36)}`;
        khipu.set(id, { id, amount: body.amount, transactionId: body.transaction_id, returnUrl: body.return_url, cancelUrl: body.cancel_url, notifyUrl: body.notify_url, apiKey: String(req.headers['x-api-key'] ?? '') || null, status: 'pending', amountOverride: null });
        return send(res, 200, { payment_id: id, payment_url: `http://localhost:${port}/khipu/pay/${id}` });
      }
      const getKhipu = /^\/v3\/payments\/([^/]+)$/.exec(url.pathname);
      if (method === 'GET' && getKhipu) {
        const payment = khipu.get(decodeURIComponent(getKhipu[1]!));
        if (!payment) return send(res, 404, { message: 'no existe' });
        return send(res, 200, { payment_id: payment.id, status: payment.status, amount: payment.amountOverride ?? payment.amount, currency: 'CLP', transaction_id: payment.transactionId });
      }
      // Página de pago de Khipu (la que ve el comprador): un botón «Pagar» que marca el cobro y vuelve a la tienda.
      const payPage = /^\/khipu\/pay\/([^/]+)$/.exec(url.pathname);
      if (method === 'GET' && payPage) {
        const payment = khipu.get(decodeURIComponent(payPage[1]!));
        if (!payment) return send(res, 404, 'cobro desconocido', 'text/plain');
        return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Khipu (simulado)</title><h1>Khipu simulado</h1><p>Monto: ${payment.amount}</p><form method="POST" action="/khipu/confirm/${payment.id}"><button type="submit">Pagar con mi banco</button></form><a href="${payment.cancelUrl}">Cancelar</a>`, 'text/html');
      }
      const confirm = /^\/khipu\/confirm\/([^/]+)$/.exec(url.pathname);
      if (method === 'POST' && confirm) {
        const payment = khipu.get(decodeURIComponent(confirm[1]!));
        if (!payment) return send(res, 404, 'cobro desconocido', 'text/plain');
        payment.status = 'done';
        res.writeHead(303, { Location: payment.returnUrl });
        return res.end();
      }

      // ── Webpay Plus: crear, confirmar y consultar ────────────────────
      const base = '/rswebpaytransaction/api/webpay/v1.2/transactions';
      if (method === 'POST' && url.pathname === base) {
        const body = JSON.parse(await readBody(req)) as { buy_order: string; amount: number; return_url: string };
        // Transbank entrega tokens de 64 hexadecimales.
        const token = `${(++webpayCounter).toString(16).padStart(8, '0')}${Math.random().toString(16).slice(2).padEnd(56, 'a').slice(0, 56)}`;
        webpay.set(token, { token, buyOrder: body.buy_order, amount: body.amount, returnUrl: body.return_url, commerceCode: String(req.headers['tbk-api-key-id'] ?? '') || null, status: 'INITIALIZED' });
        return send(res, 200, { token, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' });
      }
      const tx = new RegExp(`^${base}/([^/]+)$`).exec(url.pathname);
      if (tx && (method === 'PUT' || method === 'GET')) {
        const transaction = webpay.get(decodeURIComponent(tx[1]!));
        if (!transaction) return send(res, 404, { error_message: 'token inexistente' });
        if (method === 'PUT' && transaction.status === 'INITIALIZED') return send(res, 422, { error_message: 'aún no autorizada por el comprador' });
        return send(res, 200, {
          status: transaction.status,
          response_code: transaction.status === 'AUTHORIZED' ? 0 : -1,
          amount: transaction.amount,
          buy_order: transaction.buyOrder,
          authorization_code: transaction.status === 'AUTHORIZED' ? '1213' : undefined,
          payment_type_code: 'VD',
        });
      }
      return send(res, 404, { message: `ruta no simulada: ${method} ${url.pathname}` });
    } catch (error) {
      return send(res, 500, { message: String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    port: (server.address() as AddressInfo).port,
    khipu,
    webpay,
    calls,
    payKhipu(id, options) {
      const payment = khipu.get(id);
      if (!payment) throw new Error(`Cobro de Khipu desconocido: ${id}`);
      payment.status = 'done';
      if (options?.amount !== undefined) payment.amountOverride = options.amount;
    },
    decideWebpay(token, outcome) {
      const transaction = webpay.get(token);
      if (!transaction) throw new Error(`Transacción de Webpay desconocida: ${token}`);
      transaction.status = outcome;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
