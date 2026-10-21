import {
  DEFAULT_IMPACT_TOKEN_TTL_DAYS,
  impactTokenTtlDays,
  impactUrl,
  signImpactToken,
  verifyImpactToken,
} from '@/lib/impact/token';

const secret = 'secreto-de-prueba-1';
const payload = { companyId: 'cmcompany0000000000000001', salesDocumentId: 'cmdoc000000000000000001' };
const now = Date.UTC(2026, 9, 21);

describe('token de impacto', () => {
  it('firma y verifica sin base de datos', () => {
    const token = signImpactToken(payload, { secret, now });
    expect(verifyImpactToken(token, { secret, now })).toEqual(payload);
  });

  it('es corto (cabe en un QR de 80 mm)', () => {
    expect(signImpactToken(payload, { secret, now }).length).toBeLessThan(100);
  });

  it('rechaza una firma alterada o de otro secreto', () => {
    const token = signImpactToken(payload, { secret, now });
    expect(verifyImpactToken(token, { secret: 'otro', now })).toBeNull();
    const parts = token.split('.');
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
    expect(verifyImpactToken(parts.join('.'), { secret, now })).toBeNull();
  });

  it('rechaza si se cambia la empresa, el documento o el vencimiento', () => {
    const [c, d, e, s] = signImpactToken(payload, { secret, now }).split('.');
    expect(verifyImpactToken([`${c}x`, d, e, s].join('.'), { secret, now })).toBeNull();
    expect(verifyImpactToken([c, `${d}x`, e, s].join('.'), { secret, now })).toBeNull();
    expect(verifyImpactToken([c, d, (parseInt(e, 36) + 1000).toString(36), s].join('.'), { secret, now })).toBeNull();
  });

  it('vence según la vigencia', () => {
    const token = signImpactToken(payload, { secret, now, ttlDays: 10 });
    expect(verifyImpactToken(token, { secret, now: now + 9 * 86_400_000 })).toEqual(payload);
    expect(verifyImpactToken(token, { secret, now: now + 11 * 86_400_000 })).toBeNull();
  });

  it('no lanza con basura', () => {
    for (const bad of ['', 'a', 'a.b.c', 'a.b.c.d.e', '....', '../../x.y.z.w', 'x'.repeat(500)]) {
      expect(verifyImpactToken(bad, { secret, now })).toBeNull();
    }
  });

  it('sin secreto configurado el token se rechaza y firmar lanza', () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(verifyImpactToken('a.b.c.d', { now })).toBeNull();
      expect(() => signImpactToken(payload, { now })).toThrow();
    } finally {
      if (previous !== undefined) process.env.JWT_SECRET = previous;
    }
  });

  it('rechaza identificadores con caracteres no permitidos al firmar', () => {
    expect(() => signImpactToken({ companyId: 'a.b', salesDocumentId: 'x' }, { secret, now })).toThrow();
  });

  it('la vigencia se configura por entorno con respaldo seguro', () => {
    expect(impactTokenTtlDays({})).toBe(DEFAULT_IMPACT_TOKEN_TTL_DAYS);
    expect(impactTokenTtlDays({ IMPACT_TOKEN_TTL_DAYS: '90' })).toBe(90);
    expect(impactTokenTtlDays({ IMPACT_TOKEN_TTL_DAYS: '-5' })).toBe(DEFAULT_IMPACT_TOKEN_TTL_DAYS);
    expect(impactTokenTtlDays({ IMPACT_TOKEN_TTL_DAYS: 'abc' })).toBe(DEFAULT_IMPACT_TOKEN_TTL_DAYS);
  });

  it('arma la URL pública', () => {
    expect(impactUrl('https://erp.test/', 'tok')).toBe('https://erp.test/impacto/tok');
  });
});
