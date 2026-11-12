import {
  allowedSerialTransitions,
  canTransitionSerial,
  describeLotAllocations,
  eventKindForTransition,
  normalizeSerial,
  parseFlowWindow,
  parseSerialList,
  pendingQuantity,
  serialCoverage,
  sortTimeline,
  stageOfMovement,
  summarizeMovementStages,
  MAX_SERIALS_PER_BATCH,
} from '@/lib/inventory/traceability';

const mv = (type: Parameters<typeof stageOfMovement>[0]['type'], quantity: number, previousStock: number, newStock: number) => ({ type, quantity, previousStock, newStock });

describe('etapas del flujo', () => {
  it('clasifica cada tipo de movimiento', () => {
    expect(stageOfMovement(mv('PURCHASE_IN', 5, 0, 5))).toBe('RECEIVED');
    expect(stageOfMovement(mv('ADJUSTMENT_IN', 1, 5, 6))).toBe('RECEIVED');
    expect(stageOfMovement(mv('SALE_OUT', 2, 6, 4))).toBe('SOLD');
    expect(stageOfMovement(mv('ADJUSTMENT_OUT', 1, 4, 3))).toBe('LOST');
  });

  it('cuenta un traslado una sola vez, por su pata de salida', () => {
    expect(stageOfMovement(mv('TRANSFER', 3, 10, 7))).toBe('TRANSFERRED');
    expect(stageOfMovement(mv('TRANSFER', 3, 0, 3))).toBeNull();
  });

  it('suma por etapa sin contar la entrada del traslado', () => {
    const totals = summarizeMovementStages([
      mv('PURCHASE_IN', 10, 0, 10),
      mv('TRANSFER', 4, 10, 6),
      mv('TRANSFER', 4, 0, 4),
      mv('SALE_OUT', 1, 6, 5),
      mv('SALE_OUT', 2, 5, 3),
      mv('ADJUSTMENT_OUT', 1, 3, 2),
    ]);
    expect(totals.RECEIVED).toMatchObject({ count: 1, quantity: 10 });
    expect(totals.TRANSFERRED).toMatchObject({ count: 1, quantity: 4 });
    expect(totals.SOLD).toMatchObject({ count: 2, quantity: 3 });
    expect(totals.LOST).toMatchObject({ count: 1, quantity: 1 });
  });

  it('lo pendiente de una orden nunca es negativo', () => {
    expect(pendingQuantity(10, 4)).toBe(6);
    expect(pendingQuantity(10, 10)).toBe(0);
    expect(pendingQuantity(10, 12)).toBe(0);
  });

  it('solo acepta los períodos de la lista', () => {
    expect(parseFlowWindow('7')).toBe(7);
    expect(parseFlowWindow(90)).toBe(90);
    expect(parseFlowWindow('15')).toBe(30);
    expect(parseFlowWindow(undefined)).toBe(30);
  });
});

describe('series', () => {
  it('normaliza a mayúsculas y rechaza lo inválido', () => {
    expect(normalizeSerial('  sn-001  ')).toBe('SN-001');
    expect(normalizeSerial('a  b')).toBe('A B');
    expect(normalizeSerial('')).toBeNull();
    expect(normalizeSerial('<script>')).toBeNull();
    expect(normalizeSerial('-abc')).toBeNull();
    expect(normalizeSerial('X'.repeat(65))).toBeNull();
  });

  it('separa un texto pegado y detecta repetidas e inválidas', () => {
    const parsed = parseSerialList('sn1\nSN2, sn1;SN3\t$$$\n\n');
    expect(parsed.serials).toEqual(['SN1', 'SN2', 'SN3']);
    expect(parsed.duplicates).toEqual(['SN1']);
    expect(parsed.invalid).toEqual(['$$$']);
    expect(parsed.tooMany).toBe(false);
  });

  it('marca cuando son demasiadas', () => {
    const text = Array.from({ length: MAX_SERIALS_PER_BATCH + 1 }, (_, i) => `S${i}`).join('\n');
    expect(parseSerialList(text).tooMany).toBe(true);
  });

  it('solo permite las transiciones definidas', () => {
    expect(canTransitionSerial('IN_STOCK', 'SOLD')).toBe(true);
    expect(canTransitionSerial('IN_STOCK', 'IN_STOCK')).toBe(false);
    expect(canTransitionSerial('SOLD', 'LOST')).toBe(false);
    expect(canTransitionSerial('LOST', 'IN_STOCK')).toBe(true);
    expect(allowedSerialTransitions('SOLD')).toEqual(['IN_STOCK']);
  });

  it('deja el evento que corresponde a cada cambio', () => {
    expect(eventKindForTransition('IN_STOCK', 'SOLD')).toBe('SOLD');
    expect(eventKindForTransition('IN_STOCK', 'LOST')).toBe('LOST');
    expect(eventKindForTransition('IN_STOCK', 'RETURNED')).toBe('RETURNED');
    expect(eventKindForTransition('SOLD', 'IN_STOCK')).toBe('REOPENED');
  });

  it('compara el stock con las series registradas', () => {
    expect(serialCoverage(5, 0).state).toBe('NONE');
    expect(serialCoverage(5, 3)).toMatchObject({ state: 'PARTIAL', missing: 2, extra: 0 });
    expect(serialCoverage(5, 5).state).toBe('COMPLETE');
    expect(serialCoverage(2, 4)).toMatchObject({ state: 'OVER', extra: 2 });
    expect(serialCoverage(2.7, 2).state).toBe('COMPLETE');
    expect(serialCoverage(-1, 0).state).toBe('NONE');
  });
});

describe('línea de tiempo', () => {
  it('ordena lo más reciente primero y es estable', () => {
    const a = { id: 'a', at: new Date('2026-01-01T10:00:00Z') };
    const b = { id: 'b', at: new Date('2026-01-02T10:00:00Z') };
    const c = { id: 'c', at: new Date('2026-01-02T10:00:00Z') };
    expect(sortTimeline([a, b, c]).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('describe los lotes movidos y descarta basura', () => {
    expect(describeLotAllocations([{ lotNumber: 'L1', expiryDate: '2026-12-01T00:00:00.000Z', quantity: 3 }, { lotNumber: 'L2', expiryDate: null, quantity: 1 }])).toBe(
      'Lote L1 (vence 2026-12-01) × 3 · Lote L2 × 1'
    );
    expect(describeLotAllocations(null)).toBeNull();
    expect(describeLotAllocations([{ nope: true }])).toBeNull();
  });
});
