/**
 * Modo contingencia (src/modules/offline): cada operación hecha sin conexión
 * se aplica UNA sola vez (claim -> Server Action de siempre -> complete/fail),
 * nunca en otra empresa y nunca fuera de la ventana de tiempo.
 */
jest.mock('@/lib/prisma', () => ({ prisma: { offlineOperation: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() } } }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ requireAuthWithPermission: jest.fn(), authErrorMessage: jest.fn(() => null) }));
jest.mock('@/modules/pos/actions/pos.actions', () => ({ createPosSaleAction: jest.fn() }));
jest.mock('@/modules/inventory/actions/inventory.actions', () => ({ registerStockMovementAction: jest.fn() }));
jest.mock('@/modules/purchases/actions/purchases.actions', () => ({ createPurchaseDocumentAction: jest.fn() }));
jest.mock('@/modules/purchases/actions/goods-receipt.actions', () => ({ createGoodsReceiptAction: jest.fn() }));
jest.mock('@/lib/prisma-errors', () => ({ isUniqueConstraintError: (e: unknown) => (e as { code?: string })?.code === 'P2002' }));

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { createPosSaleAction } from '@/modules/pos/actions/pos.actions';
import { registerStockMovementAction } from '@/modules/inventory/actions/inventory.actions';
import { createGoodsReceiptAction } from '@/modules/purchases/actions/goods-receipt.actions';
import { capturedAtProblem } from '@/modules/offline/schema';
import { claimOfflineOperation } from '@/modules/offline/services/offline-operations.service';
import { syncOfflineOperationAction } from '@/modules/offline/actions/offline.actions';

const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
const claimInput = { idempotencyKey: 'key-1', kind: 'POS_SALE' as const, capturedAt: new Date() };
const op = mockOperation();

function mockOperation() {
  return {
    create: prisma.offlineOperation.create as jest.Mock,
    findFirst: prisma.offlineOperation.findFirst as jest.Mock,
    updateMany: prisma.offlineOperation.updateMany as jest.Mock,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('capturedAtProblem', () => {
  const now = new Date();

  it('acepta una hora de captura normal', () => {
    expect(capturedAtProblem(now, now)).toBeNull();
  });

  it('rechaza un reloj adelantado', () => {
    expect(capturedAtProblem(new Date(now.getTime() + 10 * 60 * 1000), now)).toContain('adelantada');
  });

  it('rechaza lo capturado hace más de 24 horas', () => {
    expect(capturedAtProblem(new Date(now.getTime() - 25 * 60 * 60 * 1000), now)).toContain('24 horas');
  });

  it('rechaza una fecha inválida', () => {
    expect(capturedAtProblem(new Date('x'))).toContain('inválida');
  });
});

describe('claimOfflineOperation', () => {
  it('una operación nueva queda tomada', async () => {
    op.create.mockResolvedValue({ id: 'op-1' });
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).resolves.toEqual({ state: 'claimed', operationId: 'op-1' });
  });

  it('una operación ya aplicada devuelve su resultado sin volver a ejecutarse', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'DONE', resultRef: 'doc-1' });
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).resolves.toEqual({ state: 'done', resultRef: 'doc-1' });
  });

  it('una rechazada sin reintento explícito devuelve el motivo guardado', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'FAILED', error: 'Error guardado' });
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).resolves.toEqual({ state: 'failed', error: 'Error guardado' });
  });

  it('el reintento de una rechazada la toma de forma atómica', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'FAILED', error: 'x' });
    op.updateMany.mockResolvedValue({ count: 1 });
    await expect(claimOfflineOperation('c1', 'u1', { ...claimInput, retry: true })).resolves.toEqual({ state: 'claimed', operationId: 'op-1' });
    expect(op.updateMany).toHaveBeenCalledWith({
      where: { id: 'op-1', companyId: 'c1', status: 'FAILED' },
      data: expect.objectContaining({ status: 'PROCESSING', error: null }),
    });
  });

  it('dos reintentos simultáneos: el que llega segundo no la ejecuta', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'FAILED', error: 'x' });
    op.updateMany.mockResolvedValue({ count: 0 });
    await expect(claimOfflineOperation('c1', 'u1', { ...claimInput, retry: true })).resolves.toEqual({ state: 'processing' });
  });

  it('una que quedó a medias no se reejecuta sola', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'PROCESSING' });
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).resolves.toEqual({ state: 'processing' });
  });

  it('la misma clave para otro tipo de operación se rechaza', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'STOCK_MOVEMENT', status: 'DONE' });
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).resolves.toEqual({
      state: 'failed',
      error: 'Clave de operación repetida para otra operación',
    });
  });

  it('un error de base que no es de unicidad se relanza', async () => {
    op.create.mockRejectedValue(new Error('Error de conexión BD'));
    await expect(claimOfflineOperation('c1', 'u1', claimInput)).rejects.toThrow('Error de conexión BD');
  });
});

describe('syncOfflineOperationAction', () => {
  const base = { companyId: 'c1', idempotencyKey: 'clave-offline-123', capturedAt: new Date().toISOString() };

  beforeEach(() => {
    (requireAuthWithPermission as jest.Mock).mockResolvedValue({ id: 'u1', companyId: 'c1' });
  });

  it('nunca aplica una operación en otra empresa', async () => {
    const result = await syncOfflineOperationAction({ ...base, companyId: 'otra', kind: 'POS_SALE', shiftId: 'turno-1', payload: {} });
    expect(result).toEqual({ success: false, error: expect.stringContaining('otra empresa') });
    expect(op.create).not.toHaveBeenCalled();
  });

  it('venta del POS: se crea con la clave de la operación y queda aplicada', async () => {
    op.create.mockResolvedValue({ id: 'op-1' });
    (createPosSaleAction as jest.Mock).mockResolvedValue({ success: true, data: { id: 'venta-1', folio: 77 } });

    const result = await syncOfflineOperationAction({ ...base, kind: 'POS_SALE', shiftId: 'turno-1', payload: { items: [], idempotencyKey: 'otra-clave' } });

    expect(result).toEqual({ success: true, data: { status: 'DONE', resultRef: 'venta-1', folio: 77, error: null } });
    expect(createPosSaleAction).toHaveBeenCalledWith('turno-1', expect.objectContaining({ idempotencyKey: 'clave-offline-123' }));
    expect(op.updateMany).toHaveBeenCalledWith({
      where: { id: 'op-1', companyId: 'c1', status: 'PROCESSING' },
      data: expect.objectContaining({ status: 'DONE', resultRef: 'venta-1', error: null }),
    });
  });

  it('un movimiento rechazado queda FAILED con el motivo, y lleva la marca de sin conexión', async () => {
    op.create.mockResolvedValue({ id: 'op-1' });
    (registerStockMovementAction as jest.Mock).mockResolvedValue({ success: false, error: 'Stock insuficiente' });

    const result = await syncOfflineOperationAction({ ...base, kind: 'STOCK_MOVEMENT', payload: { productId: 'p1', notes: 'Ajuste inicial' } });

    expect(result).toEqual({ success: true, data: { status: 'FAILED', resultRef: null, folio: null, error: 'Stock insuficiente' } });
    expect(registerStockMovementAction).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.stringContaining('[Registrado sin conexión el') }));
  });

  it('si la acción revienta, queda FAILED y se reporta', async () => {
    op.create.mockResolvedValue({ id: 'op-1' });
    const boom = new Error('Fallo crítico');
    (createPosSaleAction as jest.Mock).mockRejectedValue(boom);

    const result = await syncOfflineOperationAction({ ...base, kind: 'POS_SALE', shiftId: 'turno-1', payload: {} });

    expect(result).toEqual({
      success: true,
      data: { status: 'FAILED', resultRef: null, folio: null, error: 'No se pudo aplicar la operación. Revisa los datos y reintenta' },
    });
    expect(captureException).toHaveBeenCalledWith(boom, expect.objectContaining({ module: 'offline', companyId: 'c1' }));
  });

  it('una operación ya aplicada no se vuelve a ejecutar', async () => {
    op.create.mockRejectedValue(p2002);
    op.findFirst.mockResolvedValue({ id: 'op-1', kind: 'POS_SALE', status: 'DONE', resultRef: 'venta-previa' });

    const result = await syncOfflineOperationAction({ ...base, kind: 'POS_SALE', shiftId: 'turno-1', payload: {} });

    expect(result).toEqual({ success: true, data: { status: 'DONE', resultRef: 'venta-previa', folio: null, error: null } });
    expect(createPosSaleAction).not.toHaveBeenCalled();
  });

  it('exige el permiso de cada tipo de operación', async () => {
    op.create.mockResolvedValue({ id: 'op-1' });
    (createGoodsReceiptAction as jest.Mock).mockResolvedValue({ success: true, data: { id: 'gr-1' } });
    await syncOfflineOperationAction({ ...base, kind: 'GOODS_RECEIPT', payload: { orderId: 'po-1' } });
    expect(requireAuthWithPermission).toHaveBeenCalledWith('purchases:orders');
  });

  it('rechaza datos inválidos sin tocar la base', async () => {
    const result = await syncOfflineOperationAction({ ...base });
    expect(result).toEqual({ success: false, error: 'Operación sin conexión con datos inválidos' });
    expect(op.create).not.toHaveBeenCalled();
  });
});
