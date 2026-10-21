/**
 * Enganche y reversas de consignación con Prisma simulado: bandera apagada,
 * tipos de documento, idempotencia, notas de crédito, anulaciones y
 * aislamiento por empresa.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/modules/accounting/posting-rules/consignment-posting', () => ({ postConsignmentAccrual: jest.fn() }));

import type { Prisma } from '@prisma/client';
import { postConsignmentAccrual } from '@/modules/accounting/posting-rules/consignment-posting';
import {
  applyConsignmentToIssuedDocument,
  reverseConsignmentForCancelledDocument,
  reverseConsignmentForCreditNote,
} from '@/modules/consignment/services/consignment-hook.service';

type Fn = jest.Mock;
interface FakeTx {
  $queryRaw: Fn;
  companyFeatures: { findUnique: Fn };
  salesDocument: { findFirst: Fn };
  salesDocumentItem: { findMany: Fn };
  consignmentSettlementLine: { findMany: Fn; createMany: Fn; aggregate: Fn };
  consignmentSettlement: { updateMany: Fn };
}

function makeTx(opts: { enabled?: boolean; lockedStatus?: string } = {}): FakeTx {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ status: opts.lockedStatus ?? 'DRAFT' }]),
    companyFeatures: { findUnique: jest.fn().mockResolvedValue({ hasConsignment: opts.enabled ?? true }) },
    salesDocument: { findFirst: jest.fn() },
    salesDocumentItem: { findMany: jest.fn() },
    consignmentSettlementLine: {
      findMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { soldNet: 800, commissionAmount: 160, producerAmount: 640 } }),
    },
    consignmentSettlement: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;
const accrual = postConsignmentAccrual as jest.Mock;
beforeEach(() => accrual.mockClear());
const issueDate = new Date('2026-10-15T15:00:00Z');

describe('applyConsignmentToIssuedDocument', () => {
  it('módulo apagado: no consulta ni escribe nada más', async () => {
    const tx = makeTx({ enabled: false });
    await applyConsignmentToIssuedDocument(asTx(tx), 'co1', { id: 'd1', dteType: 'BOLETA_39', referenceType: null, referenceFolio: null });
    expect(tx.companyFeatures.findUnique).toHaveBeenCalledWith({ where: { companyId: 'co1' }, select: { hasConsignment: true } });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
    expect(tx.consignmentSettlementLine.findMany).not.toHaveBeenCalled();
    expect(tx.salesDocument.findFirst).not.toHaveBeenCalled();
  });

  it.each(['GUIA_DESPACHO_52', 'NOTA_DEBITO_56', 'COTIZACION'] as const)('%s no devenga ni consulta la bandera', async (dteType) => {
    const tx = makeTx();
    await applyConsignmentToIssuedDocument(asTx(tx), 'co1', { id: 'd1', dteType, referenceType: null, referenceFolio: null });
    expect(tx.companyFeatures.findUnique).not.toHaveBeenCalled();
  });

  it('venta: busca el documento solo de esa empresa y devenga con skipDuplicates (idempotente)', async () => {
    const tx = makeTx();
    tx.consignmentSettlementLine.findMany.mockResolvedValue([]);
    tx.salesDocument.findFirst.mockResolvedValue({
      issueDate,
      items: [{ id: 'i1', productId: 'p1', subtotal: 1000, iva: 190, isExempt: false, product: { producerId: 'pr1', commissionBpsOverride: null, producer: { defaultCommissionBps: 2000, commissionBase: 'NET' } } }],
    });
    await applyConsignmentToIssuedDocument(asTx(tx), 'co1', { id: 'd1', dteType: 'FACTURA_33', referenceType: null, referenceFolio: null });
    expect(tx.salesDocument.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'd1', companyId: 'co1', status: 'ISSUED' });
    const args = tx.consignmentSettlementLine.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data[0]).toMatchObject({ companyId: 'co1', salesDocumentItemId: 'i1', kind: 'SALE', commissionAmount: 200, producerAmount: 800 });
    // Devengo contable por lo debido al productor, en la misma transacción.
    expect(accrual).toHaveBeenCalledWith(tx, 'co1', expect.objectContaining({ sourceId: 'd1', producerAmount: 800 }));
  });

  it('venta repetida (líneas ya creadas): no vuelve a devengar en contabilidad', async () => {
    const tx = makeTx();
    tx.consignmentSettlementLine.findMany.mockResolvedValue([{ salesDocumentItemId: 'i1' }]);
    tx.salesDocument.findFirst.mockResolvedValue({
      issueDate,
      items: [{ id: 'i1', productId: 'p1', subtotal: 1000, iva: 190, isExempt: false, product: { producerId: 'pr1', commissionBpsOverride: null, producer: { defaultCommissionBps: 2000, commissionBase: 'NET' } } }],
    });
    await applyConsignmentToIssuedDocument(asTx(tx), 'co1', { id: 'd1', dteType: 'BOLETA_39', referenceType: null, referenceFolio: null });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
    expect(accrual).not.toHaveBeenCalled();
  });
});

describe('reverseConsignmentForCreditNote', () => {
  const originalLine = { id: 'L1', productId: 'p1', producerId: 'pr1', commissionBps: 2000, settlementId: 'S1' };

  function arm(tx: FakeTx, lines: unknown[] = [originalLine]) {
    tx.salesDocument.findFirst.mockResolvedValueOnce({ id: 'orig' }).mockResolvedValueOnce({ issueDate });
    tx.consignmentSettlementLine.findMany
      .mockResolvedValueOnce(lines)
      // Líneas del borrador, al recalcular sus totales (venta 1000/200/800 y la reversa -500/-100/-400).
      .mockResolvedValue([
        { soldNet: 1000, commissionAmount: 200, producerAmount: 800, isExempt: false },
        { soldNet: -500, commissionAmount: -100, producerAmount: -400, isExempt: false },
      ]);
    tx.salesDocumentItem.findMany.mockResolvedValue([
      { id: 'nci1', productId: 'p1', subtotal: 500, iva: 95, isExempt: false },
      { id: 'nci2', productId: 'pX', subtotal: 300, iva: 57, isExempt: false },
    ]);
  }

  it('crea una línea negativa con la comisión congelada y la mete al borrador original', async () => {
    const tx = makeTx({ lockedStatus: 'DRAFT' });
    arm(tx);
    const count = await reverseConsignmentForCreditNote(asTx(tx), 'co1', 'nc1', 'FACTURA_33', 10);
    expect(count).toEqual({ count: 1, producerAmount: -400 });
    expect(tx.salesDocument.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'co1', dteType: 'FACTURA_33', folio: 10, status: 'ISSUED' });
    expect(tx.salesDocumentItem.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'co1', documentId: 'nc1' });
    const args = tx.consignmentSettlementLine.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toEqual([
      {
        companyId: 'co1',
        producerId: 'pr1',
        salesDocumentItemId: 'nci1',
        kind: 'REVERSAL',
        reversesLineId: 'L1',
        productId: 'p1',
        soldNet: -500,
        commissionBps: 2000,
        commissionAmount: -100,
        producerAmount: -400,
        isExempt: false,
        saleIva: -95,
        documentDate: issueDate,
        settlementId: 'S1',
      },
    ]);
    // El producto que no estaba en consignación (pX) no genera nada, y el borrador se recalcula.
    expect(tx.consignmentSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 'S1', companyId: 'co1', status: 'DRAFT' },
      data: expect.objectContaining({ totalSold: 500, totalCommission: 100, totalDue: 400, producerNetAffected: 400, producerIva: 76, totalPayable: 476 }),
    });
    // El asiento refleja la reversa (importe negativo = espejo del devengo).
    expect(accrual).toHaveBeenCalledWith(tx, 'co1', expect.objectContaining({ sourceId: 'nc1', producerAmount: -400 }));
  });

  it('si la liquidación original ya está confirmada, la reversa queda pendiente (ajuste contra la siguiente)', async () => {
    const tx = makeTx({ lockedStatus: 'CONFIRMED' });
    arm(tx);
    await reverseConsignmentForCreditNote(asTx(tx), 'co1', 'nc1', 'FACTURA_33', 10);
    expect(tx.consignmentSettlementLine.createMany.mock.calls[0][0].data[0].settlementId).toBeNull();
    expect(tx.consignmentSettlement.updateMany).not.toHaveBeenCalled();
  });

  it('la venta original sin líneas de consignación: no hace nada', async () => {
    const tx = makeTx();
    arm(tx, []);
    expect(await reverseConsignmentForCreditNote(asTx(tx), 'co1', 'nc1', 'FACTURA_33', 10)).toEqual({ count: 0, producerAmount: 0 });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
  });

  it('el documento referenciado no existe en la empresa: no hace nada', async () => {
    const tx = makeTx();
    tx.salesDocument.findFirst.mockResolvedValue(null);
    expect(await reverseConsignmentForCreditNote(asTx(tx), 'co1', 'nc1', 'FACTURA_33', 10)).toEqual({ count: 0, producerAmount: 0 });
  });

  it('el despachador enruta una NC a la reversa', async () => {
    const tx = makeTx({ lockedStatus: 'CONFIRMED' });
    arm(tx);
    await applyConsignmentToIssuedDocument(asTx(tx), 'co1', { id: 'nc1', dteType: 'NOTA_CREDITO_61', referenceType: 'FACTURA_33', referenceFolio: 10 });
    expect(tx.consignmentSettlementLine.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('reverseConsignmentForCancelledDocument', () => {
  it('módulo apagado: no hace nada', async () => {
    const tx = makeTx({ enabled: false });
    expect(await reverseConsignmentForCancelledDocument(asTx(tx), 'co1', 'd1')).toEqual({ count: 0, producerAmount: 0 });
    expect(tx.consignmentSettlementLine.findMany).not.toHaveBeenCalled();
  });

  it('contrapartida del neto vigente: la venta más lo que ya revirtió una NC', async () => {
    const tx = makeTx({ lockedStatus: 'DRAFT' });
    tx.consignmentSettlementLine.findMany
      .mockResolvedValueOnce([
        { id: 'L1', productId: 'p1', producerId: 'pr1', commissionBps: 2000, soldNet: 1000, commissionAmount: 200, producerAmount: 800, settlementId: 'S1', reversesLineId: null, isExempt: false, saleIva: 190 },
      ])
      .mockResolvedValueOnce([{ reversesLineId: 'L1', saleIva: -76, soldNet: -400, commissionAmount: -80, producerAmount: -320 }])
      .mockResolvedValue([]);
    expect((await reverseConsignmentForCancelledDocument(asTx(tx), 'co1', 'd1')).count).toBe(1);
    expect(tx.consignmentSettlementLine.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'co1' });
    const data = tx.consignmentSettlementLine.createMany.mock.calls[0][0].data;
    expect(data).toEqual([
      { companyId: 'co1', producerId: 'pr1', productId: 'p1', kind: 'REVERSAL', reversesLineId: 'L1', soldNet: -600, commissionBps: 2000, commissionAmount: -120, producerAmount: -480, isExempt: false, saleIva: -114, documentDate: expect.any(Date), settlementId: 'S1' },
    ]);
  });

  it('venta ya totalmente revertida por notas de crédito: no duplica la reversa', async () => {
    const tx = makeTx();
    tx.consignmentSettlementLine.findMany
      .mockResolvedValueOnce([
        { id: 'L1', productId: 'p1', producerId: 'pr1', commissionBps: 2000, soldNet: 1000, commissionAmount: 200, producerAmount: 800, settlementId: null, reversesLineId: null, isExempt: false, saleIva: 190 },
      ])
      .mockResolvedValueOnce([{ reversesLineId: 'L1', saleIva: -76, soldNet: -1000, commissionAmount: -200, producerAmount: -800 }]);
    expect(await reverseConsignmentForCancelledDocument(asTx(tx), 'co1', 'd1')).toEqual({ count: 0, producerAmount: 0 });
    expect(tx.consignmentSettlementLine.createMany).not.toHaveBeenCalled();
  });

  it('anular una nota de crédito repone lo que descontó (signo contrario, mismo origen)', async () => {
    const tx = makeTx({ lockedStatus: 'PAID' });
    tx.consignmentSettlementLine.findMany.mockResolvedValueOnce([
      { id: 'R1', productId: 'p1', producerId: 'pr1', commissionBps: 2000, soldNet: -500, commissionAmount: -100, producerAmount: -400, settlementId: 'S1', reversesLineId: 'L1', isExempt: false, saleIva: -95 },
    ]);
    await reverseConsignmentForCancelledDocument(asTx(tx), 'co1', 'nc1');
    expect(tx.consignmentSettlementLine.createMany.mock.calls[0][0].data[0]).toMatchObject({
      kind: 'REVERSAL',
      reversesLineId: 'L1',
      soldNet: 500,
      commissionAmount: 100,
      producerAmount: 400,
      settlementId: null,
    });
  });
});
