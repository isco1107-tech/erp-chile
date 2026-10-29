import { prisma } from '@/lib/prisma';

/**
 * Auditoría de experiencia de uso (27-10-2026):
 * - A1: un borrador de venta se retoma y se emite EN SU LUGAR (nunca quedan
 *   borrador y emisión vivos a la vez, y dos emisiones del mismo borrador no pasan).
 * - A3: el movimiento manual de stock ya no admite «Salida por venta» y la
 *   salida por ajuste exige motivo.
 * - A6: el aviso de cierre de sesión llega antes de que la sesión venza.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  // Como el real, devuelve el movimiento con el costo al que salió.
  applyStockOut: jest.fn(async () => ({ unitCost: 1000 })),
}));
jest.mock('@/modules/dte/services/stamping.service', () => ({
  assignSalesFolio: jest.fn().mockResolvedValue({ folio: 900, stamping: null }),
  stampDocument: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postCreditNoteIssued: jest.fn(),
  postSalesDocumentIssued: jest.fn(),
  reverseSalesDocumentPosting: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({
  reverseDocumentEntries: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { salesDocumentCreateSchema, type SalesDocumentCreateInput } from '@/modules/sales/schema';
import { MOVEMENT_TYPES, stockMovementSchema } from '@/modules/inventory/schema';
import { SESSION_WARNING_MINUTES, santiagoClock, sessionExpiryPlan } from '@/lib/auth/session-expiry';

/** Corta el flujo al crear el documento: lo que se prueba ocurre antes. */
const STOP = 'STOP_ANTES_DE_CREAR';

function fakeTx(deletedDrafts: number) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'cli1', creditLimit: null }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', costPricePMP: 1000, isExempt: false, isTrackable: true }) },
    salesDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: deletedDrafts }),
      create: jest.fn().mockRejectedValue(new Error(STOP)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    company: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  return tx;
}

function invoice(overrides: Partial<SalesDocumentCreateInput> = {}): SalesDocumentCreateInput {
  return {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'FACTURA_33',
    paymentMethod: 'CREDITO_30',
    // Línea libre: sin producto no entran stock ni consignación, que aquí no se prueban.
    items: [{ description: 'Servicio de instalación', quantity: 1, unitPrice: 10000 }],
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('A1: retomar un borrador de venta', () => {
  it('elimina el borrador (solo si sigue siendo borrador y de la misma empresa) dentro de la transacción', async () => {
    const tx = fakeTx(1);
    await expect(createSalesDocument('c1', invoice({ replacesDraftId: 'draft1' }), 'ISSUED')).rejects.toThrow(STOP);
    expect(tx.salesDocument.deleteMany).toHaveBeenCalledWith({ where: { id: 'draft1', companyId: 'c1', status: 'DRAFT' } });
  });

  it('rechaza emitir un borrador que ya se emitió o se eliminó (doble clic, otra pestaña)', async () => {
    const tx = fakeTx(0);
    await expect(createSalesDocument('c1', invoice({ replacesDraftId: 'draft1' }), 'ISSUED')).rejects.toThrow('ya fue emitido o eliminado');
    expect(tx.salesDocument.create).not.toHaveBeenCalled();
  });

  it('una venta nueva no toca ningún borrador', async () => {
    const tx = fakeTx(1);
    await expect(createSalesDocument('c1', invoice(), 'ISSUED')).rejects.toThrow(STOP);
    expect(tx.salesDocument.deleteMany).not.toHaveBeenCalled();
  });

  it('la forma de pago es obligatoria (sin «Efectivo» por defecto)', () => {
    const parsed = salesDocumentCreateSchema.safeParse({ ...invoice(), paymentMethod: '' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('Selecciona una forma de pago');
  });
});

describe('A3: movimiento manual de stock', () => {
  const base = { productId: 'p1', warehouseId: 'w1', quantity: 2 };

  it('no ofrece ni acepta «Salida por venta»', () => {
    expect(MOVEMENT_TYPES).not.toContain('SALE_OUT');
    expect(stockMovementSchema.safeParse({ ...base, type: 'SALE_OUT' }).success).toBe(false);
  });

  it('la salida por ajuste exige un motivo de la lista cerrada', () => {
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_OUT' }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_OUT', reasonCode: 'INVENTADO' }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_OUT', reasonCode: 'EXPIRED' }).success).toBe(true);
  });

  it('«Otro motivo» obliga a explicar en las notas', () => {
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_OUT', reasonCode: 'OTHER' }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_OUT', reasonCode: 'OTHER', notes: 'Se cayó del camión' }).success).toBe(true);
  });

  it('las entradas y traslados siguen igual (sin motivo)', () => {
    expect(stockMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT_IN', unitCost: 500 }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ ...base, type: 'TRANSFER', targetWarehouseId: 'w2' }).success).toBe(true);
  });
});

describe('A6: aviso de cierre de sesión', () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);

  it('avisa 10 minutos antes y cierra al vencer', () => {
    const plan = sessionExpiryPlan(now + 60 * 60_000, now);
    expect(plan.expireInMs).toBe(60 * 60_000);
    expect(plan.warnInMs).toBe((60 - SESSION_WARNING_MINUTES) * 60_000);
  });

  it('con menos de 10 minutos avisa de inmediato; vencida, cierra de inmediato', () => {
    expect(sessionExpiryPlan(now + 5 * 60_000, now).warnInMs).toBe(0);
    expect(sessionExpiryPlan(now - 1000, now)).toEqual({ warnInMs: 0, expireInMs: 0 });
  });

  it('la hora sale en Santiago y en 24 horas', () => {
    // 28-10-2026 12:00 UTC = 09:00 en Santiago (UTC-3, horario de verano).
    expect(santiagoClock(new Date(now))).toBe('09:00');
    expect(santiagoClock(new Date(Date.UTC(2026, 9, 28, 20, 5)))).toBe('17:05');
  });
});
