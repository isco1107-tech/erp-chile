import {
  CRON_MAX_DURATION_SECONDS,
  MAX_CRON_HOPS,
  buildContinuationUrl,
  createCompanyCursor,
  createCronBudget,
  parseCronCursor,
} from '@/lib/cron/batch-core';

describe('createCronBudget', () => {
  it('no se agota antes de (duración - reserva) y sí después', () => {
    let t = 1_000;
    const budget = createCronBudget({ maxDurationSeconds: 100, reserveSeconds: 40, now: () => t });
    expect(budget.exhausted()).toBe(false);
    t += 59_999;
    expect(budget.exhausted()).toBe(false);
    t += 1;
    expect(budget.exhausted()).toBe(true);
  });

  it('usa 300 s y 45 s de reserva por defecto', () => {
    let t = 0;
    const budget = createCronBudget({ now: () => t });
    t = (CRON_MAX_DURATION_SECONDS - 45) * 1000 - 1;
    expect(budget.exhausted()).toBe(false);
    t += 1;
    expect(budget.exhausted()).toBe(true);
  });

  it('una reserva mayor que la duración agota el presupuesto de inmediato', () => {
    const budget = createCronBudget({ maxDurationSeconds: 10, reserveSeconds: 60, now: () => 0 });
    expect(budget.exhausted()).toBe(true);
  });
});

describe('createCompanyCursor', () => {
  it('recorre todo y deja nextAfter en null si el presupuesto alcanza', () => {
    const cursor = createCompanyCursor({ exhausted: () => false });
    for (const id of ['a', 'b', 'c']) expect(cursor.stopBefore(id)).toBe(false);
    expect(cursor.nextAfter).toBeNull();
  });

  it('corta cuando se agota y continúa desde la última empresa procesada', () => {
    let exhausted = false;
    const cursor = createCompanyCursor({ exhausted: () => exhausted });
    expect(cursor.stopBefore('a')).toBe(false);
    expect(cursor.stopBefore('b')).toBe(false);
    exhausted = true;
    expect(cursor.stopBefore('c')).toBe(true);
    expect(cursor.nextAfter).toBe('b');
  });

  it('siempre procesa al menos una empresa aunque el tiempo ya esté agotado', () => {
    const cursor = createCompanyCursor({ exhausted: () => true });
    expect(cursor.stopBefore('a')).toBe(false);
    expect(cursor.stopBefore('b')).toBe(true);
    expect(cursor.nextAfter).toBe('a');
  });

  it('sin presupuesto nunca corta', () => {
    const cursor = createCompanyCursor();
    expect(cursor.stopBefore('a')).toBe(false);
    expect(cursor.stopBefore('b')).toBe(false);
    expect(cursor.nextAfter).toBeNull();
  });
});

describe('parseCronCursor', () => {
  const req = (qs: string) => new Request(`https://erp.test/api/x/cron${qs}`);

  it('sin parámetros: sin cursor y hop 0', () => {
    expect(parseCronCursor(req(''))).toEqual({ after: null, hop: 0 });
  });

  it('lee after y hop válidos', () => {
    expect(parseCronCursor(req('?after=clx_abc-123&hop=3'))).toEqual({ after: 'clx_abc-123', hop: 3 });
  });

  it('ignora un cursor malformado y un hop no numérico o negativo', () => {
    expect(parseCronCursor(req("?after=a'%20OR%201=1&hop=abc"))).toEqual({ after: null, hop: 0 });
    expect(parseCronCursor(req('?hop=-4'))).toEqual({ after: null, hop: 0 });
  });

  it('limita hop al máximo', () => {
    expect(parseCronCursor(req('?hop=9999')).hop).toBe(MAX_CRON_HOPS);
  });
});

describe('buildContinuationUrl', () => {
  it('conserva la ruta y los demás parámetros (p. ej. role) y actualiza cursor y hop', () => {
    const url = new URL(buildContinuationUrl('https://erp.test/api/agents/run?role=CFO&after=old&hop=1', 'new', 2));
    expect(url.pathname).toBe('/api/agents/run');
    expect(url.searchParams.get('role')).toBe('CFO');
    expect(url.searchParams.get('after')).toBe('new');
    expect(url.searchParams.get('hop')).toBe('2');
  });
});
