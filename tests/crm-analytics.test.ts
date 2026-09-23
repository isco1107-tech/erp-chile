import { breakdownBy, dealRiskFlags, forecastByMonth, normalizeTags, type CrmAnalyticsOpportunity } from '@/lib/crm/analytics';

/**
 * Analítica del CRM: el pronóstico por mes se lee en el calendario de
 * Santiago (no UTC) y los desgloses no inventan tasas sin cierres.
 */

const NOW = new Date('2026-09-23T15:00:00Z');

function opp(overrides: Partial<CrmAnalyticsOpportunity> = {}): CrmAnalyticsOpportunity {
  return {
    stage: 'PROPOSAL',
    amount: 1_000_000,
    barterValuation: 0,
    probability: 50,
    expectedCloseDate: new Date('2026-10-15T15:00:00Z'),
    createdAt: new Date('2026-08-01T15:00:00Z'),
    closedAt: null,
    ...overrides,
  };
}

describe('pronóstico por mes de cierre', () => {
  it('agrupa por mes de Santiago y pondera por probabilidad', () => {
    const buckets = forecastByMonth([opp(), opp({ amount: 3_000_000, probability: 25 })], NOW, 3);
    const october = buckets.find((b) => b.key === '2026-10');
    expect(october).toMatchObject({ count: 2, amount: 4_000_000, weighted: 500_000 + 750_000 });
    expect(buckets.filter((b) => /^\d{4}-\d{2}$/.test(b.key)).map((b) => b.key)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('una fecha a medianoche UTC del 1° cae en el mes anterior en Chile', () => {
    // 2026-11-01T01:00Z = 31 de octubre 22:00 en Santiago.
    const buckets = forecastByMonth([opp({ expectedCloseDate: new Date('2026-11-01T01:00:00Z') })], NOW, 3);
    expect(buckets.find((b) => b.key === '2026-10')?.count).toBe(1);
    expect(buckets.find((b) => b.key === '2026-11')?.count).toBe(0);
  });

  it('separa atrasados, sin fecha y más adelante; ignora cerrados', () => {
    const buckets = forecastByMonth(
      [
        opp({ expectedCloseDate: new Date('2026-07-10T15:00:00Z') }),
        opp({ expectedCloseDate: null }),
        opp({ expectedCloseDate: new Date('2027-06-10T15:00:00Z') }),
        opp({ stage: 'WON', closedAt: NOW }),
      ],
      NOW,
      3
    );
    expect(buckets[0]).toMatchObject({ key: 'overdue', count: 1 });
    expect(buckets.find((b) => b.key === 'undated')?.count).toBe(1);
    expect(buckets.find((b) => b.key === 'later')?.count).toBe(1);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe('desglose', () => {
  it('calcula abierto, ganado, canje, tasa de cierre y ciclo por grupo', () => {
    const rows = breakdownBy(
      [
        { ...opp({ stage: 'WON', amount: 5_000_000, barterValuation: 2_000_000, closedAt: new Date('2026-08-11T15:00:00Z') }), group: 'SPONSORSHIP' },
        { ...opp({ stage: 'LOST', closedAt: NOW }), group: 'SPONSORSHIP' },
        { ...opp(), group: 'SPONSORSHIP' },
        { ...opp({ amount: 200_000 }), group: 'CORPORATE_TICKETS' },
      ],
      (o) => ({ key: o.group, label: o.group })
    );
    expect(rows[0]).toMatchObject({
      key: 'SPONSORSHIP',
      openCount: 1,
      openAmount: 1_000_000,
      wonCount: 1,
      wonAmount: 5_000_000,
      wonBarter: 2_000_000,
      lostCount: 1,
      winRatePct: 50,
      medianCycleDays: 10,
    });
    expect(rows[1]).toMatchObject({ key: 'CORPORATE_TICKETS', winRatePct: null, medianCycleDays: null });
  });
});

describe('señales de riesgo', () => {
  it('detecta estancado, sin próximo paso y fecha de cierre vencida', () => {
    const flags = dealRiskFlags(
      { stage: 'NEGOTIATION', stageChangedAt: new Date('2026-08-01T15:00:00Z'), expectedCloseDate: new Date('2026-09-10T15:00:00Z'), hasPendingActivity: false },
      NOW,
      21
    );
    expect(flags).toEqual(['stale', 'no-next-step', 'close-date-passed']);
  });

  it('un negocio cerrado no tiene riesgos', () => {
    expect(dealRiskFlags({ stage: 'WON', stageChangedAt: new Date('2020-01-01'), expectedCloseDate: null, hasPendingActivity: false }, NOW, 21)).toEqual([]);
  });
});

describe('etiquetas', () => {
  it('recorta, colapsa espacios y deduplica sin distinguir mayúsculas', () => {
    expect(normalizeTags(['  Miss  Universe ', 'miss universe', 'Canje', '', 'VIP'])).toEqual(['Miss Universe', 'Canje', 'VIP']);
  });

  it('limita a 12 etiquetas', () => {
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
  });
});
