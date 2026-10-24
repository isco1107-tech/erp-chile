import { revalidatePath } from 'next/cache';
import { createAuditLog } from '@/lib/auth/audit';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import * as cash from '@/modules/pos/services/cash.service';
import * as pos from '@/modules/pos/services/pos.service';
import {
  closeShiftAction,
  createPosSaleAction,
  getShiftSummaryAction,
  listCashMovementsAction,
  listShiftSalesAction,
  listShiftsAction,
  registerCashMovementAction,
} from '@/modules/pos/actions/pos.actions';

const permissions = new Set<string>();
const session = { id: 'cashier-1', email: 'cajera@example.cl', companyId: 'company-1' };

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(async (permission: string) => {
    if (!permissions.has(permission)) throw new Error('Sin permiso para operar');
    return session;
  }),
  authErrorMessage: () => null,
  can: (_session: unknown, permission: string) => permissions.has(permission),
}));
jest.mock('@/lib/supersuite', () => ({ latidoCajaSupersuite: jest.fn(), supersuiteHabilitada: () => false }));
jest.mock('@/modules/pos/services/cash.service', () => ({
  getShift: jest.fn(),
  getShiftSummary: jest.fn(),
  closeShift: jest.fn(),
  registerCashMovement: jest.fn(),
  listCashMovements: jest.fn(),
  listShifts: jest.fn(),
}));
jest.mock('@/modules/pos/services/pos.service', () => ({ createPosSale: jest.fn(), listShiftSales: jest.fn() }));

function shiftFor(userId: string | null): cash.OpenShiftDetail {
  return {
    id: 'shift-1', companyId: session.companyId, userId, status: 'OPEN',
    cashRegisterId: 'register-1', initialAmount: 10000, openedAt: new Date('2026-10-23T12:00:00Z'),
    user: userId ? { id: userId, name: 'Cajera', email: 'cajera@example.cl' } : null,
  } as cash.OpenShiftDetail;
}

const summary: cash.ShiftSummary = {
  shiftId: 'shift-1', openedAt: new Date('2026-10-23T12:00:00Z'), initialAmount: 10000,
  byPaymentMethod: [], salesTotal: 0, documentCount: 0, cashSales: 0, inflows: 0, outflows: 0,
  cancelledCount: 0, cancelledTotal: 0, cancelledCashTotal: 0, expectedAmount: 10000,
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  permissions.add('pos:operate');
  jest.mocked(cash.getShift).mockResolvedValue(shiftFor(session.id));
  jest.mocked(cash.getShiftSummary).mockResolvedValue(summary);
  jest.mocked(cash.listCashMovements).mockResolvedValue([]);
  jest.mocked(pos.listShiftSales).mockResolvedValue([]);
  jest.mocked(cash.listShifts).mockResolvedValue([]);
  jest.mocked(cash.closeShift).mockResolvedValue({
    shift: { ...shiftFor(session.id), status: 'CLOSED', expectedAmount: 10000, actualAmount: 10000, difference: 0 },
    summary,
  });
});

const reads = [
  { name: 'arqueo', invoke: () => getShiftSummaryAction('shift-1'), service: cash.getShiftSummary },
  { name: 'movimientos', invoke: () => listCashMovementsAction('shift-1'), service: cash.listCashMovements },
  { name: 'ventas', invoke: () => listShiftSalesAction('shift-1'), service: pos.listShiftSales },
];

describe.each(reads)('acceso al turno: $name', ({ invoke, service }) => {
  it('el cajero consulta su turno dentro de la empresa autenticada', async () => {
    expect((await invoke()).success).toBe(true);
    expect(cash.getShift).toHaveBeenCalledWith(session.companyId, 'shift-1');
    expect(service).toHaveBeenCalledWith(session.companyId, 'shift-1');
  });

  it.each(['cashier-2', null])('no revela un turno ajeno o sin dueño (%s)', async (userId) => {
    jest.mocked(cash.getShift).mockResolvedValue(shiftFor(userId));
    expect(await invoke()).toEqual({ success: false, error: 'No tienes acceso a este turno de caja' });
    expect(service).not.toHaveBeenCalled();
  });

  it('el supervisor puede consultar otro turno', async () => {
    permissions.add('pos:close');
    jest.mocked(cash.getShift).mockResolvedValue(shiftFor('cashier-2'));
    expect((await invoke()).success).toBe(true);
    expect(service).toHaveBeenCalledWith(session.companyId, 'shift-1');
  });

  it('un ID inexistente o de otra empresa no llega a la lectura de datos', async () => {
    permissions.add('pos:close');
    jest.mocked(cash.getShift).mockResolvedValue(null);
    expect((await invoke()).success).toBe(false);
    expect(service).not.toHaveBeenCalled();
  });
});

describe('cierre personal y supervisión de multicajas', () => {
  it('el cajero cierra su propia caja sin recibir permiso de supervisión', async () => {
    const result = await closeShiftAction('shift-1', { actualAmount: 10000, closingNotes: 'Cambio contado' });
    expect(result.success).toBe(true);
    expect(requireAuthWithPermission).toHaveBeenCalledWith('pos:operate');
    expect(cash.closeShift).toHaveBeenCalledWith(session.companyId, 'shift-1', {
      actualAmount: 10000, closingNotes: 'Cambio contado',
    }, session.id);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      companyId: session.companyId, userId: session.id, entityId: 'shift-1',
      metadata: expect.objectContaining({ cerradoPor: session.email, esperado: 10000, contado: 10000, descuadre: 0 }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith('/pos');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/pos');
  });

  it('el cajero no puede cerrar el turno de otra caja', async () => {
    jest.mocked(cash.getShift).mockResolvedValue(shiftFor('cashier-2'));
    expect((await closeShiftAction('shift-1', { actualAmount: 0 })).success).toBe(false);
    expect(cash.closeShift).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('el supervisor cierra otro turno con su identidad como responsable del cierre', async () => {
    permissions.add('pos:close');
    jest.mocked(cash.getShift).mockResolvedValue(shiftFor('cashier-2'));
    expect((await closeShiftAction('shift-1', { actualAmount: 10000 })).success).toBe(true);
    expect(cash.closeShift).toHaveBeenCalledWith(session.companyId, 'shift-1', { actualAmount: 10000 }, session.id);
  });

  it('rechaza un conteo negativo antes de cerrar', async () => {
    expect((await closeShiftAction('shift-1', { actualAmount: -1 })).success).toBe(false);
    expect(cash.closeShift).not.toHaveBeenCalled();
  });

  it('el historial del cajero queda limitado a sus turnos', async () => {
    expect((await listShiftsAction()).success).toBe(true);
    expect(cash.listShifts).toHaveBeenCalledWith(session.companyId, { userId: session.id });
  });

  it('el supervisor obtiene el historial de todas las cajas de su empresa', async () => {
    permissions.add('pos:close');
    expect((await listShiftsAction()).success).toBe(true);
    expect(cash.listShifts).toHaveBeenCalledWith(session.companyId, { userId: undefined });
  });

  it('sin permiso de operación no consulta turnos ni procesa el cierre', async () => {
    permissions.clear();
    expect((await closeShiftAction('shift-1', { actualAmount: 10000 })).success).toBe(false);
    expect(cash.getShift).not.toHaveBeenCalled();
    expect(cash.closeShift).not.toHaveBeenCalled();
  });
});

it('el movimiento usa al operario autenticado y conserva la clave del reintento', async () => {
  jest.mocked(cash.registerCashMovement).mockResolvedValue({ id: 'movement-1' } as Awaited<ReturnType<typeof cash.registerCashMovement>>);
  expect((await registerCashMovementAction('shift-1', {
    type: 'OUTFLOW', amount: 2000, reason: 'Retiro a caja fuerte', idempotencyKey: 'operation-1',
    companyId: 'other-company', userId: 'other-cashier',
  })).success).toBe(true);
  expect(cash.registerCashMovement).toHaveBeenCalledWith(session.companyId, 'shift-1', session.id, {
    type: 'OUTFLOW', amount: 2000, reason: 'Retiro a caja fuerte', idempotencyKey: 'operation-1',
  });
});

describe('reserva de costos en la respuesta de venta', () => {
  const sale = {
    id: 'sale-1', folio: 123, totalAmount: 1190, paymentMethod: 'EFECTIVO', changeDue: 810,
    items: [{ productId: 'product-1', quantity: 1, unitPrice: 1000, total: 1190, unitCostPMP: 550, consignorCommissionBps: 2000, consignorBaseNet: 1000 }],
  } as pos.PosSaleResult;
  const input = { items: [{ productId: 'product-1', quantity: 1 }], paymentMethod: 'EFECTIVO', cashReceived: 2000 };

  it.each([false, true])('solo muestra costos si tiene permiso (%s), manteniendo precio y vuelto', async (canReadCosts) => {
    if (canReadCosts) permissions.add('products:costs');
    jest.mocked(pos.createPosSale).mockResolvedValue(sale);
    const result = await createPosSaleAction('shift-1', input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toMatchObject({ totalAmount: 1190, changeDue: 810, items: [{ unitPrice: 1000, total: 1190, unitCostPMP: canReadCosts ? 550 : 0, consignorCommissionBps: canReadCosts ? 2000 : null, consignorBaseNet: canReadCosts ? 1000 : null }] });
    expect(pos.createPosSale).toHaveBeenCalledWith(session.companyId, session.id, 'shift-1', input);
    expect(sale.items[0]!.unitCostPMP).toBe(550);
  });
});
