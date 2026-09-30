import { channelBreakdown } from '@/lib/customer-care/channels';
import { computeSurveyMetrics, needsFollowUp } from '@/lib/customer-care/metrics';
import { findInactiveCustomers } from '@/lib/customer-care/inactive';
import { renderMessage, formatLeadTime } from '@/lib/customer-care/messages';
import { evaluateInspection, supplierScorecard, type QualityParameter } from '@/lib/quality/inspection';
import { isReviewDue, pendingAcknowledgements, ackSummary, type ProcedureLike } from '@/lib/quality/procedures';
import { STARTER_PROCEDURES, STARTER_TEMPLATES } from '@/lib/quality/starter';
import { procedureSchema, templateSchema } from '@/modules/quality/schema';
import { surveyResponseSchema } from '@/modules/customer-care/schema';

describe('Fidelización', () => {
  it('reparte clientes por canal y deja visible a los sin registrar', () => {
    expect(channelBreakdown([])).toEqual([]);
    const breakdown = channelBreakdown(['REFERIDO', 'REFERIDO', null, 'FERIA']);
    expect(breakdown).toHaveLength(3);
    expect(breakdown.find((b) => b.channel === 'REFERIDO')).toEqual({ channel: 'REFERIDO', label: 'Recomendación de otro cliente', count: 2, percent: 50 });
    expect(breakdown.find((b) => b.channel === null)).toEqual({ channel: null, label: 'Sin registrar', count: 1, percent: 25 });
    expect(breakdown.find((b) => b.channel === 'FERIA')?.percent).toBe(25);
    expect(channelBreakdown(['xyz'])).toEqual([{ channel: 'OTRO', label: 'Otro', count: 1, percent: 100 }]);
  });

  it('calcula NPS y satisfacción, y omite lo que no tiene datos', () => {
    expect(computeSurveyMetrics([])).toEqual({ responses: 0, nps: null, promoters: 0, passives: 0, detractors: 0, csat: null, csatResponses: 0 });
    expect(computeSurveyMetrics([{ nps: null, csat: null }]).responses).toBe(0);
    expect(
      computeSurveyMetrics([
        { nps: 10, csat: 5 },
        { nps: 9, csat: 4 },
        { nps: 7, csat: 3 },
        { nps: 3, csat: 1 },
      ])
    ).toEqual({ responses: 4, promoters: 2, passives: 1, detractors: 1, nps: 25, csat: 3.3, csatResponses: 4 });
  });

  it('una mala respuesta pide seguimiento', () => {
    expect(needsFollowUp({ nps: 6, csat: null })).toBe(true);
    expect(needsFollowUp({ nps: 7, csat: null })).toBe(false);
    expect(needsFollowUp({ nps: null, csat: 2 })).toBe(true);
    expect(needsFollowUp({ nps: 9, csat: 3 })).toBe(false);
  });

  it('valida la respuesta pública de la encuesta', () => {
    expect(surveyResponseSchema.safeParse({ csat: 5, nps: 10 }).success).toBe(true);
    expect(surveyResponseSchema.safeParse({ csat: 0, nps: 10 }).success).toBe(false);
    expect(surveyResponseSchema.safeParse({ csat: 5, nps: 11 }).success).toBe(false);
    expect(surveyResponseSchema.safeParse({ csat: 4.5, nps: 8 }).success).toBe(false);
    expect(surveyResponseSchema.safeParse({ nps: 8 }).success).toBe(false);
  });

  it('detecta clientes inactivos, agrega compras y excluye al consumidor final', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const rows = [
      { contactId: 'c1', rutClean: '111111111', issueDate: new Date('2026-07-01T12:00:00Z'), totalAmount: 5000 },
      { contactId: 'c2', rutClean: '222222222', issueDate: new Date('2026-09-15T12:00:00Z'), totalAmount: 10000 },
      { contactId: 'c3', rutClean: '666666666', issueDate: new Date('2026-01-01T12:00:00Z'), totalAmount: 50000 },
      { contactId: 'c4', rutClean: '444444444', issueDate: new Date('2026-05-01T12:00:00Z'), totalAmount: 10000 },
      { contactId: 'c4', rutClean: '444444444', issueDate: new Date('2026-06-01T12:00:00Z'), totalAmount: 20000 },
    ];
    const inactive = findInactiveCustomers(rows, now, 60);
    expect(inactive).toHaveLength(2);
    expect(inactive[0]).toEqual({ contactId: 'c4', lastPurchaseAt: new Date('2026-06-01T12:00:00Z'), daysSince: 121, purchaseCount: 2, totalSpent: 30000 });
    expect(inactive[1]).toMatchObject({ contactId: 'c1', daysSince: 91 });
    expect(findInactiveCustomers(rows, now, 0)).toEqual([]);
  });

  it('arma mensajes sin dejar variables a la vista', () => {
    const rendered = renderMessage('Hola {{cliente}}, te escribimos de {{empresa}}. {{desconocida}}', { cliente: 'Juan', empresa: 'Acme' });
    expect(rendered).toBe('Hola Juan, te escribimos de Acme.');
    expect(rendered).not.toContain('{{');
    expect(formatLeadTime(null)).toBe('unos días hábiles');
    expect(formatLeadTime(1)).toBe('1 día hábil');
    expect(formatLeadTime(5)).toBe('5 días hábiles');
  });
});

describe('Calidad: inspecciones', () => {
  const params: QualityParameter[] = [
    { key: 'brix', name: 'Brix', type: 'NUMBER', min: 3, max: 4.5, unit: '°Bx', required: true },
    { key: 'clean', name: 'Limpieza', type: 'CHECK', required: true },
    { key: 'temp', name: 'Temperatura', type: 'NUMBER', required: false },
  ];

  it('aprueba dentro de rango y falla fuera de él, explicando por qué', () => {
    expect(evaluateInspection(params, { brix: 4, clean: true, temp: 15 })).toMatchObject({ status: 'PASSED', failed: [], missing: [] });
    const high = evaluateInspection(params, { brix: 5, clean: true });
    expect(high.status).toBe('FAILED');
    expect(high.results.find((r) => r.key === 'brix')?.reason).toContain('supera el máximo');
    expect(evaluateInspection(params, { brix: 2, clean: true }).results.find((r) => r.key === 'brix')?.reason).toContain('bajo el mínimo');
    const check = evaluateInspection(params, { brix: 4, clean: false });
    expect(check.failed).toEqual(['Limpieza']);
  });

  it('informa los obligatorios sin valor y registra sin límites cuando no los hay', () => {
    const result = evaluateInspection(params, { brix: 4 });
    expect(result.missing).toEqual(['Limpieza']);
    // Medición sin mínimo ni máximo: solo se registra, nunca falla.
    expect(evaluateInspection(params, { brix: 4, clean: true, temp: 9999 }).status).toBe('PASSED');
    // Un NaN o Infinity no es una medición.
    expect(evaluateInspection(params, { brix: Number.NaN, clean: true }).missing).toEqual(['Brix']);
  });

  it('puntúa a cada productor y muestra primero al de peor desempeño', () => {
    const scorecard = supplierScorecard([
      { contactId: 'a', status: 'PASSED', inspectedAt: new Date('2026-01-01') },
      { contactId: 'a', status: 'PASSED', inspectedAt: new Date('2026-01-02') },
      { contactId: 'a', status: 'FAILED', inspectedAt: new Date('2026-01-03') },
      { contactId: 'b', status: 'PASSED', inspectedAt: new Date('2026-01-01') },
    ]);
    expect(scorecard.map((s) => [s.contactId, s.passRate])).toEqual([['a', 67], ['b', 100]]);
  });

  it('el contenido inicial es válido para los esquemas y no inventa límites', () => {
    for (const p of STARTER_PROCEDURES) expect(procedureSchema.safeParse(p).success).toBe(true);
    for (const t of STARTER_TEMPLATES) {
      expect(templateSchema.safeParse({ ...t, isActive: true }).success).toBe(true);
      for (const parameter of t.parameters) expect(parameter.min ?? null).toBeNull();
    }
    expect(new Set(STARTER_PROCEDURES.map((p) => p.title)).size).toBe(STARTER_PROCEDURES.length);
  });

  it('rechaza plantillas con parámetros repetidos o rango invertido', () => {
    const base = { name: 'Prueba', kind: 'FINISHED', isActive: true };
    const p = { key: 'brix', name: 'Brix', type: 'NUMBER', required: true };
    expect(templateSchema.safeParse({ ...base, parameters: [p, p] }).success).toBe(false);
    expect(templateSchema.safeParse({ ...base, parameters: [{ ...p, min: 5, max: 3 }] }).success).toBe(false);
    expect(templateSchema.safeParse({ ...base, parameters: [{ ...p, min: 3, max: 5 }] }).success).toBe(true);
  });
});

describe('Calidad: procedimientos', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  const active: ProcedureLike = { id: 'p1', status: 'ACTIVE', version: 2, reviewEveryDays: 30, lastReviewedAt: new Date('2026-01-29T12:00:00Z'), createdAt: new Date('2026-01-01T12:00:00Z') };

  it('avisa cuándo toca revisar un procedimiento vigente', () => {
    expect(isReviewDue(active, now)).toBe(true);
    expect(isReviewDue({ ...active, lastReviewedAt: new Date('2026-02-20T12:00:00Z') }, now)).toBe(false);
    expect(isReviewDue({ ...active, status: 'DRAFT' }, now)).toBe(false);
    expect(isReviewDue({ ...active, reviewEveryDays: null }, now)).toBe(false);
  });

  it('el acuse de una versión anterior no cuenta y los borradores no se piden', () => {
    const procs: ProcedureLike[] = [active, { ...active, id: 'p2', status: 'DRAFT' }];
    expect(pendingAcknowledgements(procs, [{ procedureId: 'p1', userId: 'u1', version: 1 }], 'u1').map((p) => p.id)).toEqual(['p1']);
    expect(pendingAcknowledgements(procs, [{ procedureId: 'p1', userId: 'u1', version: 2 }], 'u1')).toEqual([]);
  });

  it('resume el avance de lectura del equipo', () => {
    const acks = ['u1', 'u2', 'u3'].map((userId) => ({ procedureId: 'p1', userId, version: 2 }));
    expect(ackSummary({ id: 'p1', version: 2 }, acks, ['u1', 'u2', 'u3', 'u4'])).toEqual({ procedureId: 'p1', read: 3, team: 4, percent: 75 });
    expect(ackSummary({ id: 'p1', version: 2 }, [], []).percent).toBeNull();
  });

  it('valida el largo mínimo de un procedimiento', () => {
    expect(procedureSchema.safeParse({ title: 'Ok', category: 'OPERACION', content: 'x'.repeat(20) }).success).toBe(false);
    expect(procedureSchema.safeParse({ title: 'Recepción', category: 'OPERACION', content: '1. Pesar la fruta.' }).success).toBe(true);
  });
});
