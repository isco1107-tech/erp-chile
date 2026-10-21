/**
 * Formulario público de derechos (`POST /api/public/privacy/[token]/request`).
 *
 * Reglas: la empresa sale del token y nunca del cuerpo; el honeypot descarta en
 * silencio; hay tope por IP; el acuse de recibo sale con la cuenta de correo de
 * LA empresa del token; y un fallo de correo no deshace la solicitud.
 */

jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (task: () => unknown) => void Promise.resolve(task()),
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/notifications/company-notification', () => ({ notifyCompany: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn().mockResolvedValue({ status: 'sent', provider: 'brevo' }), getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/security/turnstile', () => ({ TURNSTILE_FIELD: 'cf-turnstile-response', verifyTurnstile: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('@/modules/data-protection/services/requests.service', () => ({
  resolvePrivacyPortal: jest.fn(),
  createDataSubjectRequest: jest.fn(),
}));

import { POST } from '@/app/api/public/privacy/[token]/request/route';
import { sendEmail } from '@/lib/email/mailer';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { createDataSubjectRequest, resolvePrivacyPortal } from '@/modules/data-protection/services/requests.service';

const TOKEN = 'b'.repeat(64);
const PORTAL = { companyId: 'company-a', companyName: 'Chakra', contactEmail: 'contacto@chakra.cl' };
const VALID = { type: 'ACCESS', requesterName: 'Ana Pérez', requesterEmail: 'ana@test.cl', acceptsIdentityCheck: true };

let ip = 0;
function call(body: unknown, headers: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const request = new Request(`https://app.test/api/public/privacy/${TOKEN}/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(raw.length), 'x-forwarded-for': `10.0.0.${++ip}`, ...headers },
    body: raw,
  });
  return POST(request, { params: Promise.resolve({ token: TOKEN }) });
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  // Los topes viven en memoria del proceso: cada prueba parte de cero.
  delete (globalThis as Record<string, unknown>).__erp_rate_limit_store__;
  (resolvePrivacyPortal as jest.Mock).mockResolvedValue(PORTAL);
  (verifyTurnstile as jest.Mock).mockResolvedValue({ ok: true });
  (createDataSubjectRequest as jest.Mock).mockImplementation(async (companyId: string, input: Record<string, unknown>) => ({
    id: 'r1', companyId, type: input.type, requesterName: input.requesterName, requesterEmail: input.requesterEmail, dueAt: new Date('2027-01-09T12:00:00Z'),
  }));
});

describe('POST /api/public/privacy/[token]/request', () => {
  it('registra la solicitud en la empresa del token y manda el acuse con la cuenta de esa empresa', async () => {
    const response = await call({ ...VALID, companyId: 'company-EVIL' });
    expect(response.status).toBe(200);
    // El `companyId` del cuerpo se ignora: manda el token.
    expect(createDataSubjectRequest).toHaveBeenCalledWith('company-a', expect.objectContaining({ type: 'ACCESS', requesterEmail: 'ana@test.cl' }), 'PUBLIC_FORM');
    await flush();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@test.cl', companyId: 'company-a', replyTo: 'contacto@chakra.cl' }));
  });

  it('un enlace inválido o de una empresa suspendida responde 404 y no crea nada', async () => {
    (resolvePrivacyPortal as jest.Mock).mockResolvedValue(null);
    const response = await call(VALID);
    expect(response.status).toBe(404);
    expect(createDataSubjectRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('el honeypot responde 200 sin crear nada ni mandar correos', async () => {
    const response = await call({ ...VALID, website: 'http://spam.example' });
    expect(response.status).toBe(200);
    expect(createDataSubjectRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('exige aceptar la verificación de identidad y un derecho válido', async () => {
    expect((await call({ ...VALID, acceptsIdentityCheck: false })).status).toBe(400);
    expect((await call({ ...VALID, type: 'HACKEAR' })).status).toBe(400);
    expect(createDataSubjectRequest).not.toHaveBeenCalled();
  });

  it('sin pasar el anti-bots no se registra nada', async () => {
    (verifyTurnstile as jest.Mock).mockResolvedValue({ ok: false, error: 'No pudimos verificar que no eres un robot.' });
    const response = await call(VALID);
    expect(response.status).toBe(403);
    expect(createDataSubjectRequest).not.toHaveBeenCalled();
  });

  it('frena a una misma IP después de varios envíos', async () => {
    const sameIp = { 'x-forwarded-for': '203.0.113.7' };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await call(VALID, sameIp)).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('un mismo correo no puede disparar más de 3 solicitudes al día: pasado el tope se responde igual, sin crear ni mandar nada', async () => {
    for (let i = 0; i < 3; i++) expect((await call({ ...VALID, requesterEmail: 'victima@test.cl' })).status).toBe(200);
    await flush();
    (createDataSubjectRequest as jest.Mock).mockClear();
    (sendEmail as jest.Mock).mockClear();
    const response = await call({ ...VALID, requesterEmail: 'victima@test.cl' });
    expect(response.status).toBe(200);
    await flush();
    expect(createDataSubjectRequest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('el límite por enlace frena aunque cambie la IP y el correo', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await call({ ...VALID, requesterEmail: `persona${i}@test.cl` })).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
  });

  it('el acuse saluda sin el nombre escrito por quien llenó el formulario', async () => {
    await call({ ...VALID, requesterName: 'Visita evil.cl para ganar un premio' });
    await flush();
    const sent = (sendEmail as jest.Mock).mock.calls[0]![0] as { html: string; text: string };
    expect(sent.html).not.toContain('evil.cl');
    expect(sent.text).not.toContain('evil.cl');
  });

  it('rechaza un cuerpo demasiado grande', async () => {
    const response = await call({ ...VALID, details: 'x'.repeat(40_000) });
    expect(response.status).toBe(413);
  });

  it('un fallo al mandar el acuse no deshace la solicitud ya guardada', async () => {
    (sendEmail as jest.Mock).mockRejectedValue(new Error('proveedor caído'));
    const response = await call(VALID);
    expect(response.status).toBe(200);
    await flush();
    expect(createDataSubjectRequest).toHaveBeenCalledTimes(1);
  });
});
