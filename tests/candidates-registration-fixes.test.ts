import { candidateSelfRegistrationSchema } from '@/modules/candidates/schema';
import { ageInSantiago } from '@/lib/chile/timezone';
import { checkRateLimit, clearAllRateLimits, peekRateLimit } from '@/lib/security/rate-limiter';
import { fitWithin, uploadFailureMessage } from '@/components/candidates/upload-limits';

/**
 * Correcciones del formulario público de postulación (revisión del
 * 2026-09-25): edad en hora de Chile, apoderado obligatorio para menores,
 * límites de estatura y fecha, rate limit que solo cuenta envíos exitosos y
 * límites de subida bajo el tope de Vercel.
 */

function registration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rut: '12.345.678-5',
    fullName: 'Camila Andrea Fuentes Soto',
    email: 'camila.fuentes@correo.cl',
    birthDate: '2005-05-10',
    heightCm: 168,
    comuna: 'Temuco',
    direccion: 'Avenida Alemania 1234',
    ocupacion: 'Estudiante de diseño',
    motivacion:
      'Quiero postular a este certamen porque siempre he creído en la representación de mi comuna y en usar la vitrina para impulsar causas sociales que me importan de verdad.',
    causaSocial: 'Prevención del acoso escolar en liceos de la región',
    aceptaRequisitos: true,
    aceptaTratamientoDatos: true,
    aceptaBases: true,
    ...overrides,
  };
}

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

describe('apoderado obligatorio para menores', () => {
  const minorBirth = `${new Date().getUTCFullYear() - 16}-01-15`;

  it('una menor sin apoderado no pasa', () => {
    const result = candidateSelfRegistrationSchema.safeParse(registration({ birthDate: minorBirth }));
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['guardianName', 'guardianRut']));
  });

  it('exige un RUT de apoderado válido', () => {
    const result = candidateSelfRegistrationSchema.safeParse(registration({ birthDate: minorBirth, guardianName: 'María Soto', guardianRut: '12.345.678-4' }));
    expect(result.success).toBe(false);
  });

  it('con apoderado y RUT válido pasa', () => {
    const result = candidateSelfRegistrationSchema.safeParse(registration({ birthDate: minorBirth, guardianName: 'María Soto', guardianRut: '12.345.678-5' }));
    expect(result.success).toBe(true);
  });

  it('una mayor de edad no necesita apoderado', () => {
    expect(candidateSelfRegistrationSchema.safeParse(registration()).success).toBe(true);
  });
});

describe('límites de estatura y fecha', () => {
  it('rechaza estatura en metros o fuera de rango', () => {
    expect(candidateSelfRegistrationSchema.safeParse(registration({ heightCm: 2 })).success).toBe(false);
    expect(candidateSelfRegistrationSchema.safeParse(registration({ heightCm: 1700 })).success).toBe(false);
    expect(candidateSelfRegistrationSchema.safeParse(registration({ heightCm: 172 })).success).toBe(true);
  });

  it('rechaza años mal tipeados y fechas futuras', () => {
    expect(candidateSelfRegistrationSchema.safeParse(registration({ birthDate: '0201-05-10' })).success).toBe(false);
    expect(candidateSelfRegistrationSchema.safeParse(registration({ birthDate: '2201-05-10' })).success).toBe(false);
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

describe('límites de subida', () => {
  it('reduce al lado mayor conservando la proporción', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('explica un 413 como archivos pesados y no como falta de conexión', () => {
    expect(uploadFailureMessage(413)).toMatch(/pesados/);
    expect(uploadFailureMessage(502)).not.toMatch(/conexión/);
  });
});
