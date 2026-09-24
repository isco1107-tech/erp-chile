import {
  checkRateLimit,
  clearAllRateLimits,
  LOGIN_RATE_LIMIT,
  TOTP_RATE_LIMIT,
  RESET_RATE_LIMIT,
  type RateLimitConfig,
} from '@/lib/security/rate-limiter';

beforeEach(() => {
  clearAllRateLimits();
});

describe('Rate Limiter', () => {
  const config: RateLimitConfig = { prefix: 'test', limit: 3, windowMs: 1000 };

  it('permite requests dentro del límite', () => {
    const r1 = checkRateLimit('192.168.1.1', config);
    const r2 = checkRateLimit('192.168.1.1', config);
    const r3 = checkRateLimit('192.168.1.1', config);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('bloquea el request N+1 que excede el límite', () => {
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);

    const r4 = checkRateLimit('192.168.1.1', config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).not.toBeNull();
    expect(r4.retryAfterMs!).toBeGreaterThan(Date.now());
  });

  it('claves diferentes se contabilizan por separado', () => {
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);

    // IP diferente: su contador está en 0
    const r = checkRateLimit('10.0.0.1', config);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('prefijos diferentes se contabilizan por separado', () => {
    const configA: RateLimitConfig = { prefix: 'login', limit: 2, windowMs: 1000 };
    const configB: RateLimitConfig = { prefix: 'reset', limit: 2, windowMs: 1000 };

    checkRateLimit('192.168.1.1', configA);
    checkRateLimit('192.168.1.1', configA);

    // Mismo IP pero diferente prefijo: su contador está en 0
    const r = checkRateLimit('192.168.1.1', configB);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it('los contadores se resetean después de la ventana', async () => {
    const shortConfig: RateLimitConfig = { prefix: 'short', limit: 2, windowMs: 100 };

    checkRateLimit('192.168.1.1', shortConfig);
    checkRateLimit('192.168.1.1', shortConfig);

    const blocked = checkRateLimit('192.168.1.1', shortConfig);
    expect(blocked.allowed).toBe(false);

    // Esperar a que expire la ventana
    await new Promise((resolve) => setTimeout(resolve, 150));

    const afterExpiry = checkRateLimit('192.168.1.1', shortConfig);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(1);
  });

  it('retryAfterMs apunta al momento correcto', () => {
    const now = Date.now();
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);
    checkRateLimit('192.168.1.1', config);

    const blocked = checkRateLimit('192.168.1.1', config);
    expect(blocked.retryAfterMs).not.toBeNull();
    // retryAfterMs = oldestTimestamp + windowMs, debería estar ~1s en el futuro
    expect(blocked.retryAfterMs!).toBeGreaterThanOrEqual(now + config.windowMs - 50);
    expect(blocked.retryAfterMs!).toBeLessThanOrEqual(now + config.windowMs + 50);
  });

  it('informa el limit correcto en el resultado', () => {
    const r = checkRateLimit('192.168.1.1', config);
    expect(r.limit).toBe(3);
  });
});

describe('Configuraciones predefinidas', () => {
  it('LOGIN_RATE_LIMIT tiene valores razonables', () => {
    expect(LOGIN_RATE_LIMIT.limit).toBe(10);
    expect(LOGIN_RATE_LIMIT.windowMs).toBe(60_000);
    expect(LOGIN_RATE_LIMIT.prefix).toBe('login-ip');
  });

  it('TOTP_RATE_LIMIT tiene valores razonables', () => {
    expect(TOTP_RATE_LIMIT.limit).toBe(10);
    expect(TOTP_RATE_LIMIT.windowMs).toBe(60_000);
    expect(TOTP_RATE_LIMIT.prefix).toBe('totp-ip');
  });

  it('RESET_RATE_LIMIT tiene valores razonables', () => {
    expect(RESET_RATE_LIMIT.limit).toBe(3);
    expect(RESET_RATE_LIMIT.windowMs).toBe(300_000);
    expect(RESET_RATE_LIMIT.prefix).toBe('reset-ip');
  });
});

describe('Rate Limiter — limpieza por ventana propia (SEG-09)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('una request de ventana corta no borra el bloqueo de una ventana de una hora', () => {
    // Después de cualquier limpieza real previa del store, para que la de este test sí corra.
    let now = Date.now() + 10 * 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const hourly: RateLimitConfig = { prefix: 'hourly', limit: 2, windowMs: 60 * 60_000 };
    const minute: RateLimitConfig = { prefix: 'minute', limit: 10, windowMs: 60_000 };

    checkRateLimit('10.0.0.1', hourly);
    checkRateLimit('10.0.0.1', hourly);
    expect(checkRateLimit('10.0.0.1', hourly).allowed).toBe(false);

    // Pasan 5 minutos y el mismo cliente toca una ruta de ventana corta, lo
    // que dispara la limpieza del store.
    now += 5 * 60_000;
    checkRateLimit('10.0.0.1', minute);

    expect(checkRateLimit('10.0.0.1', hourly).allowed).toBe(false);
  });

  it('la limpieza sí descarta una entrada cuya propia ventana ya expiró', () => {
    let now = Date.now() + 30 * 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const minute: RateLimitConfig = { prefix: 'minute', limit: 1, windowMs: 60_000 };

    checkRateLimit('10.0.0.2', minute);
    expect(checkRateLimit('10.0.0.2', minute).allowed).toBe(false);

    now += 3 * 60_000;
    expect(checkRateLimit('10.0.0.2', minute).allowed).toBe(true);
  });
});
