import { ADULT_AGE, ageOn, isMinor } from '@/lib/academy/enrollment';
import { ACADEMY_HONEYPOT_FIELD, approveApplicationSchema, publicApplicationSchema } from '@/modules/academy/schema';

const NOW = new Date('2026-10-05T12:00:00Z');

function yearsAgo(years: number, extraDays = 0): string {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + extraDays);
  return d.toISOString().slice(0, 10);
}

const base = {
  fullName: 'Camila Rojas Soto',
  rut: '12.345.678-5',
  phone: '+56 9 1234 5678',
  photoConsent: false,
  acceptPrivacy: true as const,
};

describe('edad y mayoría de edad', () => {
  it('cuenta el cumpleaños recién cuando llega', () => {
    expect(ageOn(new Date('2008-10-06T12:00:00Z'), NOW)).toBe(17);
    expect(ageOn(new Date('2008-10-05T12:00:00Z'), NOW)).toBe(18);
    expect(isMinor(new Date('2008-10-06T12:00:00Z'), NOW)).toBe(true);
    expect(isMinor(new Date('2008-10-05T12:00:00Z'), NOW)).toBe(false);
    expect(ADULT_AGE).toBe(18);
  });
});

describe('formulario público de inscripción', () => {
  it('acepta a una adulta sin apoderado', () => {
    expect(publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(25) }).success).toBe(true);
  });

  it('a una menor le exige el nombre y teléfono del apoderado', () => {
    const sin = publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(14) });
    expect(sin.success).toBe(false);
    const con = publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(14), guardianName: 'Marta Soto', guardianPhone: '+56 9 8765 4321' });
    expect(con.success).toBe(true);
  });

  it('exige aceptar el aviso de privacidad', () => {
    expect(publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(25), acceptPrivacy: false }).success).toBe(false);
  });

  it('rechaza un RUT inválido y fechas imposibles', () => {
    expect(publicApplicationSchema.safeParse({ ...base, rut: '12.345.678-9', birthDate: yearsAgo(25) }).success).toBe(false);
    expect(publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(0, -3) }).success).toBe(false);
    expect(publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(130) }).success).toBe(false);
  });

  it('el campo señuelo no es parte del esquema (el bot que lo llena se descarta en la ruta)', () => {
    expect(ACADEMY_HONEYPOT_FIELD).toBe('website');
    const parsed = publicApplicationSchema.safeParse({ ...base, birthDate: yearsAgo(25), website: 'x' });
    expect(parsed.success && 'website' in parsed.data).toBe(false);
  });
});

describe('aprobación', () => {
  it('pide un primer mes de cobro válido', () => {
    expect(approveApplicationSchema.safeParse({ groupId: null, startMonth: '2026-10' }).success).toBe(true);
    expect(approveApplicationSchema.safeParse({ groupId: 'g1', startMonth: '2026-13' }).success).toBe(false);
    expect(approveApplicationSchema.safeParse({ groupId: 'g1' }).success).toBe(false);
  });
});
