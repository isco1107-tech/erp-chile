/**
 * Venta del POS sin conexión (src/lib/offline/pos-sale.ts): comprobante
 * provisorio, operación que queda en la cola, stock en pantalla y el bloqueo
 * de cierre de caja por ventas sin sincronizar.
 */
import {
  applySaleToStock,
  buildOfflineSale,
  posCatalogKey,
  provisionalNumber,
  unsyncedShiftSales,
  type OfflineSalePayload,
} from '@/lib/offline/pos-sale';
import type { QueuedOperation } from '@/lib/offline/queue-rules';

describe('posCatalogKey', () => {
  it('incluye empresa y bodega', () => {
    expect(posCatalogKey('company-123', 'warehouse-456')).toBe('pos-catalog:company-123:warehouse-456');
  });

  it('dos empresas con la misma bodega no comparten copia', () => {
    expect(posCatalogKey('company-1', 'warehouse-1')).not.toBe(posCatalogKey('company-2', 'warehouse-1'));
  });
});

describe('provisionalNumber', () => {
  it('hora local de la venta y el final de la clave en mayúsculas', () => {
    expect(provisionalNumber(new Date(2026, 8, 28, 9, 5, 7), 'abc-def-1234-xy9z')).toBe('P-090507-XY9Z');
  });

  it('medianoche', () => {
    expect(provisionalNumber(new Date(2026, 8, 28, 0, 0, 0), 'key-test-0000')).toBe('P-000000-0000');
  });
});

describe('buildOfflineSale', () => {
  const capturedAt = new Date(2026, 8, 28, 9, 5, 7);
  const idempotencyKey = 'abc-def-1234-xy9z';

  function build(payload: OfflineSalePayload): QueuedOperation {
    return buildOfflineSale({
      companyId: 'company-1',
      userId: 'user-1',
      shiftId: 'shift-1',
      idempotencyKey,
      payload,
      totalLabel: '$12.500',
      capturedAt,
    });
  }

  it('queda pendiente, con la misma clave del intento en línea y el número provisorio', () => {
    const sale = build({ items: [{ productId: 'prod-1', quantity: 2 }], paymentMethod: 'EFECTIVO', cashReceived: 15000 });
    expect(sale).toMatchObject({
      status: 'PENDING',
      kind: 'POS_SALE',
      companyId: 'company-1',
      userId: 'user-1',
      shiftId: 'shift-1',
      idempotencyKey,
      capturedAt: capturedAt.toISOString(),
      localNumber: 'P-090507-XY9Z',
      label: 'Venta $12.500 · P-090507-XY9Z',
    });
    expect(sale.localNumber).toBe(provisionalNumber(capturedAt, idempotencyKey));
  });

  it('guarda una copia del payload', () => {
    const payload: OfflineSalePayload = { items: [{ productId: 'prod-1', quantity: 1 }], paymentMethod: 'EFECTIVO', cashReceived: 5000 };
    const sale = build(payload);
    payload.paymentMethod = 'TARJETA_DEBITO';
    expect(sale.payload.paymentMethod).toBe('EFECTIVO');
  });
});

describe('applySaleToStock', () => {
  const products = [
    { id: 'p1', stock: 10, isTrackable: true },
    { id: 'p2', stock: 5, isTrackable: false },
    { id: 'p3', stock: 2, isTrackable: true },
    { id: 'p4', stock: 20, isTrackable: true },
  ];
  const items = [
    { productId: 'p1', quantity: 3 },
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 4 },
    { productId: 'p3', quantity: 5 },
  ];

  it('descuenta sumando ítems repetidos, solo en productos con control de stock', () => {
    const stock = Object.fromEntries(applySaleToStock(products, items).map((p) => [p.id, p.stock]));
    expect(stock).toEqual({ p1: 5, p2: 5, p3: -3, p4: 20 });
  });

  it('no toca lo no vendido ni muta el catálogo original', () => {
    const snapshot = JSON.stringify(products);
    const result = applySaleToStock(products, items);
    expect(result).not.toBe(products);
    expect(result[3]).toBe(products[3]);
    expect(JSON.stringify(products)).toBe(snapshot);
  });
});

describe('unsyncedShiftSales', () => {
  it('ventas de ese turno pendientes, rechazadas o por revisar; no las aplicadas, de otro turno ni de otro tipo', () => {
    const base: QueuedOperation = {
      idempotencyKey: 'k0',
      companyId: 'c1',
      userId: 'u1',
      kind: 'POS_SALE',
      shiftId: 'shift-1',
      payload: {},
      capturedAt: new Date().toISOString(),
      status: 'PENDING',
      label: 'Venta',
    };
    const pending = { ...base, idempotencyKey: 'k1' };
    const failed: QueuedOperation = { ...base, idempotencyKey: 'k2', status: 'FAILED' };
    const review: QueuedOperation = { ...base, idempotencyKey: 'k3', status: 'REVIEW' };
    const done: QueuedOperation = { ...base, idempotencyKey: 'k4', status: 'DONE' };
    const otherShift = { ...base, idempotencyKey: 'k5', shiftId: 'shift-2' };
    const stockMove: QueuedOperation = { ...base, idempotencyKey: 'k6', kind: 'STOCK_MOVEMENT', shiftId: undefined };

    expect(unsyncedShiftSales([pending, failed, review, done, otherShift, stockMove], 'shift-1')).toEqual([pending, failed, review]);
  });
});
