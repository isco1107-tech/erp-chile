import { createAuditLog } from '@/lib/auth/audit';
import * as cash from '@/modules/pos/services/cash.service';
import * as pos from '@/modules/pos/services/pos.service';
import { lookupPosCustomerAction, registerDrawerOpenAction } from '@/modules/pos/actions/pos.actions';
import { drawerOpenSchema } from '@/modules/pos/schema';

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
jest.mock('@/modules/pos/services/cash.service', () => ({ getOpenShiftForUser: jest.fn() }));
jest.mock('@/modules/pos/services/pos.service', () => ({ findCustomerNameByRut: jest.fn() }));

const openShift = { id: 'shift-1', userId: session.id, status: 'OPEN', cashRegister: { id: 'r1', name: 'Caja 1' } } as unknown as Awaited<ReturnType<typeof cash.getOpenShiftForUser>>;

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  permissions.add('pos:operate');
  jest.mocked(cash.getOpenShiftForUser).mockResolvedValue(openShift);
  jest.mocked(pos.findCustomerNameByRut).mockResolvedValue('Ana Soto');
});

describe('buscar cliente por RUT en el mostrador', () => {
  it('busca dentro de la empresa autenticada y devuelve solo el nombre', async () => {
    const result = await lookupPosCustomerAction('12.345.678-5');
    expect(result).toEqual({ success: true, data: { name: 'Ana Soto' } });
    expect(pos.findCustomerNameByRut).toHaveBeenCalledWith('company-1', '12.345.678-5');
  });

  it('sin permiso de caja no consulta nada', async () => {
    permissions.clear();
    const result = await lookupPosCustomerAction('12.345.678-5');
    expect(result.success).toBe(false);
    expect(pos.findCustomerNameByRut).not.toHaveBeenCalled();
  });

  it.each([42, null, undefined, { rut: 'x' }, 'x'.repeat(21)])('rechaza una entrada que no es un RUT razonable (%p)', async (value) => {
    const result = await lookupPosCustomerAction(value);
    expect(result).toEqual({ success: false, error: 'RUT inválido' });
    expect(pos.findCustomerNameByRut).not.toHaveBeenCalled();
  });
});

describe('abrir el cajón sin una venta', () => {
  it('exige un motivo', () => {
    expect(drawerOpenSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(drawerOpenSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(drawerOpenSchema.safeParse({ reason: 'x'.repeat(121) }).success).toBe(false);
    expect(drawerOpenSchema.safeParse({ reason: '  Dar cambio ' })).toMatchObject({ success: true, data: { reason: 'Dar cambio' } });
  });

  it('deja constancia en la bitácora con la caja y el cajero', async () => {
    const result = await registerDrawerOpenAction('shift-1', { reason: 'Dar cambio' });
    expect(result.success).toBe(true);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1', userId: 'cashier-1', entity: 'CashShift', entityId: 'shift-1', action: 'UPDATE',
      metadata: { evento: 'APERTURA_CAJON_SIN_VENTA', motivo: 'Dar cambio', caja: 'Caja 1' },
    }));
  });

  it('sin motivo no registra ni autoriza', async () => {
    const result = await registerDrawerOpenAction('shift-1', { reason: '' });
    expect(result.success).toBe(false);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('solo desde el propio turno abierto: ni turno ajeno ni sin turno', async () => {
    const other = await registerDrawerOpenAction('shift-OTRO', { reason: 'Dar cambio' });
    expect(other).toEqual({ success: false, error: 'Solo puedes abrir el cajón desde tu turno de caja abierto' });
    jest.mocked(cash.getOpenShiftForUser).mockResolvedValue(null);
    const none = await registerDrawerOpenAction('shift-1', { reason: 'Dar cambio' });
    expect(none.success).toBe(false);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('busca el turno del usuario autenticado en su empresa, no el que diga el navegador', async () => {
    await registerDrawerOpenAction('shift-1', { reason: 'Dar cambio' });
    expect(cash.getOpenShiftForUser).toHaveBeenCalledWith('company-1', 'cashier-1');
  });

  it('sin permiso de caja no registra', async () => {
    permissions.clear();
    const result = await registerDrawerOpenAction('shift-1', { reason: 'Dar cambio' });
    expect(result.success).toBe(false);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 42, ''])('rechaza un id de turno inválido (%p)', async (shiftId) => {
    const result = await registerDrawerOpenAction(shiftId, { reason: 'Dar cambio' });
    expect(result.success).toBe(false);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
