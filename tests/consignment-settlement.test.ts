/**
 * Liquidaciones a sellers de consignación (servicio).
 *
 * Reglas que estos tests protegen:
 *  - multi-tenant: toda consulta lleva `companyId`;
 *  - lo ya liquidado no se vuelve a liquidar; lo anulado después aparece como ajuste negativo;
 *  - una liquidación anulada devuelve sus ventas a pendientes;
 *  - generar bloquea al seller, numera con el correlativo de la empresa y rechaza lo vacío o negativo;
 *  - pagar y anular solo valen desde "por pagar" y dicen por qué no pudieron.
 *
 * Prisma: se espía el cliente real; lo no simulado lanza "Consulta no prevista".
 */

import { prisma } from '@/lib/prisma';
import {
  generateSettlement,
  listSettlementOverview,
  loadPendingBySeller,
  markSettlementPaid,
  voidSettlement,
} from '@/modules/inventory/services/consignment-settlement.service';
import { settlementGenerateSchema, settlementPaySchema, settlementVoidSchema } from '@/modules/inventory/schema';

type Row = Record<string, unknown>;
type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: never[]) => unknown>;

const MODELS = {
  contact: ['findMany'],
  salesDocumentItem: ['findMany'],
  consignmentSettlementLine: ['findMany'],
  consignmentSettlement: ['findMany', 'findFirst', 'groupBy', 'updateMany'],
} as const;

function installDb(): Record<keyof typeof MODELS, Mocks> {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODELS)) {
    db[model] = {};
    for (const method of methods) {
      db[model]![method] = jest.spyOn((prisma as unknown as Record<string, Delegate>)[model]!, method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as Record<keyof typeof MODELS, Mocks>;
}

const COMPANY = 'company-a';
const SELLER = 'seller-1';
const whereOf = (mock: jest.Mock, call = 0) => (mock.mock.calls[call]![0] as { where: Row }).where;

/** Una línea vendida tal como la devuelve la consulta (con su documento). */
const sold = (id: string, over: Row = {}, doc: Row = {}) => ({
  id,
  consignorId: SELLER,
  productId: `prod-${id}`,
  sku: `SKU-${id}`,
  description: `Producto ${id}`,
  quantity: 2,
  subtotal: 10_000,
  consignorCommissionBps: 2000,
  consignorBaseNet: null,
  document: { dteType: 'BOLETA_39', status: 'ISSUED', folio: 100, issueDate: new Date('2026-10-01T15:00:00Z'), ...doc },
  ...over,
});

let db: ReturnType<typeof installDb>;
let tx: {
  $queryRaw: jest.Mock;
  salesDocumentItem: Mocks;
  consignmentSettlementLine: Mocks;
  internalDocumentSequence: Mocks;
  consignmentSettlement: Mocks;
};
beforeEach(() => {
  db = installDb();
  tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: SELLER }]),
    salesDocumentItem: { findMany: jest.fn().mockResolvedValue([]) },
    consignmentSettlementLine: { findMany: jest.fn().mockResolvedValue([]) },
    internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 7 }) },
    consignmentSettlement: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Row }) => ({ id: 'st1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation(((callback: (client: unknown) => unknown) => callback(tx)) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('lo pendiente de liquidar', () => {
  it('consulta solo la empresa y el seller, y descuenta las liquidaciones vigentes (no las anuladas)', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    await loadPendingBySeller(prisma, COMPANY, SELLER);
    expect(whereOf(db.salesDocumentItem.findMany)).toMatchObject({ companyId: COMPANY, consignorId: SELLER });
    const documentFilter = (whereOf(db.salesDocumentItem.findMany) as { document: Row }).document;
    expect(documentFilter).toEqual({ dteType: { in: ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_CREDITO_61'] }, status: { in: ['ISSUED', 'CANCELLED'] } });
    expect(whereOf(db.consignmentSettlementLine.findMany)).toEqual({ companyId: COMPANY, settlement: { status: { not: 'VOIDED' }, consignorId: SELLER } });
  });

  it('sin seller pide los de todos los sellers de la empresa', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    await loadPendingBySeller(prisma, COMPANY);
    expect(whereOf(db.salesDocumentItem.findMany)).toMatchObject({ companyId: COMPANY, consignorId: { not: null } });
    expect(whereOf(db.consignmentSettlementLine.findMany)).toEqual({ companyId: COMPANY, settlement: { status: { not: 'VOIDED' } } });
  });

  it('lo vendido y no liquidado queda pendiente con su documento', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a')]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    const pending = (await loadPendingBySeller(prisma, COMPANY, SELLER)).get(SELLER)!;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ salesDocumentItemId: 'a', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000, dteType: 'BOLETA_39', folio: 100 });
  });

  it('lo ya liquidado no vuelve a aparecer', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a'), sold('b')]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([{ salesDocumentItemId: 'a', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    const pending = (await loadPendingBySeller(prisma, COMPANY, SELLER)).get(SELLER)!;
    expect(pending.map((line) => line.salesDocumentItemId)).toEqual(['b']);
  });

  it('un documento anulado después de liquidarse resta en la siguiente', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a', {}, { status: 'CANCELLED' })]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([{ salesDocumentItemId: 'a', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    const pending = (await loadPendingBySeller(prisma, COMPANY, SELLER)).get(SELLER)!;
    expect(pending[0]).toMatchObject({ quantity: -2, netAmount: -10_000, payoutAmount: -8000 });
  });

  it('un documento anulado que nunca se liquidó no deja nada', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a', {}, { status: 'CANCELLED' })]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    expect((await loadPendingBySeller(prisma, COMPANY, SELLER)).size).toBe(0);
  });

  it('una devolución revierte la base que se le acreditó, no el precio de la nota', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('n', { quantity: 1, subtotal: 10_000, consignorBaseNet: 9000 }, { dteType: 'NOTA_CREDITO_61' })]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    const pending = (await loadPendingBySeller(prisma, COMPANY, SELLER)).get(SELLER)!;
    expect(pending[0]).toMatchObject({ quantity: -1, netAmount: -9000, commissionAmount: -1800, payoutAmount: -7200 });
  });

  it('separa a cada seller', async () => {
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a'), sold('b', { consignorId: 'seller-2' })]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    const pending = await loadPendingBySeller(prisma, COMPANY);
    expect([...pending.keys()].sort()).toEqual([SELLER, 'seller-2']);
  });
});

describe('generar la liquidación', () => {
  const generate = (over: Row = {}) => generateSettlement(COMPANY, 'user-1', { consignorId: SELLER, adjustmentAmount: 0, ...over });

  it('bloquea al seller, numera con el correlativo de la empresa y guarda cada línea con su empresa', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a'), sold('b', { quantity: 1, subtotal: 5_000 })]);
    await generate({ note: 'Octubre' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.internalDocumentSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId_kind: { companyId: COMPANY, kind: 'CONSIGNMENT_SETTLEMENT' } } }));
    const data = (tx.consignmentSettlement.create.mock.calls[0]![0] as { data: Row & { lines: { create: Row[] } } }).data;
    expect(data).toMatchObject({ companyId: COMPANY, consignorId: SELLER, number: 7, units: 3, netSales: 15_000, commissionAmount: 3000, adjustmentAmount: 0, payoutAmount: 12_000, note: 'Octubre', createdById: 'user-1' });
    expect(data.lines.create).toHaveLength(2);
    expect(data.lines.create.every((line) => line.companyId === COMPANY)).toBe(true);
    expect(data.lines.create[0]).toMatchObject({ salesDocumentItemId: 'a', netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 });
  });

  it('recalcula lo pendiente DENTRO de la transacción (dos clics seguidos no liquidan dos veces)', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a')]);
    tx.consignmentSettlementLine.findMany.mockResolvedValue([{ salesDocumentItemId: 'a', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    await expect(generate()).rejects.toThrow('No hay ventas pendientes');
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
    expect(db.salesDocumentItem.findMany).not.toHaveBeenCalled(); // usó el cliente de la transacción, no el global
  });

  it('un seller que no es de la empresa se rechaza', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(generate()).rejects.toThrow('Seller no encontrado');
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
  });

  it('suma el ajuste manual a lo que se le debe y lo guarda con su motivo', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a')]);
    await generate({ adjustmentAmount: -1500, adjustmentNote: 'Nota de crédito por precio' });
    expect((tx.consignmentSettlement.create.mock.calls[0]![0] as { data: Row }).data).toMatchObject({ payoutAmount: 6500, adjustmentAmount: -1500, adjustmentNote: 'Nota de crédito por precio' });
  });

  it('un ajuste solo, sin ventas, también se puede liquidar', async () => {
    await generate({ adjustmentAmount: 3000, adjustmentNote: 'Bonificación acordada' });
    const data = (tx.consignmentSettlement.create.mock.calls[0]![0] as { data: Row & { lines: { create: Row[] } } }).data;
    expect(data).toMatchObject({ units: 0, netSales: 0, payoutAmount: 3000 });
    expect(data.lines.create).toEqual([]);
  });

  it('si las devoluciones superan lo vendido no se liquida y queda pendiente', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a', { quantity: 1, subtotal: 5_000 }), sold('c', { quantity: 3, subtotal: 30_000 }, { dteType: 'NOTA_CREDITO_61' })]);
    await expect(generate()).rejects.toThrow('Las devoluciones superan lo vendido');
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
    expect(tx.internalDocumentSequence.upsert).not.toHaveBeenCalled(); // no gasta un número
  });

  it('un reintento con la misma clave devuelve la liquidación ya creada y no genera otra', async () => {
    tx.consignmentSettlement.findFirst.mockResolvedValue({ id: 'st-previa', number: 7, consignorId: SELLER, payoutAmount: 50_000, units: 0 });
    const result = await generate({ adjustmentAmount: 50_000, adjustmentNote: 'Bonificación acordada', idempotencyKey: 'intento-abc-123' });
    expect(result).toMatchObject({ id: 'st-previa', number: 7 });
    expect(tx.consignmentSettlement.findFirst.mock.calls[0]![0]).toMatchObject({ where: { companyId: COMPANY, idempotencyKey: 'intento-abc-123' } });
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
    expect(tx.internalDocumentSequence.upsert).not.toHaveBeenCalled();
  });

  it('con una clave nueva crea la liquidación y la guarda con su clave', async () => {
    await generate({ adjustmentAmount: 3000, adjustmentNote: 'Bonificación acordada', idempotencyKey: 'intento-nuevo-1' });
    expect((tx.consignmentSettlement.create.mock.calls[0]![0] as { data: Row }).data).toMatchObject({ idempotencyKey: 'intento-nuevo-1', payoutAmount: 3000 });
  });

  it('si las ventas cambiaron desde la vista previa, no liquida otro monto', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a')]);
    await expect(generate({ expectedPayoutAmount: 5000 })).rejects.toThrow('Las ventas cambiaron desde que abriste la vista previa (ahora se le pagaría $8.000)');
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
    expect(tx.internalDocumentSequence.upsert).not.toHaveBeenCalled();
    await generate({ expectedPayoutAmount: 8000 });
    expect(tx.consignmentSettlement.create).toHaveBeenCalledTimes(1);
  });

  it('un total negativo por el ajuste se explica distinto que uno por devoluciones', async () => {
    tx.salesDocumentItem.findMany.mockResolvedValue([sold('a', { quantity: 1, subtotal: 5000 })]);
    await expect(generate({ adjustmentAmount: -9000, adjustmentNote: 'Descuento acordado' })).rejects.toThrow('El ajuste manual deja el total en negativo');
    expect(tx.consignmentSettlement.create).not.toHaveBeenCalled();
  });

  it('el esquema pide el motivo de un ajuste', () => {
    expect(settlementGenerateSchema.safeParse({ consignorId: SELLER, adjustmentAmount: 500 }).success).toBe(false);
    expect(settlementGenerateSchema.safeParse({ consignorId: SELLER, adjustmentAmount: 500, adjustmentNote: 'ok' }).success).toBe(false);
    expect(settlementGenerateSchema.safeParse({ consignorId: SELLER, adjustmentAmount: 500, adjustmentNote: 'Bonificación' }).success).toBe(true);
    expect(settlementGenerateSchema.safeParse({ consignorId: SELLER }).success).toBe(true);
    expect(settlementGenerateSchema.safeParse({ consignorId: SELLER, adjustmentAmount: 1.5, adjustmentNote: 'Bonificación' }).success).toBe(false);
  });
});

describe('pagar y anular', () => {
  it('pagar solo vale desde "por pagar" y filtra por empresa', async () => {
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 1 });
    await markSettlementPaid(COMPANY, { id: 'st1', paidAt: '2026-10-20', reference: 'Transferencia 123' });
    const call = db.consignmentSettlement.updateMany.mock.calls[0]![0] as { where: Row; data: Row };
    expect(call.where).toEqual({ id: 'st1', companyId: COMPANY, status: 'CONFIRMED' });
    expect(call.data).toMatchObject({ status: 'PAID', paymentReference: 'Transferencia 123' });
    expect((call.data.paidAt as Date).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('explica por qué no se pudo pagar', async () => {
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 0 });
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'PAID', number: 4 });
    await expect(markSettlementPaid(COMPANY, { id: 'st1', paidAt: '2026-10-20' })).rejects.toThrow('La liquidación N° 4 ya está pagada');
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'VOIDED', number: 4 });
    await expect(markSettlementPaid(COMPANY, { id: 'st1', paidAt: '2026-10-20' })).rejects.toThrow('está anulada');
    db.consignmentSettlement.findFirst.mockResolvedValue(null);
    await expect(markSettlementPaid(COMPANY, { id: 'st1', paidAt: '2026-10-20' })).rejects.toThrow('Liquidación no encontrada');
    expect(whereOf(db.consignmentSettlement.findFirst)).toEqual({ id: 'st1', companyId: COMPANY });
  });

  it('anular solo vale desde "por pagar": una pagada no se anula', async () => {
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 0 });
    db.consignmentSettlement.findFirst.mockResolvedValue({ status: 'PAID', number: 9 });
    await expect(voidSettlement(COMPANY, { id: 'st1', reason: 'Error de digitación' })).rejects.toThrow('ya está pagada y no se puede anular');
    expect(whereOf(db.consignmentSettlement.updateMany)).toEqual({ id: 'st1', companyId: COMPANY, status: 'CONFIRMED' });
  });

  it('anular guarda el motivo', async () => {
    db.consignmentSettlement.updateMany.mockResolvedValue({ count: 1 });
    await voidSettlement(COMPANY, { id: 'st1', reason: 'Error de digitación' });
    const data = (db.consignmentSettlement.updateMany.mock.calls[0]![0] as { data: Row }).data;
    expect(data).toMatchObject({ status: 'VOIDED', voidReason: 'Error de digitación' });
    expect(data.voidedAt).toBeInstanceOf(Date);
  });

  it('valida la fecha de pago y el motivo de anulación', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: today }).success).toBe(true);
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: '1999-12-31' }).success).toBe(false); // de otro siglo
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: '2099-01-01' }).success).toBe(false); // en el futuro
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: '2026-10-20' }).success).toBe(true);
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: '2026-02-31' }).success).toBe(false);
    expect(settlementPaySchema.safeParse({ id: 'x', paidAt: '20/10/2026' }).success).toBe(false);
    expect(settlementVoidSchema.safeParse({ id: 'x', reason: 'ab' }).success).toBe(false);
    expect(settlementVoidSchema.safeParse({ id: 'x', reason: 'Error de digitación' }).success).toBe(true);
  });
});

describe('resumen por seller', () => {
  it('une lo pendiente con lo liquidado sin pagar, por seller y de esta empresa', async () => {
    db.contact.findMany.mockResolvedValue([
      { id: SELLER, razonSocial: 'Cerámicas del Sur', nombreFantasia: null, rut: '12.345.678-5', consignmentCommissionBps: 2000 },
      { id: 'seller-2', razonSocial: 'Telares', nombreFantasia: 'Telares Ñuble', rut: '9.876.543-3', consignmentCommissionBps: 1500 },
    ]);
    db.salesDocumentItem.findMany.mockResolvedValue([sold('a')]);
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    db.consignmentSettlement.groupBy.mockResolvedValue([{ consignorId: 'seller-2', _sum: { payoutAmount: 42_000 }, _count: { _all: 2 } }]);

    const rows = await listSettlementOverview(COMPANY);
    expect(whereOf(db.contact.findMany)).toEqual({ companyId: COMPANY, isConsignor: true });
    expect(whereOf(db.consignmentSettlement.groupBy)).toEqual({ companyId: COMPANY, status: 'CONFIRMED' });
    expect(rows[0]).toMatchObject({ consignorId: SELLER, name: 'Cerámicas del Sur', pendingUnits: 2, pendingNet: 10_000, pendingCommission: 2000, pendingPayout: 8000, unpaidCount: 0, unpaidPayout: 0 });
    expect(rows[1]).toMatchObject({ consignorId: 'seller-2', name: 'Telares Ñuble', pendingPayout: 0, unpaidCount: 2, unpaidPayout: 42_000 });
  });
});
