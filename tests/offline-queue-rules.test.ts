/**
 * Reglas de la cola de contingencia (src/lib/offline/queue-rules.ts): orden de
 * envío, límite de 2 horas sin conexión, cómo se aplica cada respuesta del
 * servidor y qué se puede borrar del equipo.
 */
import {
  applyOutcome,
  isPrunable,
  markForRetry,
  newOperationKey,
  offlineCaptureBlock,
  summarize,
  syncOrder,
  type QueuedOperation,
} from '@/lib/offline/queue-rules';

let counter = 0;
const ago = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function op(overrides: Partial<QueuedOperation> = {}): QueuedOperation {
  counter += 1;
  return {
    idempotencyKey: `key-${counter}`,
    companyId: 'c1',
    userId: 'u1',
    kind: 'POS_SALE',
    status: 'PENDING',
    label: 'Venta',
    payload: {},
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('syncOrder', () => {
  it('solo lo pendiente de esta persona en esta empresa, en el orden en que se hizo', () => {
    const first = op({ capturedAt: ago(50_000) });
    const second = op({ capturedAt: ago(30_000) });
    const third = op({ capturedAt: ago(10_000) });
    const list = [third, op({ status: 'FAILED' }), first, op({ status: 'DONE' }), op({ companyId: 'c2' }), second, op({ userId: 'u2' })];
    expect(syncOrder(list, 'c1', 'u1').map((o) => o.idempotencyKey)).toEqual([first, second, third].map((o) => o.idempotencyKey));
  });
});

describe('offlineCaptureBlock (límite de 2 horas)', () => {
  const now = new Date();

  it('sin pendientes se puede operar', () => {
    expect(offlineCaptureBlock([], 'c1', now)).toBeNull();
  });

  it('a 1 h 59 min de la primera pendiente todavía se puede', () => {
    expect(offlineCaptureBlock([op({ capturedAt: ago(HOUR + 59 * MIN, now.getTime()) })], 'c1', now)).toBeNull();
  });

  it('pasadas las 2 horas se bloquea', () => {
    expect(offlineCaptureBlock([op({ capturedAt: ago(2 * HOUR + MIN, now.getTime()) })], 'c1', now)).toContain('2 horas');
  });

  it('no cuentan las rechazadas ni lo pendiente de otra empresa', () => {
    const old = ago(5 * HOUR, now.getTime());
    expect(offlineCaptureBlock([op({ capturedAt: old, status: 'FAILED' }), op({ capturedAt: old, companyId: 'c2' })], 'c1', now)).toBeNull();
  });
});

describe('applyOutcome', () => {
  it('aplicada: guarda el documento creado y su folio', () => {
    const updated = applyOutcome(op({ retry: true, folio: 10 }), { status: 'DONE', resultRef: 'ref-123', folio: 200, error: null });
    expect(updated).toMatchObject({ status: 'DONE', resultRef: 'ref-123', folio: 200, retry: false, error: null });
  });

  it('aplicada sin folio nuevo: conserva el que tenía', () => {
    expect(applyOutcome(op({ folio: 50 }), { status: 'DONE', resultRef: 'r', folio: null, error: null }).folio).toBe(50);
  });

  it('rechazada: guarda el motivo (o uno genérico)', () => {
    expect(applyOutcome(op(), { status: 'FAILED', resultRef: null, folio: null, error: 'Sin stock' })).toMatchObject({ status: 'FAILED', error: 'Sin stock' });
    expect(applyOutcome(op(), { status: 'FAILED', resultRef: null, folio: null, error: null }).error).toBe('La operación fue rechazada');
  });

  it('a medias en el servidor: queda para revisar, no se reintenta sola', () => {
    const updated = applyOutcome(op(), { status: 'PROCESSING', resultRef: null, folio: null, error: null });
    expect(updated.status).toBe('REVIEW');
    expect(updated.error).toContain('revisa');
  });
});

describe('markForRetry', () => {
  it('una rechazada vuelve a la cola como reintento explícito', () => {
    expect(markForRetry(op({ status: 'FAILED', error: 'x' }))).toMatchObject({ status: 'PENDING', retry: true, error: null });
  });

  it('pendientes y aplicadas no cambian', () => {
    const pending = op();
    const done = op({ status: 'DONE' });
    expect(markForRetry(pending)).toBe(pending);
    expect(markForRetry(done)).toBe(done);
  });
});

describe('summarize', () => {
  it('separa lo propio de lo de otra empresa u otra persona, sin contar lo aplicado', () => {
    const list = [
      op(),
      op({ status: 'FAILED' }),
      op({ status: 'REVIEW' }),
      op({ status: 'DONE' }),
      op({ companyId: 'c2' }),
      op({ userId: 'u2', status: 'FAILED' }),
      op({ companyId: 'c2', userId: 'u2', status: 'DONE' }),
    ];
    expect(summarize(list, 'c1', 'u1')).toEqual({ pending: 1, failed: 1, review: 1, foreign: 2 });
  });
});

describe('isPrunable', () => {
  const now = new Date();

  it('lo aplicado se borra del equipo pasado un día', () => {
    expect(isPrunable(op({ status: 'DONE', capturedAt: ago(25 * HOUR, now.getTime()) }), now)).toBe(true);
    expect(isPrunable(op({ status: 'DONE', capturedAt: ago(2 * HOUR, now.getTime()) }), now)).toBe(false);
  });

  it('lo pendiente nunca se borra solo, aunque sea viejo', () => {
    expect(isPrunable(op({ capturedAt: ago(30 * HOUR, now.getTime()) }), now)).toBe(false);
  });
});

describe('newOperationKey', () => {
  it('claves únicas con prefijo propio', () => {
    const a = newOperationKey();
    const b = newOperationKey();
    expect(a.startsWith('off-')).toBe(true);
    expect(a).not.toBe(b);
  });
});
