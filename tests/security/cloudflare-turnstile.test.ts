import { CLOUDFLARE_ORIGIN_HEADER, getClientCountry, getClientIp, isFromCloudflare, safeEqual } from '@/lib/security/cloudflare';
import { verifyTurnstile, isTurnstileEnabled } from '@/lib/security/turnstile';

jest.mock('@/lib/observability', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

const SECRET = 'a'.repeat(40);

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe('IP del cliente detrás de Cloudflare', () => {
  const original = process.env.CLOUDFLARE_ORIGIN_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    else process.env.CLOUDFLARE_ORIGIN_SECRET = original;
  });

  it('sin secreto configurado usa x-forwarded-for como siempre e ignora cf-connecting-ip', () => {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    const h = headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'cf-connecting-ip': '9.9.9.9' });
    expect(getClientIp(h)).toBe('200.1.2.3');
    expect(isFromCloudflare(h)).toBe(false);
  });

  it('con el secreto correcto confía en cf-connecting-ip', () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = SECRET;
    const h = headers({ 'x-forwarded-for': '172.64.0.1', 'cf-connecting-ip': '200.1.2.3', [CLOUDFLARE_ORIGIN_HEADER]: SECRET, 'cf-ipcountry': 'cl' });
    expect(getClientIp(h)).toBe('200.1.2.3');
    expect(getClientCountry(h)).toBe('CL');
  });

  it('un cf-connecting-ip inventado sin el secreto no se cree (le pegaron directo a Vercel)', () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = SECRET;
    const forged = headers({ 'x-forwarded-for': '45.1.1.1', 'cf-connecting-ip': '1.1.1.1', [CLOUDFLARE_ORIGIN_HEADER]: 'b'.repeat(40) });
    expect(getClientIp(forged)).toBe('45.1.1.1');
    expect(getClientCountry(forged)).toBeNull();
  });

  it('ignora un secreto demasiado corto', () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = 'corto';
    expect(isFromCloudflare(headers({ [CLOUDFLARE_ORIGIN_HEADER]: 'corto', 'cf-connecting-ip': '1.1.1.1' }))).toBe(false);
  });

  it('descarta valores que no son IP y acepta IPv6', () => {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    expect(getClientIp(headers({ 'x-forwarded-for': 'unknown' }))).toBeNull();
    expect(getClientIp(headers({ 'x-forwarded-for': '<script>' , 'x-real-ip': '200.1.2.3' }))).toBe('200.1.2.3');
    expect(getClientIp(headers({ 'x-forwarded-for': '2800:150:1::1' }))).toBe('2800:150:1::1');
  });

  it('safeEqual compara exacto', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('Cloudflare Turnstile', () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  afterEach(() => {
    process.env = { ...env };
    global.fetch = realFetch;
  });

  it('sin llaves no exige nada', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(isTurnstileEnabled()).toBe(false);
    await expect(verifyTurnstile(undefined, null, 'login')).resolves.toEqual({ ok: true, skipped: true });
  });

  describe('con llaves', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SECRET_KEY = 'secret';
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site';
    });

    it('rechaza sin token', async () => {
      expect((await verifyTurnstile(undefined, null, 'login')).ok).toBe(false);
      expect((await verifyTurnstile('', null, 'login')).ok).toBe(false);
    });

    it('acepta un token válido para la acción correcta y rechaza uno de otra acción', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, action: 'login' }) }) as unknown as typeof fetch;
      await expect(verifyTurnstile('tok', '200.1.2.3', 'login')).resolves.toEqual({ ok: true });
      expect((await verifyTurnstile('tok', null, 'candidate-application')).ok).toBe(false);
    });

    it('rechaza cuando Cloudflare dice que no es válido', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) }) as unknown as typeof fetch;
      expect((await verifyTurnstile('tok', null, 'login')).ok).toBe(false);
    });

    it('deja pasar si Cloudflare no responde (falla abierto)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
      await expect(verifyTurnstile('tok', null, 'login')).resolves.toEqual({ ok: true, skipped: true });
    });
  });
});
