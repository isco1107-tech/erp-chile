import { ageInSantiago } from '@/lib/chile/timezone';
import { checkRateLimit, clearAllRateLimits, peekRateLimit } from '@/lib/security/rate-limiter';

/**
 * Correcciones del formulario público de postulación: edad en hora de Chile
 * (fichas con fecha de nacimiento) y rate limit que solo cuenta envíos
 * exitosos.
 */

describe('edad en Chile', () => {
  const birth = new Date('2008-09-26'); // medianoche UTC, como la produce el formulario

  it('no cumple años antes de tiempo por el desfase UTC', () => {
    // 25 de septiembre a las 23:30 en Chile (26 a las 02:30 UTC): aún tiene 17.
    expect(ageInSantiago(birth, new Date('2026-09-26T02:30:00Z'))).toBe(17);
  });

  it('cumple años el día de su cumpleaños en Chile', () => {
    expect(ageInSantiago(birth, new Date('2026-09-26T15:00:00Z'))).toBe(18);
  });
});

describe('rate limit que solo cuenta envíos exitosos', () => {
  const config = { prefix: 'test-peek', limit: 2, windowMs: 60_000 };
  beforeEach(() => clearAllRateLimits());

  it('consultar no consume cupo', () => {
    for (let i = 0; i < 5; i += 1) expect(peekRateLimit('ip', config).allowed).toBe(true);
    expect(peekRateLimit('ip', config).remaining).toBe(2);
  });

  it('se bloquea recién cuando se registran los envíos exitosos', () => {
    checkRateLimit('ip', config);
    checkRateLimit('ip', config);
    const result = peekRateLimit('ip', config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).not.toBeNull();
  });
});
