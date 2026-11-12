import {
  aggregateCustomers,
  classifyLotMovement,
  distributedShare,
  lotsInAllocations,
  quantityForLot,
  reconcileLot,
} from '@/lib/inventory/genealogy';
import { isMovementSourceKind, MOVEMENT_SOURCE_KINDS, MOVEMENT_SOURCE_LABELS } from '@/lib/inventory/traceability-sources';

const alloc = [
  { lotNumber: 'L1', expiryDate: null, quantity: 3 },
  { lotNumber: 'L2', expiryDate: '2026-12-01T00:00:00.000Z', quantity: 2 },
  { lotNumber: 'L1', expiryDate: null, quantity: 1 },
];

describe('reparto por lote', () => {
  it('suma lo que un movimiento tomó de un lote', () => {
    expect(quantityForLot(alloc, 'L1')).toBe(4);
    expect(quantityForLot(alloc, 'L2')).toBe(2);
    expect(quantityForLot(alloc, 'X')).toBe(0);
    expect(quantityForLot(null, 'L1')).toBe(0);
    expect(quantityForLot([{ lotNumber: 'L1' }, 'basura', null], 'L1')).toBe(0);
  });

  it('lista los lotes distintos', () => {
    expect(lotsInAllocations(alloc)).toEqual([
      { lotNumber: 'L1', quantity: 4 },
      { lotNumber: 'L2', quantity: 2 },
    ]);
    expect(lotsInAllocations('nada')).toEqual([]);
  });
});

describe('papel de un movimiento en el lote', () => {
  const mv = (type: Parameters<typeof classifyLotMovement>[0]['type'], previousStock: number, newStock: number, sourceKind: string | null = null) => ({ type, previousStock, newStock, sourceKind });
  it('clasifica por tipo y por documento de origen', () => {
    expect(classifyLotMovement(mv('PURCHASE_IN', 0, 5, 'GOODS_RECEIPT'))).toBe('ENTRY');
    expect(classifyLotMovement(mv('SALE_OUT', 5, 4, 'SALES_DOCUMENT'))).toBe('SALE');
    expect(classifyLotMovement(mv('ADJUSTMENT_IN', 4, 5, 'SALES_DOCUMENT'))).toBe('RETURN');
    expect(classifyLotMovement(mv('ADJUSTMENT_IN', 0, 5, 'PRODUCTION_ORDER'))).toBe('ENTRY');
    expect(classifyLotMovement(mv('ADJUSTMENT_IN', 4, 5))).toBe('OTHER_IN');
    expect(classifyLotMovement(mv('ADJUSTMENT_OUT', 5, 3, 'PRODUCTION_ORDER'))).toBe('PRODUCTION_USE');
    expect(classifyLotMovement(mv('ADJUSTMENT_OUT', 5, 3))).toBe('WRITE_OFF');
    expect(classifyLotMovement(mv('TRANSFER', 5, 2))).toBe('TRANSFER_OUT');
    expect(classifyLotMovement(mv('TRANSFER', 0, 3))).toBe('TRANSFER_IN');
  });
});

describe('cuadre del lote', () => {
  it('los traslados no cuentan y el lote cuadra', () => {
    const rec = reconcileLot(
      [
        { cls: 'ENTRY', quantity: 10 },
        { cls: 'TRANSFER_OUT', quantity: 4 },
        { cls: 'TRANSFER_IN', quantity: 4 },
        { cls: 'SALE', quantity: 3 },
        { cls: 'RETURN', quantity: 1 },
        { cls: 'WRITE_OFF', quantity: 2 },
        { cls: 'PRODUCTION_USE', quantity: 1 },
      ],
      5
    );
    expect(rec).toMatchObject({ received: 11, dispatched: 6, inStock: 5, unexplained: 0, balanced: true });
  });

  it('avisa cuando sobra o falta', () => {
    expect(reconcileLot([{ cls: 'ENTRY', quantity: 10 }, { cls: 'SALE', quantity: 3 }], 5)).toMatchObject({ unexplained: 2, balanced: false });
    expect(reconcileLot([{ cls: 'SALE', quantity: 3 }], 0)).toMatchObject({ unexplained: -3, balanced: false });
  });

  it('calcula el porcentaje que llegó a clientes', () => {
    expect(distributedShare(10, 4)).toBe(40);
    expect(distributedShare(0, 4)).toBe(0);
    expect(distributedShare(10, 20)).toBe(100);
    expect(distributedShare(10, -2)).toBe(0);
  });
});

describe('clientes alcanzados', () => {
  const at = (d: number) => new Date(Date.UTC(2026, 10, d));
  it('suma por cliente y descuenta devoluciones', () => {
    const hits = aggregateCustomers([
      { contactId: 'a', name: 'Ana', rut: '1-9', quantity: 5, document: 'Boleta #1', at: at(2) },
      { contactId: 'a', name: 'Ana', rut: '1-9', quantity: -2, document: 'NC #3', at: at(5) },
      { contactId: 'b', name: 'Beto', rut: '2-7', quantity: 3, document: 'Factura #9', at: at(3) },
      { contactId: 'c', name: 'Cata', rut: '3-5', quantity: 4, document: 'Boleta #4', at: at(4) },
      { contactId: 'c', name: 'Cata', rut: '3-5', quantity: -4, document: 'NC #5', at: at(6) },
    ]);
    expect(hits.map((h) => [h.name, h.quantity])).toEqual([['Ana', 3], ['Beto', 3]]);
    expect(hits[0]!.documents).toEqual(['Boleta #1', 'NC #3']);
    expect(hits[0]!.firstAt).toEqual(at(2));
    expect(hits[0]!.lastAt).toEqual(at(5));
  });
});

describe('documentos de origen', () => {
  it('tienen nombre y se reconocen', () => {
    for (const kind of MOVEMENT_SOURCE_KINDS) {
      expect(MOVEMENT_SOURCE_LABELS[kind]).toBeTruthy();
      expect(isMovementSourceKind(kind)).toBe(true);
    }
    expect(isMovementSourceKind('OTRA_COSA')).toBe(false);
    expect(isMovementSourceKind(null)).toBe(false);
  });
});
