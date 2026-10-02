import { decryptIntegrationCredential, encryptIntegrationCredential } from '@/lib/integrations/crypto';
import { brevoConfigSchema, zapsignConfigSchema } from '@/lib/integrations/schema';
import { sendEmail } from '@/lib/email/mailer';
import { platformZapsignConfig } from '@/lib/zapsign/client';

const getCompanyEmailConfig = jest.fn();
jest.mock('@/lib/integrations/company-integrations', () => ({
  getCompanyEmailConfig: (...args: unknown[]) => getCompanyEmailConfig(...args),
}));

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = 'semilla-de-prueba';
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
  getCompanyEmailConfig.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('cifrado de credenciales de integración', () => {
  it('descifra lo que cifró y no deja la credencial en claro', () => {
    const stored = encryptIntegrationCredential('xkeysib-secreta-123');
    expect(stored).not.toContain('xkeysib');
    expect(decryptIntegrationCredential(stored)).toBe('xkeysib-secreta-123');
  });

  it('dos cifrados del mismo valor difieren (IV aleatorio)', () => {
    expect(encryptIntegrationCredential('abc')).not.toBe(encryptIntegrationCredential('abc'));
  });

  it('un valor alterado no se descifra', () => {
    const [iv, tag, data] = encryptIntegrationCredential('abc').split('.');
    const tampered = [iv, tag, Buffer.from('otro-contenido').toString('base64')].join('.');
    expect(() => decryptIntegrationCredential(tampered)).toThrow();
    expect(data).toBeTruthy();
  });

  it('sin secreto base falla con un mensaje claro', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptIntegrationCredential('abc')).toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
  });
});

describe('esquemas de integraciones', () => {
  it('Brevo normaliza el correo y exige nombre', () => {
    const ok = brevoConfigSchema.parse({ apiKey: 'x'.repeat(30), fromName: ' Mi Empresa ', fromAddress: ' Contacto@Empresa.CL ' });
    expect(ok.fromAddress).toBe('contacto@empresa.cl');
    expect(ok.fromName).toBe('Mi Empresa');
    expect(brevoConfigSchema.safeParse({ fromName: '', fromAddress: 'a@b.cl' }).success).toBe(false);
    expect(brevoConfigSchema.safeParse({ fromName: 'X', fromAddress: 'no-es-correo' }).success).toBe(false);
  });

  it('Brevo permite cambiar solo el remitente (sin apiKey)', () => {
    expect(brevoConfigSchema.safeParse({ fromName: 'X', fromAddress: 'a@b.cl' }).success).toBe(true);
  });

  it('ZapSign permite cambiar solo el modo y rechaza tokens cortos', () => {
    expect(zapsignConfigSchema.safeParse({ sandbox: true }).success).toBe(true);
    expect(zapsignConfigSchema.safeParse({ token: 'corto', sandbox: false }).success).toBe(false);
  });
});

describe('correo por empresa', () => {
  it('con cuenta propia envía por Brevo con SU key y SU remitente, no con los de la plataforma', async () => {
    process.env.BREVO_API_KEY = 'plataforma-key';
    process.env.EMAIL_FROM = 'Plataforma <no-reply@plataforma.cl>';
    getCompanyEmailConfig.mockResolvedValue({ apiKey: 'empresa-key', sender: { name: 'Mi Empresa', email: 'hola@miempresa.cl' } });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ to: 'a@b.cl', subject: 's', html: '<p>h</p>', text: 't', companyId: 'c1' });

    expect(result).toEqual({ status: 'sent', provider: 'brevo' });
    expect(getCompanyEmailConfig).toHaveBeenCalledWith('c1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['api-key']).toBe('empresa-key');
    expect(JSON.parse(init.body).sender).toEqual({ name: 'Mi Empresa', email: 'hola@miempresa.cl' });
  });

  it('si la cuenta propia falla NO reintenta con la de la plataforma', async () => {
    process.env.BREVO_API_KEY = 'plataforma-key';
    getCompanyEmailConfig.mockResolvedValue({ apiKey: 'empresa-key', sender: { name: 'E', email: 'e@e.cl' } });
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid key' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't', companyId: 'c1' });

    expect(result.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin cuenta propia cae a la de la plataforma', async () => {
    process.env.BREVO_API_KEY = 'plataforma-key';
    getCompanyEmailConfig.mockResolvedValue(null);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't', companyId: 'c1' });

    expect(fetchMock.mock.calls[0]![1].headers['api-key']).toBe('plataforma-key');
  });

  it('si no se puede leer la config de la empresa, el correo no se pierde: sale por la plataforma', async () => {
    process.env.BREVO_API_KEY = 'plataforma-key';
    getCompanyEmailConfig.mockRejectedValue(new Error('db caída'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't', companyId: 'c1' });

    expect(result.status).toBe('sent');
  });

  it('sin companyId no consulta la base de datos', async () => {
    process.env.BREVO_API_KEY = 'plataforma-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't' });
    expect(getCompanyEmailConfig).not.toHaveBeenCalled();
  });
});

describe('ZapSign de la plataforma', () => {
  it('sin token de plataforma el error orienta a conectar la cuenta propia', () => {
    delete process.env.ZAPSIGN_API_TOKEN;
    expect(() => platformZapsignConfig()).toThrow(/Integraciones/);
  });
});
