/**
 * Pantalla "Modo sin conexión" (src/lib/offline/contingency.ts): claves de las
 * copias de datos, fecha de Chile, etiquetas de la cola, operaciones nuevas y
 * lo que falta recibir de una OC descontando lo ya encolado.
 */
import {
  buildContingencyOperation,
  contingencySnapshotKey,
  movementLabel,
  pendingAfterQueue,
  purchaseLabel,
  receiptLabel,
  todayInChile,
} from '@/lib/offline/contingency';
import type { QueuedOperation } from '@/lib/offline/queue-rules';

let counter = 0;

function op(overrides: Partial<QueuedOperation> = {}): QueuedOperation {
  counter += 1;
  return {
    idempotencyKey: `key-${counter}`,
    companyId: 'c1',
    userId: 'u1',
    kind: 'GOODS_RECEIPT',
    status: 'PENDING',
    label: 'Recepción',
    payload: {},
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

const receipt = (orderId: string, items: unknown[], overrides: Partial<QueuedOperation> = {}) => op({ payload: { orderId, items }, ...overrides });

describe('contingencySnapshotKey', () => {
  it('incluye el formulario y la empresa', () => {
    const key = contingencySnapshotKey('STOCK_MOVEMENT', 'empresa-1');
    expect(key).toContain('STOCK_MOVEMENT');
    expect(key).toContain('empresa-1');
  });

  it('cada formulario y cada empresa tienen su propia copia', () => {
    expect(contingencySnapshotKey('STOCK_MOVEMENT', 'empresa-1')).not.toBe(contingencySnapshotKey('PURCHASE', 'empresa-1'));
    expect(contingencySnapshotKey('PURCHASE', 'empresa-1')).not.toBe(contingencySnapshotKey('PURCHASE', 'empresa-2'));
  });
});

describe('todayInChile', () => {
  it('usa el día de Chile, no el de UTC', () => {
    expect(todayInChile(new Date('2026-09-28T02:30:00Z'))).toBe('2026-09-27');
    expect(todayInChile(new Date('2026-09-28T15:00:00Z'))).toBe('2026-09-28');
  });

  it('formato AAAA-MM-DD', () => {
    expect(todayInChile()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('etiquetas', () => {
  it('movimientos, con coma decimal', () => {
    expect(movementLabel('ADJUSTMENT_IN', 5, 'Café')).toBe('Entrada 5 × Café');
    expect(movementLabel('ADJUSTMENT_OUT', 2.5, 'Azúcar')).toBe('Salida 2,5 × Azúcar');
    expect(movementLabel('TRANSFER', 1, 'Harina')).toBe('Traslado 1 × Harina');
  });

  it('compra: recorta el folio', () => {
    expect(purchaseLabel('Factura', ' 123 ', 'Proveedor SpA')).toBe('Factura 123 · Proveedor SpA');
  });

  it('recepción de OC', () => {
    expect(receiptLabel(12, 'Proveedor SpA')).toBe('Recepción OC #12 · Proveedor SpA');
  });
});

describe('buildContingencyOperation', () => {
  const base = { companyId: 'c1', userId: 'u1', payload: {}, label: 'Movimiento' };

  it('queda pendiente, con la hora de captura y sin turno de caja', () => {
    const capturedAt = new Date('2026-03-30T10:00:00Z');
    const operation = buildContingencyOperation({ ...base, kind: 'PURCHASE', label: 'Factura 123', capturedAt });
    expect(operation).toMatchObject({ status: 'PENDING', kind: 'PURCHASE', label: 'Factura 123', capturedAt: capturedAt.toISOString() });
    expect(operation.shiftId).toBeUndefined();
  });

  it('genera una clave propia por operación, o usa la que se le da', () => {
    const first = buildContingencyOperation({ ...base, kind: 'STOCK_MOVEMENT' });
    const second = buildContingencyOperation({ ...base, kind: 'STOCK_MOVEMENT' });
    expect(first.idempotencyKey.startsWith('off-')).toBe(true);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    expect(buildContingencyOperation({ ...base, kind: 'GOODS_RECEIPT', idempotencyKey: 'custom-key-001' }).idempotencyKey).toBe('custom-key-001');
  });

  it('guarda una copia del payload', () => {
    const payload = { quantity: 10, productId: 'p1' };
    const operation = buildContingencyOperation({ ...base, kind: 'STOCK_MOVEMENT', payload });
    payload.quantity = 50;
    expect(operation.payload).toEqual({ quantity: 10, productId: 'p1' });
  });
});

describe('pendingAfterQueue', () => {
  it('descuenta lo encolado sin aplicar (pendiente, rechazado o por revisar) de esa orden', () => {
    const lines = [
      { id: 'item-1', pending: 10, description: 'Harina' },
      { id: 'item-2', pending: 5, description: 'Azúcar' },
    ];
    const operations = [
      receipt('oc-1', [{ orderItemId: 'item-1', quantity: 3 }]),
      receipt('oc-1', [{ orderItemId: 'item-1', quantity: 2 }], { status: 'FAILED' }),
      receipt('oc-1', [{ orderItemId: 'item-2', quantity: 1 }], { status: 'REVIEW' }),
    ];
    expect(pendingAfterQueue(lines, 'oc-1', operations)).toEqual([
      { id: 'item-1', pending: 5, description: 'Harina' },
      { id: 'item-2', pending: 4, description: 'Azúcar' },
    ]);
  });

  it('no cuentan las aplicadas, las de otra orden ni otros tipos de operación', () => {
    const operations = [
      receipt('oc-1', [{ orderItemId: 'item-1', quantity: 5 }], { status: 'DONE' }),
      receipt('oc-2', [{ orderItemId: 'item-1', quantity: 5 }]),
      receipt('oc-1', [{ orderItemId: 'item-1', quantity: 5 }], { kind: 'STOCK_MOVEMENT' }),
    ];
    expect(pendingAfterQueue([{ id: 'item-1', pending: 10 }], 'oc-1', operations)[0]?.pending).toBe(10);
  });

  it('nunca baja de cero', () => {
    expect(pendingAfterQueue([{ id: 'item-1', pending: 3 }], 'oc-1', [receipt('oc-1', [{ orderItemId: 'item-1', quantity: 10 }])])[0]?.pending).toBe(0);
  });

  it('ignora ítems mal formados', () => {
    const operations = [
      receipt('oc-1', [null, 'texto', { orderItemId: 'item-1', quantity: '5' }, { orderItemId: 123, quantity: 5 }, { orderItemId: 'item-1', quantity: 4 }]),
      op({ payload: { orderId: 'oc-1', items: 'no-es-lista' } }),
    ];
    expect(pendingAfterQueue([{ id: 'item-1', pending: 10 }], 'oc-1', operations)[0]?.pending).toBe(6);
  });

  it('no muta las líneas originales', () => {
    const line = { id: 'item-1', pending: 8, description: 'Leche' };
    const result = pendingAfterQueue([line], 'oc-1', [receipt('oc-1', [{ orderItemId: 'item-1', quantity: 3 }])]);
    expect(line.pending).toBe(8);
    expect(result[0]).toEqual({ id: 'item-1', pending: 5, description: 'Leche' });
  });
});
