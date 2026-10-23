/**
 * Consignación en el kardex y en la venta.
 *
 * Reglas que estos tests protegen:
 *  - la mercadería de un seller entra al stock pero nunca se compra, no tiene costo ni PMP (no entra
 *    al valor de inventario ni genera asientos);
 *  - un producto propio sigue valorizándose al PMP como siempre;
 *  - cada línea vendida de un producto de seller guarda su dueño y la comisión de ese momento, y una
 *    devolución copia la de la línea original, nunca la de hoy.
 */

import { applyStockIn, type TxClient } from '@/modules/inventory/services/stock.service';
import { resolveSaleConsignment } from '@/modules/inventory/services/consignment.service';
import { snapshotForProduct, snapshotsFromReferencedItems } from '@/lib/consignment/snapshot';

type Row = Record<string, unknown>;

function fakeTx(product: Row) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: { findFirst: jest.fn().mockResolvedValue(product), update: jest.fn().mockResolvedValue({}) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', name: 'Bodega central' }) },
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    stock: {
      findUnique: jest.fn().mockResolvedValue({ quantity: 10 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 10 } }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    inventoryMovement: { create: jest.fn().mockImplementation(async ({ data }: { data: Row }) => ({ id: 'm1', ...data })) },
  };
  return tx;
}

const BASE = { id: 'p1', name: 'Taza de greda', isTrackable: true, tracksLots: false, costPricePMP: 0, consignorId: null, consignmentCommissionBps: null };
const IN = { productId: 'p1', warehouseId: 'w1', type: 'PURCHASE_IN' as const, quantity: 5, unitCost: 1000 };
const run = (tx: ReturnType<typeof fakeTx>, params: Parameters<typeof applyStockIn>[2]) => applyStockIn(tx as unknown as TxClient, 'company-a', params);

describe('kardex: producto de seller', () => {
  const seller = { ...BASE, consignorId: 's1' };

  it('una compra de un producto de seller se rechaza y no mueve nada', async () => {
    const tx = fakeTx(seller);
    await expect(run(tx, IN)).rejects.toThrow('está en consignación');
    expect(tx.stock.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('la recepción en consignación sube el stock con costo 0 y sin tocar el PMP', async () => {
    const tx = fakeTx(seller);
    const movement = await run(tx, { ...IN, consignment: true, supplierId: 's1', unitCost: 0 });
    expect(tx.stock.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { quantity: 15 } }));
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(movement).toMatchObject({ unitCost: 0, totalCost: 0, newPmp: 0, previousPmp: 0, supplierId: 's1' });
  });

  it('aunque se pida un costo, un producto de seller queda con costo 0', async () => {
    const tx = fakeTx(seller);
    const movement = await run(tx, { ...IN, type: 'ADJUSTMENT_IN', unitCost: 777 });
    expect(movement).toMatchObject({ unitCost: 0, totalCost: 0, newPmp: 0 });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('no se puede recibir en consignación un producto propio', async () => {
    const tx = fakeTx(BASE);
    await expect(run(tx, { ...IN, consignment: true })).rejects.toThrow('no es un producto de seller');
    expect(tx.stock.upsert).not.toHaveBeenCalled();
  });

  it('un producto propio se sigue valorizando al PMP', async () => {
    const tx = fakeTx({ ...BASE, costPricePMP: 500 });
    const movement = await run(tx, IN);
    // (10 × 500 + 5 × 1.000) / 15 = 666,67
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { costPricePMP: 666.67 } });
    expect(movement).toMatchObject({ unitCost: 1000, totalCost: 5000, newPmp: 666.67 });
  });
});

describe('foto de la venta', () => {
  it('una venta toma el dueño del producto y la comisión del producto o, si no tiene, la del seller', () => {
    expect(snapshotForProduct({ name: 'Taza', consignorId: 's1', consignmentCommissionBps: 1000 }, 2000)).toEqual({ consignorId: 's1', commissionBps: 1000 });
    expect(snapshotForProduct({ name: 'Taza', consignorId: 's1', consignmentCommissionBps: null }, 2000)).toEqual({ consignorId: 's1', commissionBps: 2000 });
  });

  it('un producto de seller sin comisión no se vende en silencio', () => {
    expect(() => snapshotForProduct({ name: 'Taza', consignorId: 's1', consignmentCommissionBps: null }, null)).toThrow('no tiene comisión definida');
  });

  it('una devolución copia la foto de la línea original y no la de hoy', () => {
    const map = snapshotsFromReferencedItems([
      { productId: 'a', consignorId: 's1', consignorCommissionBps: 1500 },
      { productId: 'b', consignorId: null, consignorCommissionBps: null },
      { productId: null, consignorId: 's1', consignorCommissionBps: 1500 },
    ]);
    expect([...map.keys()]).toEqual(['a']);
    expect(map.get('a')).toEqual({ consignorId: 's1', commissionBps: 1500 });
  });

  describe('resolveSaleConsignment', () => {
    const tx = () => ({
      product: { findMany: jest.fn() },
      contact: { findMany: jest.fn() },
    });
    type Tx = Parameters<typeof resolveSaleConsignment>[0];

    it('solo hay foto para productos de seller y se pide con el filtro de la empresa', async () => {
      const db = tx();
      db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Taza', consignorId: 's1', consignmentCommissionBps: null }]);
      db.contact.findMany.mockResolvedValue([{ id: 's1', consignmentCommissionBps: 2000 }]);
      const map = await resolveSaleConsignment(db as unknown as Tx, 'company-a', { dteType: 'BOLETA_39', productIds: ['p1', 'p2', null, 'p1'] });
      expect([...map.entries()]).toEqual([['p1', { consignorId: 's1', commissionBps: 2000 }]]);
      expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-a', id: { in: ['p1', 'p2'] }, consignorId: { not: null } } }));
      expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-a', id: { in: ['s1'] } } }));
    });

    it('una venta sin productos de seller no consulta al seller', async () => {
      const db = tx();
      db.product.findMany.mockResolvedValue([]);
      expect((await resolveSaleConsignment(db as unknown as Tx, 'company-a', { dteType: 'FACTURA_33', productIds: ['p2'] })).size).toBe(0);
      expect(db.contact.findMany).not.toHaveBeenCalled();
    });

    it('guías, cotizaciones y notas de débito no consultan nada', async () => {
      for (const dteType of ['GUIA_DESPACHO_52', 'COTIZACION', 'NOTA_DEBITO_56']) {
        const db = tx();
        expect((await resolveSaleConsignment(db as unknown as Tx, 'company-a', { dteType, productIds: ['p1'] })).size).toBe(0);
        expect(db.product.findMany).not.toHaveBeenCalled();
      }
    });

    it('la nota de crédito toma la foto de la línea que devuelve, sin consultar el catálogo', async () => {
      const db = tx();
      const map = await resolveSaleConsignment(db as unknown as Tx, 'company-a', {
        dteType: 'NOTA_CREDITO_61',
        productIds: ['p1'],
        referencedItems: [{ productId: 'p1', consignorId: 's1', consignorCommissionBps: 1500 }],
      });
      expect(map.get('p1')).toEqual({ consignorId: 's1', commissionBps: 1500 });
      expect(db.product.findMany).not.toHaveBeenCalled();
    });

    it('si el producto de seller no tiene comisión, la venta se rechaza', async () => {
      const db = tx();
      db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Taza', consignorId: 's1', consignmentCommissionBps: null }]);
      db.contact.findMany.mockResolvedValue([{ id: 's1', consignmentCommissionBps: null }]);
      await expect(resolveSaleConsignment(db as unknown as Tx, 'company-a', { dteType: 'BOLETA_39', productIds: ['p1'] })).rejects.toThrow('no tiene comisión definida');
    });
  });
});
