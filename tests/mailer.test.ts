import {
  getAppUrl,
  getEmailProvider,
  isEmailConfigured,
  parseSender,
  sendEmail,
} from '@/lib/email/mailer';

/**
 * El comportamiento crítico del mailer no es "enviar bien", sino qué pasa
 * cuando NO puede enviar: una invitación ya guardada en base no debe perderse
 * porque el proveedor de correo esté caído o sin configurar.
 */

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Selección de proveedor', () => {
  it('sin claves no hay proveedor', () => {
    expect(getEmailProvider()).toBe('none');
    expect(isEmailConfigured()).toBe(false);
  });

  it('con solo Resend usa Resend', () => {
    process.env.RESEND_API_KEY = 're_test';
    expect(getEmailProvider()).toBe('resend');
  });

  it('con ambas claves gana Brevo', () => {
    // Resend sin dominio verificado solo entrega al dueño de la cuenta; Brevo
    // permite invitar a cualquiera con un remitente verificado por correo.
    process.env.RESEND_API_KEY = 're_test';
    process.env.BREVO_API_KEY = 'xkeysib_test';
    expect(getEmailProvider()).toBe('brevo');
  });
});

describe('parseSender', () => {
  it('separa nombre y dirección de la forma combinada', () => {
    expect(parseSender('ERP <no-reply@ejemplo.cl>')).toEqual({ name: 'ERP', email: 'no-reply@ejemplo.cl' });
  });

  it('acepta nombres con espacios y comillas', () => {
    expect(parseSender('"Mi Empresa SpA" <ventas@ejemplo.cl>')).toEqual({
      name: 'Mi Empresa SpA',
      email: 'ventas@ejemplo.cl',
    });
  });

  it('acepta una dirección pelada', () => {
    expect(parseSender('solo@ejemplo.cl')).toEqual({ name: 'ERP', email: 'solo@ejemplo.cl' });
  });

  it('tolera espacios sobrantes', () => {
    expect(parseSender('  ERP  <  hola@ejemplo.cl  >  ')).toEqual({ name: 'ERP', email: 'hola@ejemplo.cl' });
  });
});

describe('sendEmail — degradación sin configurar', () => {
  it('sin claves registra en consola y devuelve "logged", no lanza', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.cl', subject: 'Hola', html: '<p>x</p>', text: 'x' });

    expect(result.status).toBe('logged');
    expect(result.provider).toBe('none');
    // El enlace tiene que quedar visible en el log para poder copiarlo a mano.
    expect(String(info.mock.calls[0]?.[0])).toContain('a@b.cl');
  });
});

describe('sendEmail — Brevo', () => {
  it('envía con el formato que exige Brevo', async () => {
    process.env.BREVO_API_KEY = 'xkeysib_test';
    process.env.EMAIL_FROM = 'ERP <no-reply@ejemplo.cl>';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ to: 'destino@ejemplo.cl', subject: 'Asunto', html: '<p>h</p>', text: 't' });

    expect(result).toEqual({ status: 'sent', provider: 'brevo' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    // Brevo autentica con el header `api-key`, no con Bearer.
    expect(options.headers['api-key']).toBe('xkeysib_test');

    const body = JSON.parse(options.body);
    expect(body.sender).toEqual({ name: 'ERP', email: 'no-reply@ejemplo.cl' });
    expect(body.to).toEqual([{ email: 'destino@ejemplo.cl' }]);
    expect(body.htmlContent).toBe('<p>h</p>');
    expect(body.textContent).toBe('t');
  });

  it('un rechazo de Brevo devuelve "failed" sin lanzar', async () => {
    process.env.BREVO_API_KEY = 'xkeysib_test';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'sender not verified' }) as unknown as typeof fetch;

    const result = await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't' });

    expect(result.status).toBe('failed');
    expect(result.provider).toBe('brevo');
    expect(result.error).toContain('400');
  });
});

describe('sendEmail — Resend', () => {
  it('envía con el formato que exige Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'ERP <no-reply@ejemplo.cl>';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail({ to: 'destino@ejemplo.cl', subject: 'Asunto', html: '<p>h</p>', text: 't' });

    expect(result).toEqual({ status: 'sent', provider: 'resend' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers.Authorization).toBe('Bearer re_test');

    const body = JSON.parse(options.body);
    expect(body.from).toBe('ERP <no-reply@ejemplo.cl>');
    expect(body.to).toEqual(['destino@ejemplo.cl']);
    // Ambos formatos viajan: el texto plano es lo que salva del filtro de spam.
    expect(body.html).toBe('<p>h</p>');
    expect(body.text).toBe('t');
  });

  it('una excepción de red devuelve "failed" sin lanzar', async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

    const result = await sendEmail({ to: 'a@b.cl', subject: 's', html: 'h', text: 't' });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('ECONNRESET');
  });
});

describe('getAppUrl — enlaces absolutos del correo', () => {
  it('APP_URL manda sobre todo lo demás', () => {
    process.env.APP_URL = 'https://erp.miempresa.cl';
    process.env.VERCEL_URL = 'deploy-efimero.vercel.app';
    expect(getAppUrl()).toBe('https://erp.miempresa.cl');
  });

  it('quita la barra final para no generar rutas con doble slash', () => {
    process.env.APP_URL = 'https://erp.miempresa.cl/';
    expect(getAppUrl()).toBe('https://erp.miempresa.cl');
  });

  it('prefiere el dominio estable de producción sobre el del deploy', () => {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'erp.vercel.app';
    // VERCEL_URL cambia en cada deploy: un enlace de correo apuntando ahí
    // deja de funcionar en cuanto se publica la versión siguiente.
    process.env.VERCEL_URL = 'erp-abc123-team.vercel.app';
    expect(getAppUrl()).toBe('https://erp.vercel.app');
  });

  it('cae a localhost en desarrollo', () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(getAppUrl()).toBe('http://localhost:3000');
  });
});
