/**
 * Servicio de consignación con Prisma simulado: filtro multi-tenant, congelado
 * de montos, idempotencia de `recordConsignmentSales`, atomicidad y período de
 * `buildSettlement`, y reglas de `assignProductToProducer`.
 */
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    producer: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    contact: { findFirst: jest.fn() },
    product: { updateMany: jest.fn(), findFirst: jest.fn() },
    stock: { aggregate: jest.fn() },
    consignmentSettlementLine: { findMany: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() },
    consignmentSettlement: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CONSIGNMENT_SALE_DTE_TYPES,
  ConsignmentError,
  assignProductToProducer,
  buildSettlement,
  createProducer,
  recordConsignmentSales,
  updateProducer,
} from '@/modules/consignment/services/consignment.service';

const db = prisma as unknown as {
  producer: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  contact: { findFirst: jest.Mock };
  product: { updateMany: jest.Mock; findFirst: jest.Mock };
  stock: { aggregate: jest.Mock };
  consignmentSettlementLine: { findMany: jest.Mock; updateMany: jest.Mock };
  consignmentSettlement: { create: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  db.$queryRaw.mockResolvedValue([]);
});

describe('tipos de documento que devengan', () => {
  it('solo ventas tributables: sin cotización, guía ni notas', () => {
    expect([...CONSIGNMENT_SALE_DTE_TYPES].sort()).toEqual(['BOLETA_39', 'BOLETA_EXENTA_41', 'FACTURA_33', 'FACTURA_EXENTA_34']);
  });
});

describe('recordConsignmentSales', () => {
  const issueDate = new Date('2026-10-15T15:00:00Z');
  const producer = { defaultCommissionBps: 3000, commissionBase: 'NET' as const };

  function fakeTx(document: unknown, existing: { salesDocumentItemId: string }[] = [], created = 2) {
    return {
      salesDocument: { findFirst: jest.fn().mockResolvedValue(document) },
      consignmentSettlementLine: {
        findMany: jest.fn().mockResolvedValue(existing),
        createMany: jest.fn().mockResolvedValue({ count: created }),
      },
    };
  }
  const asTx = (tx: unknown) => tx as Prisma.TransactionClient;

  it('congela comisión del producto sobre la del productor, IVA y exención, y filtra por empresa', async () => {
    const tx = fakeTx({
      issueDate,
      items: [
        { id: 'i1', productId: 'p1', subtotal: 1001, iva: 190, isExempt: false, product: { producerId: 'pr1', commissionBpsOverride: 1500, producer } },
        { id: 'i2', productId: 'p2', subtotal: 2000, iva: 0, isExempt: true, product: { producerId: 'pr1', commissionBpsOverride: null, producer } },
      ],
    });
    const result = await recordConsignmentSales(asTx(tx), 'co1', 'd1');
    expect(result).toEqual({ count: 2, producerAmount: 851 + 1400 });
    const where = tx.salesDocument.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'd1', companyId: 'co1', status: 'ISSUED', dteType: { in: CONSIGNMENT_SALE_DTE_TYPES } });
    const args = tx.consignmentSettlementLine.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toEqual([
      { companyId: 'co1', producerId: 'pr1', salesDocumentItemId: 'i1', kind: 'SALE', productId: 'p1', soldNet: 1001, commissionBps: 1500, commissionAmount: 150, producerAmount: 851, isExempt: false, saleIva: 190, documentDate: issueDate },
      { companyId: 'co1', producerId: 'pr1', salesDocumentItemId: 'i2', kind: 'SALE', productId: 'p2', soldNet: 2000, commissionBps: 3000, commissionAmount: 600, producerAmount: 1400, isExempt: true, saleIva: 0, documentDate: issueDate },
    ]);
  });

  it('comisión sobre el bruto cuando el productor lo pide (el neto del productor sigue siendo neto - comisión)', async () => {
    const tx = fakeTx(
      { issueDate, items: [{ id: 'i1', productId: 'p1', subtotal: 1000, iva: 190, isExempt: false, product: { producerId: 'pr1', commissionBpsOverride: null, producer: { defaultCommissionBps: 2000, commissionBase: 'GROSS' } } }] },
      [],
      1
    );
    await recordConsignmentSales(asTx(tx), 'co1', 'd1');
    // 20% de 1.190 = 238
    expect(tx.consignmentSettlementLine.createMany.mock.calls[0][0].data[0]).toMatchObject({ commissionAmount: 238, producerAmount: 762 });
  });

  it('idempotente: los ítems que ya tienen línea no se vuelven a crear ni a devengar', async () => {
    const tx = fakeTx(
      { issueDate, items: [{ id: 'i1', productId: 'p1', subtotal: 1000, iva: 190, isExempt: false, product: { producerId: 'pr1', commissionBpsOverride: null, producer } }] },
      [{ salesDocumentItemId: 'i1' }]
    );
    expect(await recordConsignmentSales(asTx(tx), 'co1', 'd1')).toEqual({ count: 0, producerAmount: 0 });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
  });

  it('documento no emitido o ajeno: no crea nada', async () => {
    const tx = fakeTx(null);
    expect(await recordConsignmentSales(asTx(tx), 'co1', 'd1')).toEqual({ count: 0, producerAmount: 0 });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
  });

  it('sin líneas en consignación no escribe', async () => {
    const tx = fakeTx({ issueDate, items: [] });
    expect((await recordConsignmentSales(asTx(tx), 'co1', 'd1')).count).toBe(0);
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
  });
});

describe('buildSettlement', () => {
  // Días calendario (como los envía un input type=date).
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-10-31T00:00:00Z');

  it('agrupa líneas pendientes por fecha de documento en Santiago, con IVA del productor calculado una vez', async () => {
    db.producer.findFirst.mockResolvedValue({ id: 'pr1' });
    db.consignmentSettlementLine.findMany.mockResolvedValue([
      { id: 'l1', soldNet: 1001, commissionAmount: 150, producerAmount: 851, isExempt: false },
      { id: 'l2', soldNet: 2000, commissionAmount: 600, producerAmount: 1400, isExempt: true },
      { id: 'l3', soldNet: 1000, commissionAmount: 200, producerAmount: 800, isExempt: false },
    ]);
    db.consignmentSettlement.create.mockResolvedValue({ id: 's1' });
    db.consignmentSettlementLine.updateMany.mockResolvedValue({ count: 3 });

    const result = await buildSettlement('co1', 'pr1', from, to);
    // neto afecto 851+800 = 1651 -> IVA 314 (una vez sobre el agregado); exento 1400.
    expect(result).toEqual({ id: 's1', lineCount: 3, totalDue: 3051, totalPayable: 1651 + 1400 + 314 });
    const where = db.consignmentSettlementLine.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'co1', producerId: 'pr1', settlementId: null });
    expect(where.createdAt).toBeUndefined();
    // Octubre en Santiago (UTC-3 en horario de verano a partir de septiembre): la medianoche local es 03:00 UTC.
    expect(where.documentDate.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(where.documentDate.lt.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(db.consignmentSettlement.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'co1',
      status: 'DRAFT',
      totalSold: 4001,
      totalCommission: 950,
      totalDue: 3051,
      producerNetAffected: 1651,
      producerExempt: 1400,
      producerIva: 314,
      totalPayable: 3365,
    });
    expect(db.consignmentSettlementLine.updateMany.mock.calls[0][0].where).toMatchObject({ companyId: 'co1', settlementId: null });
  });

  it('productor de otra empresa: no se encuentra', async () => {
    db.producer.findFirst.mockResolvedValue(null);
    await expect(buildSettlement('co1', 'ajeno', from, to)).rejects.toThrow(ConsignmentError);
    expect(db.producer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ajeno', companyId: 'co1' } }));
  });

  it('sin ventas pendientes avisa y no crea liquidación', async () => {
    db.producer.findFirst.mockResolvedValue({ id: 'pr1' });
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    await expect(buildSettlement('co1', 'pr1', from, to)).rejects.toThrow('No hay ventas pendientes');
    expect(db.consignmentSettlement.create).not.toHaveBeenCalled();
  });

  it('si otra liquidación se llevó líneas en paralelo, falla (la transacción se revierte)', async () => {
    db.producer.findFirst.mockResolvedValue({ id: 'pr1' });
    db.consignmentSettlementLine.findMany.mockResolvedValue([{ id: 'l1', soldNet: 100, commissionAmount: 10, producerAmount: 90, isExempt: false }]);
    db.consignmentSettlement.create.mockResolvedValue({ id: 's1' });
    db.consignmentSettlementLine.updateMany.mockResolvedValue({ count: 0 });
    await expect(buildSettlement('co1', 'pr1', from, to)).rejects.toThrow('Otra liquidación');
  });
});

describe('productores y asignación', () => {
  it('crear exige que el contacto sea de la empresa', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(createProducer('co1', { contactId: 'x', defaultCommissionBps: 1000 })).rejects.toThrow('no existe');
    expect(db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'x', companyId: 'co1' } }));
    expect(db.producer.create).not.toHaveBeenCalled();
  });

  it('crear usa base NET por defecto', async () => {
    db.contact.findFirst.mockResolvedValue({ id: 'x' });
    db.producer.create.mockResolvedValue({ id: 'pr1' });
    await createProducer('co1', { contactId: 'x', defaultCommissionBps: 1000 });
    expect(db.producer.create.mock.calls[0][0].data).toMatchObject({ companyId: 'co1', commissionBase: 'NET' });
  });

  it('editar usa updateMany con companyId y falla si no hay coincidencia', async () => {
    db.producer.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateProducer('co1', 'pr1', { defaultCommissionBps: 500 })).rejects.toThrow('no encontrado');
    expect(db.producer.updateMany).toHaveBeenCalledWith({ where: { id: 'pr1', companyId: 'co1' }, data: { defaultCommissionBps: 500 } });
  });

  describe('assignProductToProducer', () => {
    it('producto sin stock ni PMP: asigna (CONSIGNMENT) y devuelve (OWN) bajo lock de fila y companyId', async () => {
      db.producer.findFirst.mockResolvedValue({ isActive: true });
      db.product.findFirst.mockResolvedValueOnce({ supplyMode: 'OWN', costPricePMP: 0 }).mockResolvedValueOnce({ supplyMode: 'CONSIGNMENT', costPricePMP: 0 });
      db.stock.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      db.product.updateMany.mockResolvedValue({ count: 1 });
      await assignProductToProducer('co1', { productId: 'p1', producerId: 'pr1', commissionBpsOverride: 1200 });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.product.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', companyId: 'co1' });
      expect(db.product.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'p1', companyId: 'co1' },
        data: { producerId: 'pr1', supplyMode: 'CONSIGNMENT', commissionBpsOverride: 1200 },
      });
      await assignProductToProducer('co1', { productId: 'p1', producerId: null });
      expect(db.product.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'p1', companyId: 'co1' },
        data: { producerId: null, supplyMode: 'OWN', commissionBpsOverride: null },
      });
    });

    it('rechaza pasar de OWN a CONSIGNMENT con stock', async () => {
      db.producer.findFirst.mockResolvedValue({ isActive: true });
      db.product.findFirst.mockResolvedValue({ supplyMode: 'OWN', costPricePMP: 0 });
      db.stock.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
      await expect(assignProductToProducer('co1', { productId: 'p1', producerId: 'pr1' })).rejects.toThrow('stock o costo promedio');
      expect(db.product.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza pasar de OWN a CONSIGNMENT con PMP distinto de cero', async () => {
      db.producer.findFirst.mockResolvedValue({ isActive: true });
      db.product.findFirst.mockResolvedValue({ supplyMode: 'OWN', costPricePMP: 1500 });
      db.stock.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      await expect(assignProductToProducer('co1', { productId: 'p1', producerId: 'pr1' })).rejects.toThrow('stock o costo promedio');
    });

    it('rechaza devolver a OWN un producto de consignación con stock', async () => {
      db.product.findFirst.mockResolvedValue({ supplyMode: 'CONSIGNMENT', costPricePMP: 0 });
      db.stock.aggregate.mockResolvedValue({ _sum: { quantity: 3 } });
      await expect(assignProductToProducer('co1', { productId: 'p1', producerId: null })).rejects.toThrow('stock o costo promedio');
    });

    it('cambiar de productor sin cambiar de modo no exige stock en cero', async () => {
      db.producer.findFirst.mockResolvedValue({ isActive: true });
      db.product.findFirst.mockResolvedValue({ supplyMode: 'CONSIGNMENT', costPricePMP: 0 });
      db.product.updateMany.mockResolvedValue({ count: 1 });
      await assignProductToProducer('co1', { productId: 'p1', producerId: 'pr2' });
      expect(db.stock.aggregate).not.toHaveBeenCalled();
    });

    it('no asigna a un productor inactivo', async () => {
      db.product.findFirst.mockResolvedValue({ supplyMode: 'OWN', costPricePMP: 0 });
      db.producer.findFirst.mockResolvedValue({ isActive: false });
      await expect(assignProductToProducer('co1', { productId: 'p1', producerId: 'pr1' })).rejects.toThrow('inactivo');
      expect(db.product.updateMany).not.toHaveBeenCalled();
    });

    it('producto de otra empresa: no encontrado', async () => {
      db.product.findFirst.mockResolvedValue(null);
      await expect(assignProductToProducer('co1', { productId: 'ajeno', producerId: 'pr1' })).rejects.toThrow('Producto no encontrado');
    });
  });
});
