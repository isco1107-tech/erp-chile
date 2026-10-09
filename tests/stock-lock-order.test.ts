/**
 * Orden global de los locks de producto (`lockProductRows`).
 *
 * Tomados línea por línea en el orden del documento, una compra [A, B] y otra
 * [B, A] simultáneas se bloqueaban en círculo y Postgres abortaba una con
 * "deadlock detected" (`scripts/stress/concurrency.ts`, escenario
 * `purchase-lock-order`: 196 de 200 compras fallaban). Estas pruebas fijan el
 * contrato: un solo `FOR UPDATE` con todos los ids, ordenados y sin repetir, y
 * ningún lock de nuevo para un producto que la transacción ya tiene.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/modules/accounting/posting-rules/inventory-posting', () => ({ postInventoryAdjustmentEntry: jest.fn() }));

import { applyStockOut, lockProductRows, type TxClient } from '@/modules/inventory/services/stock.service';

function fakeTx() {
  // Como Postgres: el FOR UPDATE de varios ids devuelve una fila por cada id existente.
  const $queryRaw = jest.fn(async (_sql: TemplateStringsArray, ...values: unknown[]) => {
    const ids = values.find(Array.isArray) as string[] | undefined;
    return (ids ?? []).filter((id) => id !== 'ajeno').map((id) => ({ id }));
  });
  const tx = {
    $queryRaw,
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'b', isTrackable: true, tracksLots: false, costPricePMP: 100 }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', name: 'Bodega' }) },
    stock: { findUnique: jest.fn().mockResolvedValue({ quantity: 10 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    companySettings: { findUnique: jest.fn().mockResolvedValue({ allowNegativeStock: false }) },
    inventoryMovement: { create: jest.fn().mockResolvedValue({ id: 'm1', unitCost: 100 }) },
  };
  return { tx: tx as unknown as TxClient, $queryRaw };
}

/** Los valores interpolados del tagged template (`$queryRaw`) de una llamada. */
function params(call: unknown[]): unknown[] {
  return call.slice(1);
}

describe('lockProductRows', () => {
  it('bloquea todos los productos en una sola consulta, ordenados y sin repetir', async () => {
    const { tx, $queryRaw } = fakeTx();
    await lockProductRows(tx, 'c1', ['p3', 'p1', null, 'p3', undefined, 'p2']);
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const sql = ($queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('ORDER BY id FOR UPDATE');
    expect(params($queryRaw.mock.calls[0]!)).toEqual(['c1', ['p1', 'p2', 'p3']]);
  });

  it('el mismo conjunto en otro orden produce exactamente el mismo orden de lock', async () => {
    const first = fakeTx();
    const second = fakeTx();
    await lockProductRows(first.tx, 'c1', ['a', 'b']);
    await lockProductRows(second.tx, 'c1', ['b', 'a']);
    expect(params(first.$queryRaw.mock.calls[0]!)).toEqual(params(second.$queryRaw.mock.calls[0]!));
  });

  it('no vuelve a bloquear lo que la transacción ya tiene', async () => {
    const { tx, $queryRaw } = fakeTx();
    await lockProductRows(tx, 'c1', ['a', 'b']);
    await lockProductRows(tx, 'c1', ['b', 'a']);
    expect($queryRaw).toHaveBeenCalledTimes(1);
    await lockProductRows(tx, 'c1', ['c', 'a']);
    expect($queryRaw).toHaveBeenCalledTimes(2);
    expect(params($queryRaw.mock.calls[1]!)).toEqual(['c1', ['c']]);
  });

  it('un id que la base no devolvió (otra empresa o inexistente) no queda marcado como bloqueado', async () => {
    const { tx, $queryRaw } = fakeTx();
    await lockProductRows(tx, 'c1', ['a', 'ajeno']);
    await lockProductRows(tx, 'c1', ['ajeno']);
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });

  it('sin productos no consulta', async () => {
    const { tx, $queryRaw } = fakeTx();
    await lockProductRows(tx, 'c1', [null, undefined]);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('applyStockOut no repite el FOR UPDATE de un producto ya bloqueado en la transacción', async () => {
    const { tx, $queryRaw } = fakeTx();
    await lockProductRows(tx, 'c1', ['a', 'b']);
    await applyStockOut(tx, 'c1', { productId: 'b', warehouseId: 'w1', type: 'SALE_OUT', quantity: 1 });
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });

  it('cada transacción lleva su propia cuenta: otra transacción sí bloquea', async () => {
    const first = fakeTx();
    const second = fakeTx();
    await lockProductRows(first.tx, 'c1', ['a']);
    await applyStockOut(second.tx, 'c1', { productId: 'b', warehouseId: 'w1', type: 'SALE_OUT', quantity: 1 });
    expect(second.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
