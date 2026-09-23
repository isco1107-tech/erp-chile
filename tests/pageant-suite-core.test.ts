import { publicSlugProblem, slugify } from '@/lib/events/public-slug';
import { buildPageantReadiness, type PageantReadinessInput } from '@/lib/events/readiness';
import { chainStartTimes, computeRunOfShow, formatCountdown, formatDrift, type RunOfShowBlock } from '@/lib/events/run-of-show';

/**
 * Lógica pura de la suite de certámenes: dirección del micrositio, checklist
 * "¿listos para la gala?" y motor del modo show de la escaleta.
 */

describe('slug del micrositio', () => {
  it('normaliza tildes, eñes, mayúsculas y separadores', () => {
    expect(slugify('  Miss Universe Chile 2026  ')).toBe('miss-universe-chile-2026');
    expect(slugify('Señorita Región de Ñuble — Edición XV')).toBe('senorita-region-de-nuble-edicion-xv');
    expect(slugify('---Gala///Final!!!')).toBe('gala-final');
  });

  it('recorta al largo máximo sin dejar un guion colgando', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('valida formato, largo y palabras reservadas', () => {
    expect(publicSlugProblem('miss-earth-chile-2026')).toBeNull();
    expect(publicSlugProblem('ab')).toMatch(/al menos/);
    expect(publicSlugProblem('Miss-Chile')).toMatch(/minúsculas/);
    expect(publicSlugProblem('-miss')).toMatch(/minúsculas/);
    expect(publicSlugProblem('miss--chile')).toMatch(/minúsculas/);
    expect(publicSlugProblem('dashboard')).toMatch(/reservada/);
  });
});

const NOW = new Date('2026-10-01T15:00:00Z');

function readinessInput(overrides: Partial<PageantReadinessInput> = {}): PageantReadinessInput {
  return {
    projectId: 'p1',
    now: NOW,
    galaDate: new Date('2026-10-10T23:00:00Z'),
    venueName: 'Teatro Municipal',
    modules: { candidates: true, judging: true, production: true, sponsorships: true, ticketing: true, voting: true, projects: true },
    candidates: { official: 12, applicantsToReview: 0, numbered: 12, withPhoto: 12, contractsSigned: 12 },
    judging: { rounds: 3, roundsWithValidWeights: 3, hasFinalRound: true, judges: 5 },
    production: { stageBlocks: 20, wardrobeItems: 36, wardrobeNotReady: 0, accreditations: 40 },
    sponsorships: {
      confirmed: 6,
      deliverablesTotal: 18,
      deliverablesDone: 18,
      deliverablesOverdue: 0,
      cashCommitted: 30_000_000,
      cashCollected: 30_000_000,
      agreementsPendingSignature: 0,
    },
    ticketing: { ticketTypes: 3, linkActive: true, ordersPendingPayment: 0 },
    voting: { linkActive: true },
    site: { published: true, hasCover: true },
    ...overrides,
  };
}

describe('¿listos para la gala?', () => {
  it('un certamen completo puntúa 100 y no tiene críticos', () => {
    const report = buildPageantReadiness(readinessInput());
    expect(report.score).toBe(100);
    expect(report.items.every((item) => item.status === 'ok')).toBe(true);
    expect(report.critical).toHaveLength(0);
    expect(report.daysToGala).toBe(10);
  });

  it('solo exige lo de los módulos contratados', () => {
    const report = buildPageantReadiness(
      readinessInput({ modules: { candidates: true, judging: false, production: false, sponsorships: false, ticketing: false, voting: false, projects: true } })
    );
    const areas = new Set(report.items.map((item) => item.area));
    expect(areas.has('judging')).toBe(false);
    expect(areas.has('ticketing')).toBe(false);
    expect(areas.has('candidates')).toBe(true);
  });

  it('marca como crítico lo pendiente duro a 14 días o menos de la gala', () => {
    const report = buildPageantReadiness(
      readinessInput({
        judging: { rounds: 2, roundsWithValidWeights: 1, hasFinalRound: true, judges: 0 },
        production: { stageBlocks: 0, wardrobeItems: 0, wardrobeNotReady: 0, accreditations: 10 },
      })
    );
    const criticalIds = report.critical.map((item) => item.id);
    expect(criticalIds).toEqual(expect.arrayContaining(['judging-weights', 'judging-judges', 'production-run-of-show']));
    expect(report.score).toBeLessThan(100);
  });

  it('sin fecha de gala no hay cuenta regresiva ni críticos, pero sí el pendiente', () => {
    const report = buildPageantReadiness(readinessInput({ galaDate: null }));
    expect(report.daysToGala).toBeNull();
    expect(report.critical).toHaveLength(0);
    expect(report.items.find((item) => item.id === 'gala-date')?.status).toBe('todo');
  });

  it('entregables vencidos pesan más que entregables solo pendientes', () => {
    const overdue = buildPageantReadiness(
      readinessInput({ sponsorships: { ...readinessInput().sponsorships, deliverablesDone: 10, deliverablesOverdue: 2 } })
    );
    const pending = buildPageantReadiness(readinessInput({ sponsorships: { ...readinessInput().sponsorships, deliverablesDone: 10 } }));
    expect(overdue.items.find((i) => i.id === 'sponsors-deliverables')?.status).toBe('todo');
    expect(pending.items.find((i) => i.id === 'sponsors-deliverables')?.status).toBe('warn');
  });

  it('describe la cobranza de auspicios en pesos chilenos', () => {
    const report = buildPageantReadiness(readinessInput({ sponsorships: { ...readinessInput().sponsorships, cashCollected: 12_500_000 } }));
    expect(report.items.find((i) => i.id === 'sponsors-collection')?.detail).toBe('Cobrado $12.500.000 de $30.000.000');
  });
});

const T0 = new Date('2026-10-10T23:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function block(id: string, startMinute: number, duration: number, extra: Partial<RunOfShowBlock> = {}): RunOfShowBlock {
  return { id, startTime: at(startMinute), durationMinutes: duration, status: 'PENDING', actualStartedAt: null, actualEndedAt: null, ...extra };
}

describe('modo show de la escaleta', () => {
  it('antes de partir: sin bloque al aire, a tiempo, el primero es el siguiente', () => {
    const state = computeRunOfShow([block('a', 0, 10), block('b', 10, 20)], at(-5));
    expect(state.currentId).toBeNull();
    expect(state.nextId).toBe('a');
    expect(state.driftMinutes).toBe(0);
    expect(state.projectedEnd?.getTime()).toBe(at(30).getTime());
  });

  it('un bloque que partió 3 minutos tarde corre todo lo que sigue', () => {
    const state = computeRunOfShow(
      [block('a', 0, 10, { status: 'IN_PROGRESS', actualStartedAt: at(3) }), block('b', 10, 20), block('c', 30, 5)],
      at(5)
    );
    expect(state.currentId).toBe('a');
    expect(state.nextId).toBe('b');
    expect(state.driftMinutes).toBe(3);
    expect(state.currentRemainingSeconds).toBe(8 * 60);
    expect(state.projectedStartById.b?.getTime()).toBe(at(13).getTime());
    expect(state.projectedEnd?.getTime()).toBe(at(38).getTime());
  });

  it('un bloque que se pasa de su duración suma el exceso en vivo', () => {
    const state = computeRunOfShow([block('a', 0, 10, { status: 'IN_PROGRESS', actualStartedAt: at(0) }), block('b', 10, 20)], at(14));
    expect(state.driftMinutes).toBe(4);
    expect(state.currentRemainingSeconds).toBe(-4 * 60);
  });

  it('sin bloque al aire, el atraso sale del último bloque cerrado (y puede ser adelanto)', () => {
    const state = computeRunOfShow(
      [block('a', 0, 10, { status: 'DONE', actualStartedAt: at(0), actualEndedAt: at(8) }), block('b', 10, 20)],
      at(9)
    );
    expect(state.driftMinutes).toBe(-2);
    expect(state.nextId).toBe('b');
    expect(state.doneCount).toBe(1);
  });

  it('lo omitido no bloquea el siguiente ni suma al término', () => {
    const state = computeRunOfShow(
      [block('a', 0, 10, { status: 'DONE', actualStartedAt: at(0), actualEndedAt: at(10) }), block('b', 10, 20, { status: 'SKIPPED' }), block('c', 30, 5)],
      at(11)
    );
    expect(state.nextId).toBe('c');
    expect(state.skippedCount).toBe(1);
    expect(state.projectedEnd?.getTime()).toBe(at(35).getTime());
  });

  it('show terminado: el término es el cierre real del último bloque', () => {
    const state = computeRunOfShow(
      [block('a', 0, 10, { status: 'DONE', actualStartedAt: at(0), actualEndedAt: at(12) }), block('b', 10, 20, { status: 'DONE', actualStartedAt: at(12), actualEndedAt: at(33) })],
      at(40)
    );
    expect(state.currentId).toBeNull();
    expect(state.nextId).toBeNull();
    expect(state.projectedEnd?.getTime()).toBe(at(33).getTime());
  });

  it('encadenar horarios reprograma en cadena y solo devuelve lo que cambia', () => {
    const changes = chainStartTimes([block('a', 0, 10), block('b', 10, 15), block('c', 40, 5)], at(0));
    expect(changes).toEqual([{ id: 'c', startTime: at(25) }]);
  });

  it('formatea el atraso y la cuenta regresiva', () => {
    expect(formatDrift(0)).toBe('A tiempo');
    expect(formatDrift(4)).toBe('+4 min atrasado');
    expect(formatDrift(-2)).toBe('2 min adelantado');
    expect(formatCountdown(125)).toBe('02:05');
    expect(formatCountdown(-61)).toBe('−01:01');
  });
});
