import { clearAllRateLimits, type RateLimitConfig } from '@/lib/security/rate-limiter';
import {
  checkRateLimitShared,
  isSharedRateLimitEnabled,
  peekRateLimitShared,
  resetSharedRateLimitBreaker,
  sharedRateLimitKey,
} from '@/lib/security/rate-limiter-shared';

jest.mock('@/lib/observability', () => ({ captureMessage: jest.fn() }));
import { captureMessage } from '@/lib/observability';

const config: RateLimitConfig = { prefix: 'test-shared', limit: 3, windowMs: 60_000 };
const originalFetch = global.fetch;
const fetchMock = jest.fn();

function redisReplies(...results: unknown[]) {
  return { ok: true, status: 200, json: async () => results.map((result) => ({ result })) };
}

beforeEach(() => {
  clearAllRateLimits();
  resetSharedRateLimitBreaker();
  fetchMock.mockReset();
  (captureMessage as jest.Mock).mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test/';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

afterAll(() => {
  global.fetch = originalFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('sin Redis configurado', () => {
  it('se comporta como el limitador local y no llama a la red', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(isSharedRateLimitEnabled()).toBe(false);
    for (let i = 0; i < 3; i += 1) expect((await checkRateLimitShared('1.1.1.1', config)).allowed).toBe(true);
    expect((await checkRateLimitShared('1.1.1.1', config)).allowed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acepta las variables de la integración de Vercel (KV_REST_API_*)', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = 'https://kv.test';
    process.env.KV_REST_API_TOKEN = 't';
    expect(isSharedRateLimitEnabled()).toBe(true);
  });
});

describe('con Redis', () => {
  it('permite mientras el contador global no supere el límite', async () => {
    fetchMock.mockResolvedValueOnce(redisReplies('OK', 2, 59_000));
    const result = await checkRateLimitShared('1.1.1.1', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('bloquea cuando OTRA instancia ya consumió el cupo (contador global alto)', async () => {
    fetchMock.mockResolvedValueOnce(redisReplies(null, 4, 42_000));
    const before = Date.now();
    const result = await checkRateLimitShared('1.1.1.1', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(before + 42_000);
  });

  it('un bloqueo local no llama a Redis', async () => {
    fetchMock.mockResolvedValue(redisReplies('OK', 1, 60_000));
    for (let i = 0; i < 3; i += 1) await checkRateLimitShared('1.1.1.1', config);
    fetchMock.mockClear();
    expect((await checkRateLimitShared('1.1.1.1', config)).allowed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía un solo pipeline autenticado, con clave hasheada y sin el identificador en claro', async () => {
    fetchMock.mockResolvedValueOnce(redisReplies('OK', 1, 60_000));
    await checkRateLimitShared('persona@correo.cl', config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://redis.test/pipeline');
    expect(init.headers.authorization).toBe('Bearer secret-token');
    expect(init.body).not.toContain('persona@correo.cl');
    const commands = JSON.parse(init.body);
    expect(commands[0].slice(0, 2)).toEqual(['SET', sharedRateLimitKey('test-shared', 'persona@correo.cl')]);
    expect(commands.map((c: unknown[]) => c[0])).toEqual(['SET', 'INCR', 'PTTL']);
  });

  it('si Redis falla, no bloquea a nadie (abre), lo reporta y no insiste durante el cortacircuito', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect((await checkRateLimitShared('2.2.2.2', config)).allowed).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect((await checkRateLimitShared('2.2.2.2', config)).allowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('una respuesta HTTP de error también abre y activa el cortacircuito', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect((await checkRateLimitShared('3.3.3.3', config)).allowed).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('aun con Redis caído, el límite local sigue protegiendo', async () => {
    fetchMock.mockRejectedValue(new Error('caído'));
    for (let i = 0; i < 3; i += 1) await checkRateLimitShared('4.4.4.4', config);
    expect((await checkRateLimitShared('4.4.4.4', config)).allowed).toBe(false);
  });
});

describe('peekRateLimitShared', () => {
  it('no registra: usa GET + PTTL y bloquea si el contador global llegó al límite', async () => {
    fetchMock.mockResolvedValueOnce(redisReplies('3', 30_000));
    const result = await peekRateLimitShared('5.5.5.5', config);
    expect(result.allowed).toBe(false);
    const commands = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(commands.map((c: unknown[]) => c[0])).toEqual(['GET', 'PTTL']);
  });

  it('sin contador previo permite', async () => {
    fetchMock.mockResolvedValueOnce(redisReplies(null, -2));
    const result = await peekRateLimitShared('6.6.6.6', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });
});

describe('sharedRateLimitKey', () => {
  it('es determinista, de largo fijo y distinto por prefijo e identificador', () => {
    const a = sharedRateLimitKey('p', 'x');
    expect(a).toBe(sharedRateLimitKey('p', 'x'));
    expect(a).not.toBe(sharedRateLimitKey('p', 'y'));
    expect(a).not.toBe(sharedRateLimitKey('q', 'x'));
    expect(a).toMatch(/^rl:p:[0-9a-f]{64}$/);
  });
});
