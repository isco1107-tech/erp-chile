import { addDays, computeDueDate, deadlineState, effectiveDueDate, extensionProblem, maxExtensionDate } from '@/lib/privacy/deadlines';
import { REQUEST_EXTENSION_DAYS, REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';
import { PROCESSING_ACTIVITIES, activitySubprocessors } from '@/lib/privacy/processing-activities';
import { INTERNATIONAL_SUBPROCESSORS, SUBPROCESSORS } from '@/lib/privacy/subprocessors';
import { manualDataSubjectRequestSchema, privacyIncidentSchema, publicDataSubjectRequestSchema } from '@/lib/privacy/schema';

const D = (iso: string) => new Date(iso);

describe('plazos de las solicitudes de derechos', () => {
  const received = D('2026-12-01T12:00:00Z');

  it('el plazo corre en días corridos desde la recepción', () => {
    expect(computeDueDate(received)).toEqual(addDays(received, REQUEST_RESPONSE_DAYS));
    expect(computeDueDate(received).toISOString()).toBe('2026-12-31T12:00:00.000Z');
  });

  it('la prórroga máxima suma los días adicionales al plazo original', () => {
    expect(maxExtensionDate(received)).toEqual(addDays(computeDueDate(received), REQUEST_EXTENSION_DAYS));
  });

  it('estados: en plazo, por vencer, vencida y cerrada', () => {
    const base = { status: 'RECEIVED' as const, receivedAt: received, dueAt: computeDueDate(received), extendedUntil: null };
    expect(deadlineState(base, D('2026-12-02T12:00:00Z')).kind).toBe('ON_TIME');
    expect(deadlineState(base, D('2026-12-28T12:00:00Z'))).toEqual({ kind: 'DUE_SOON', daysLeft: 3 });
    expect(deadlineState(base, D('2027-01-03T12:00:00Z'))).toEqual({ kind: 'OVERDUE', daysOverdue: 3 });
    expect(deadlineState({ ...base, status: 'RESOLVED' }, D('2027-06-01T00:00:00Z'))).toEqual({ kind: 'CLOSED' });
    expect(deadlineState({ ...base, status: 'REJECTED' }, D('2027-06-01T00:00:00Z'))).toEqual({ kind: 'CLOSED' });
  });

  it('una prórroga posterior al plazo original es la que rige', () => {
    const dueAt = computeDueDate(received);
    const extendedUntil = addDays(dueAt, 10);
    expect(effectiveDueDate({ dueAt, extendedUntil })).toEqual(extendedUntil);
    // Una "prórroga" anterior al plazo no puede acortarlo.
    expect(effectiveDueDate({ dueAt, extendedUntil: addDays(dueAt, -5) })).toEqual(dueAt);
  });

  it('valida la prórroga: motivo, fecha posterior y tope', () => {
    const dueAt = computeDueDate(received);
    const ok = { receivedAt: received, dueAt, requestedUntil: addDays(dueAt, 15), reason: 'Volumen alto de datos a revisar' };
    expect(extensionProblem(ok)).toBeNull();
    expect(extensionProblem({ ...ok, reason: 'corto' })).toMatch(/motivo/i);
    expect(extensionProblem({ ...ok, requestedUntil: dueAt })).toMatch(/posterior/i);
    expect(extensionProblem({ ...ok, requestedUntil: addDays(dueAt, REQUEST_EXTENSION_DAYS + 1) })).toMatch(/no puede superar/i);
  });
});

describe('esquemas de solicitudes', () => {
  const valid = { type: 'ACCESS', requesterName: 'Ana Pérez', requesterEmail: ' ANA@Test.cl ', acceptsIdentityCheck: true };

  it('normaliza el correo y deja el RUT opcional', () => {
    const parsed = publicDataSubjectRequestSchema.parse(valid);
    expect(parsed.requesterEmail).toBe('ana@test.cl');
    expect(parsed.requesterRut).toBeUndefined();
  });

  it('valida el RUT cuando viene y lo guarda sin formato', () => {
    expect(publicDataSubjectRequestSchema.parse({ ...valid, requesterRut: '12.345.678-5' }).requesterRut).toBe('123456785');
    expect(publicDataSubjectRequestSchema.safeParse({ ...valid, requesterRut: '12.345.678-9' }).success).toBe(false);
  });

  it('exige aceptar la verificación de identidad y un derecho válido', () => {
    expect(publicDataSubjectRequestSchema.safeParse({ ...valid, acceptsIdentityCheck: false }).success).toBe(false);
    expect(publicDataSubjectRequestSchema.safeParse({ ...valid, type: 'OTRO' }).success).toBe(false);
  });

  it('el formulario manual no acepta una fecha de recepción inválida', () => {
    expect(manualDataSubjectRequestSchema.safeParse({ ...valid, receivedAt: 'no-es-fecha' }).success).toBe(false);
  });

  it('un incidente exige título y descripción útiles', () => {
    const incident = { title: 'Correo enviado a otra persona', description: 'Se envió un listado de candidatas a un destinatario equivocado.', detectedAt: '2026-12-10T10:00:00Z', affectsSensitiveData: false, affectsMinors: true, affectsEconomicData: false };
    expect(privacyIncidentSchema.safeParse(incident).success).toBe(true);
    expect(privacyIncidentSchema.safeParse({ ...incident, description: 'corto' }).success).toBe(false);
  });
});

describe('registro de actividades y sub-encargados', () => {
  it('toda actividad apunta a sub-encargados que existen', () => {
    for (const activity of PROCESSING_ACTIVITIES) {
      expect(activitySubprocessors(activity, SUBPROCESSORS)).toHaveLength(activity.subprocessors.length);
    }
  });

  it('las actividades con datos de salud o de menores están marcadas como sensibles', () => {
    for (const id of ['candidates', 'hr']) {
      expect(PROCESSING_ACTIVITIES.find((a) => a.id === id)?.sensitive).toBe(true);
    }
  });

  it('cada actividad dice su base de licitud, su finalidad y su conservación', () => {
    for (const activity of PROCESSING_ACTIVITIES) {
      expect(activity.legalBasis.length).toBeGreaterThan(0);
      expect(activity.purpose.length).toBeGreaterThan(10);
      expect(activity.retention.length).toBeGreaterThan(5);
    }
  });

  it('la base de datos principal figura como transferencia internacional', () => {
    expect(INTERNATIONAL_SUBPROCESSORS.map((s) => s.id)).toContain('neon');
    expect(SUBPROCESSORS.find((s) => s.id === 'khipu')?.international).toBe(false);
  });

  it('no hay sub-encargados duplicados', () => {
    const ids = SUBPROCESSORS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('búsqueda de una persona: validación de la entrada', () => {
  const { personQuerySchema } = require('@/lib/privacy/schema') as typeof import('@/lib/privacy/schema');

  it('exige correo o RUT y normaliza ambos', () => {
    expect(personQuerySchema.safeParse({}).success).toBe(false);
    expect(personQuerySchema.safeParse({ email: '', rut: '' }).success).toBe(false);
    expect(personQuerySchema.parse({ email: ' ANA@Test.cl ' })).toEqual({ email: 'ana@test.cl', rut: undefined });
    expect(personQuerySchema.parse({ rut: '12.345.678-5' })).toMatchObject({ rut: '123456785' });
  });

  it('rechaza un correo o un RUT mal formados', () => {
    expect(personQuerySchema.safeParse({ email: 'no-es-correo' }).success).toBe(false);
    expect(personQuerySchema.safeParse({ rut: '12.345.678-9' }).success).toBe(false);
  });
});

describe('RUT de persona jurídica vs. natural', () => {
  const { isLegalEntityRut } = require('@/lib/privacy/constants') as typeof import('@/lib/privacy/constants');

  it('solo los RUT desde 50.000.000 se publican como de una empresa', () => {
    expect(isLegalEntityRut('765432101')).toBe(true);
    expect(isLegalEntityRut('503456781')).toBe(true);
    expect(isLegalEntityRut('123456785')).toBe(false);
    expect(isLegalEntityRut('')).toBe(false);
  });
});
