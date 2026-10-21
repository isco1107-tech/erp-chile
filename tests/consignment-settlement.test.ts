/**
 * Transiciones de la liquidación (DRAFT -> CONFIRMED -> PAID), CxP al
 * confirmar, descarte y aislamiento por empresa.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    consignmentSettlement: { findFirst: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    consignmentSettlementLine: { findMany: jest.fn(), updateMany: jest.fn() },
    purchaseDocument: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { ConsignmentError } from '@/modules/consignment/services/consignment.service';
import { confirmSettlement, discardSettlement, markSettlementPaid } from '@/modules/consignment/services/settlement.service';

const db = prisma as unknown as {
  consignmentSettlement: { findFirst: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock };
  consignmentSettlementLine: { findMany: jest.Mock; updateMany: jest.Mock };
  purchaseDocument: { create: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  db.$queryRaw.mockResolvedValue([]);
});

const draft = {
  id: 'abcdefgh12345678',
  status: 'DRAFT',
  periodStart: new Date('2026-10-01T00:00:00Z'),
  periodEnd: new Date('2026-10-31T00:00:00Z'),
  producer: { contactId: 'ct1' },
};

describe('confirmSettlement', () => {
  it('crea la CxP exenta (tipo OTRO, sin IVA) y pasa a CONFIRMED con filtro de estado y empresa', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue(draft);
    db.consignmentSettlementLine.findMany.mockResolvedValue([
      { soldNet: 1000, commissionAmount: 200, producerAmount: 800, isExempt: false },
      { soldNet: -100, commissionAmount: -20, producerAmount: -80, isExempt: false },
    ]);
    db.purchaseDocument.create.mockResolvedValue({ id: 'pd1' });
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 1 });

    const result = await confirmSettlement('co1', draft.id);
    expect(result).toEqual({ payableDocumentId: 'pd1' });
    expect(db.consignmentSettlement.findFirst.mock.calls[0][0].where).toEqual({ id: draft.id, companyId: 'co1' });
    const created = db.purchaseDocument.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      companyId: 'co1',
      contactId: 'ct1',
      documentType: 'OTRO',
      status: 'ISSUED',
      netAmount: 720,
      exemptAmount: 0,
      // IVA del productor: una sola vez sobre el neto afecto agregado (720 * 19% = 136,8).
      ivaAmount: 137,
      totalAmount: 857,
    });
    expect(created.folio).toBe('LIQ-12345678');
    expect(db.consignmentSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: draft.id, companyId: 'co1', status: 'DRAFT' },
      data: {
        status: 'CONFIRMED',
        totalSold: 900,
        totalCommission: 180,
        totalDue: 720,
        producerNetAffected: 720,
        producerExempt: 0,
        producerIva: 137,
        totalPayable: 857,
        payableDocumentId: 'pd1',
      },
    });
  });

  it.each(['CONFIRMED', 'PAID'])('estado %s: transición inválida, no crea CxP', async (status) => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ ...draft, status });
    await expect(confirmSettlement('co1', draft.id)).rejects.toThrow('Solo se puede confirmar una liquidación en borrador');
    expect(db.purchaseDocument.create).not.toHaveBeenCalled();
  });

  it('liquidación de otra empresa: no encontrada', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue(null);
    await expect(confirmSettlement('co1', 'ajena')).rejects.toThrow(ConsignmentError);
    expect(db.consignmentSettlement.findFirst.mock.calls[0][0].where).toEqual({ id: 'ajena', companyId: 'co1' });
  });

  it('saldo cero o negativo: no se confirma', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue(draft);
    db.consignmentSettlementLine.findMany.mockResolvedValue([{ soldNet: -100, commissionAmount: -20, producerAmount: -80, isExempt: false }]);
    await expect(confirmSettlement('co1', draft.id)).rejects.toThrow('cero o negativo');
    expect(db.purchaseDocument.create).not.toHaveBeenCalled();
  });

  it('si otro proceso la cambió entre medio, falla (la transacción se revierte)', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue(draft);
    db.consignmentSettlementLine.findMany.mockResolvedValue([{ soldNet: 100, commissionAmount: 10, producerAmount: 90, isExempt: false }]);
    db.purchaseDocument.create.mockResolvedValue({ id: 'pd1' });
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 0 });
    await expect(confirmSettlement('co1', draft.id)).rejects.toThrow('ya no está en borrador');
  });
});

describe('markSettlementPaid', () => {
  it('CONFIRMED con la CxP saldada en Tesorería: pasa a PAID con filtro de estado', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'CONFIRMED', payableDocument: { paymentStatus: 'PAID' } });
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 1 });
    await markSettlementPaid('co1', 's1');
    expect(db.consignmentSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', companyId: 'co1', status: 'CONFIRMED' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
  });

  it('la CxP aún tiene saldo: pide registrar el pago en Tesorería', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'CONFIRMED', payableDocument: { paymentStatus: 'PARTIAL' } });
    await expect(markSettlementPaid('co1', 's1')).rejects.toThrow('Tesorería');
    expect(db.consignmentSettlement.updateMany).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PAID'])('estado %s: transición inválida', async (status) => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ status, payableDocument: { paymentStatus: 'PAID' } });
    await expect(markSettlementPaid('co1', 's1')).rejects.toThrow('confirmada');
    expect(db.consignmentSettlement.updateMany).not.toHaveBeenCalled();
  });
});

describe('discardSettlement', () => {
  it('borrador: libera las líneas y lo elimina con filtro de estado y empresa', async () => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'DRAFT' });
    db.consignmentSettlementLine.updateMany.mockResolvedValue({ count: 3 });
    db.consignmentSettlement.deleteMany.mockResolvedValue({ count: 1 });
    await discardSettlement('co1', 's1');
    expect(db.consignmentSettlementLine.updateMany).toHaveBeenCalledWith({ where: { companyId: 'co1', settlementId: 's1' }, data: { settlementId: null } });
    expect(db.consignmentSettlement.deleteMany).toHaveBeenCalledWith({ where: { id: 's1', companyId: 'co1', status: 'DRAFT' } });
  });

  it.each(['CONFIRMED', 'PAID'])('estado %s: no se puede descartar', async (status) => {
    db.consignmentSettlement.findFirst.mockResolvedValue({ status });
    await expect(discardSettlement('co1', 's1')).rejects.toThrow('en borrador');
    expect(db.consignmentSettlementLine.updateMany).not.toHaveBeenCalled();
  });
});
