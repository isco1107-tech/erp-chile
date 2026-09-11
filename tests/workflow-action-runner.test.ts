import { prisma } from '@/lib/prisma';

/**
 * Cada tipo de acción se prueba aislado de sus dependencias reales (correo,
 * red, base de datos) — lo que importa acá es que la plantilla se resuelva
 * bien, que un destino inválido se rechace ANTES de intentar el envío, y que
 * un fallo de una acción nunca se propague como excepción (el motor corre
 * varias en fila y no puede detenerse a mitad de camino).
 */

jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/security/outbound-url', () => ({
  isSafeOutboundWebhookUrl: jest.fn(),
  assertResolvesToPublicAddress: jest.fn(),
}));

import { sendEmail } from '@/lib/email/mailer';
import { isSafeOutboundWebhookUrl, assertResolvesToPublicAddress } from '@/lib/security/outbound-url';
import { runWorkflowAction, type WorkflowActionRunContext } from '@/lib/workflows/action-runner';

const CONTEXT: WorkflowActionRunContext = { companyId: 'cmp_1', ruleId: 'rule_1', ruleName: 'Regla', trigger: 'SALE_ISSUED', signingSecret: 'secreto-de-prueba' };

describe('Acción: enviar correo', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('resuelve la plantilla del destinatario, asunto y cuerpo contra el payload', async () => {
    (sendEmail as jest.Mock).mockResolvedValue({ status: 'sent' });

    const result = await runWorkflowAction(
      { type: 'SEND_EMAIL', to: '{{buyerEmail}}', subject: 'Hola {{buyerName}}', body: 'Gracias {{buyerName}}, total {{totalAmount}}' },
      { buyerEmail: 'ana@test.cl', buyerName: 'Ana', totalAmount: 5000 },
      CONTEXT
    );

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@test.cl', subject: 'Hola Ana', text: 'Gracias Ana, total 5000' })
    );
  });

  it('escapa HTML en el cuerpo del correo (el campo puede venir de un formulario público sin autenticar)', async () => {
    // Regresión real: el nombre de una candidata (CANDIDATE_REGISTERED.fullName)
    // se recibe sin sanitizar en un endpoint público. Sin escapar, ese valor se
    // inyectaba tal cual en el HTML del correo real que recibe el destinatario
    // configurado en la regla.
    (sendEmail as jest.Mock).mockResolvedValue({ status: 'sent' });

    await runWorkflowAction(
      { type: 'SEND_EMAIL', to: 'staff@empresa.cl', subject: 'x', body: 'Nueva postulación de {{fullName}}' },
      { fullName: '<img src=x onerror=alert(1)>' },
      CONTEXT
    );

    const call = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(call.html).not.toContain('<img');
    expect(call.html).toContain('&lt;img');
    // El texto plano no lleva escape HTML — no tiene sentido en un cliente de correo en texto plano.
    expect(call.text).toContain('<img src=x onerror=alert(1)>');
  });

  it('rechaza sin intentar el envío si el destinatario resuelto no es un correo válido', async () => {
    const result = await runWorkflowAction({ type: 'SEND_EMAIL', to: '{{campoQueNoExiste}}', subject: 'x', body: 'y' }, {}, CONTEXT);

    expect(result.success).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reporta el fallo del proveedor de correo sin lanzar', async () => {
    (sendEmail as jest.Mock).mockResolvedValue({ status: 'failed', error: 'proveedor caído' });

    const result = await runWorkflowAction({ type: 'SEND_EMAIL', to: 'ana@test.cl', subject: 'x', body: 'y' }, {}, CONTEXT);

    expect(result.success).toBe(false);
    expect(result.detail).toContain('proveedor caído');
  });
});

describe('Acción: crear notificación interna', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('persiste la notificación con los textos ya resueltos', async () => {
    const create = jest.spyOn(prisma.workflowNotification, 'create').mockResolvedValue({} as never);

    const result = await runWorkflowAction(
      { type: 'CREATE_NOTIFICATION', title: 'Stock bajo: {{sku}}', message: 'Quedan {{totalStock}} unidades', severity: 'WARNING' },
      { sku: 'ABC-1', totalStock: 3 },
      CONTEXT
    );

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'cmp_1', ruleId: 'rule_1', title: 'Stock bajo: ABC-1', message: 'Quedan 3 unidades', severity: 'WARNING' }),
      })
    );
  });
});

describe('Acción: llamar un webhook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (isSafeOutboundWebhookUrl as jest.Mock).mockReturnValue({ ok: true });
    (assertResolvesToPublicAddress as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rechaza sin llamar `fetch` si la validación estática de la URL falla', async () => {
    (isSafeOutboundWebhookUrl as jest.Mock).mockReturnValue({ ok: false, reason: 'host interno' });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    const result = await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://169.254.169.254/x' }, {}, CONTEXT);

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza si la resolución DNS al momento de enviar apunta a una red privada', async () => {
    (assertResolvesToPublicAddress as jest.Mock).mockRejectedValue(new Error('resuelve a una dirección privada'));
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    const result = await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://rebind.example.com' }, {}, CONTEXT);

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('firma el cuerpo con HMAC-SHA256 del secreto de la regla', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn(async (_url, init) => {
      capturedInit = init;
      return { ok: true, status: 200 } as Response;
    }) as never;

    await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://example.com/hook' }, { totalAmount: 100 }, CONTEXT);

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['X-Aether-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(String(capturedInit?.body)).data).toEqual({ totalAmount: 100 });
  });

  it('nunca sigue una redirección (redirect: error)', async () => {
    const fetchMock = jest.fn(async (_url, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      return { ok: true, status: 200 } as Response;
    });
    global.fetch = fetchMock as never;

    await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://example.com/hook' }, {}, CONTEXT);

    expect(fetchMock).toHaveBeenCalled();
  });

  it('reporta un status HTTP de error sin lanzar', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as Response) as never;

    const result = await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://example.com/hook' }, {}, CONTEXT);

    expect(result.success).toBe(false);
    expect(result.detail).toContain('500');
  });

  it('nunca lanza si `fetch` rechaza (timeout, DNS, red)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network error');
    }) as never;

    const result = await runWorkflowAction({ type: 'CALL_WEBHOOK', url: 'https://example.com/hook' }, {}, CONTEXT);

    expect(result.success).toBe(false);
  });
});
