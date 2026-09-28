/**
 * Multiempresa en autoservicio: invitar a alguien que ya tiene cuenta en otra
 * empresa le suma ESTA empresa como membresía (no una segunda cuenta), y solo
 * esa misma cuenta, con su sesión, puede aceptarla.
 */
import { prisma } from '@/lib/prisma';
import {
  acceptInvitation,
  acceptInvitationAsMember,
  changeMemberRole,
  deleteUser,
  inviteUser,
  removeMember,
  resetUserTemporaryPassword,
} from '@/lib/services/users.service';
import { countSeatsInUse } from '@/modules/roles/services/roles.service';

const futureDate = () => new Date(Date.now() + 86_400_000);

const invitationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  companyId: 'cliente',
  email: 'Contadora@Estudio.cl',
  role: 'ACCOUNTANT',
  customRoleId: null,
  token: 'tok',
  expiresAt: futureDate(),
  acceptedAt: null,
  createdAt: new Date(),
  company: { businessName: 'Cliente SpA', status: 'ACTIVE', maxUsers: 5, features: { hasMultiCompany: true } },
  ...overrides,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('inviteUser con un correo que ya tiene cuenta', () => {
  const existing = { id: 'u-9', email: 'contadora@estudio.cl', companyId: 'estudio', isSuperAdmin: false, isActive: true };

  it('sin Multiempresa, explica que hace falta el módulo', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(existing as never);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    await expect(inviteUser('cliente', { email: 'contadora@estudio.cl', role: 'ACCOUNTANT' }, { multiCompany: false })).rejects.toThrow(
      /módulo Multiempresa/
    );
  });

  it('con Multiempresa, crea la invitación marcada como cuenta existente', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(existing as never);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    const upsert = jest.spyOn(prisma.invitation, 'upsert').mockResolvedValue(invitationRow() as never);
    const result = await inviteUser('cliente', { email: 'contadora@estudio.cl', role: 'ACCOUNTANT' }, { multiCompany: true });
    expect(result.existingAccount).toBe(true);
    expect(upsert).toHaveBeenCalled();
  });

  it('rechaza a quien ya es del equipo o ya tiene acceso', async () => {
    const findUser = jest.spyOn(prisma.user, 'findFirst');
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValueOnce({ id: 'm-1' } as never);

    findUser.mockResolvedValueOnce({ ...existing, companyId: 'cliente' } as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).rejects.toThrow(/ya es parte del equipo/);

    findUser.mockResolvedValueOnce(existing as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).rejects.toThrow(/ya tiene acceso/);
  });

  it('una cuenta de plataforma no se distingue al invitar (no se puede enumerar); se rechaza al aceptar', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(existing as never);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.invitation, 'upsert').mockResolvedValue(invitationRow() as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).resolves.toMatchObject({ existingAccount: true });

    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'root', email: 'contadora@estudio.cl', companyId: 'plataforma', isSuperAdmin: true } as never);
    await expect(acceptInvitationAsMember('tok', 'root')).rejects.toThrow(/plataforma/);
  });

  it('la invitación de cuenta nueva no puede crear una segunda cuenta con ese correo', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(existing as never);
    await expect(acceptInvitation('tok', { name: 'X', password: 'Clave-segura-123' })).rejects.toThrow(/inicia sesión/);
  });
});

describe('acceptInvitationAsMember', () => {
  function mockTransaction(seatsUsed: { users: number; members: number }) {
    const tx = {
      user: { count: jest.fn().mockResolvedValue(seatsUsed.users) },
      companyMembership: { count: jest.fn().mockResolvedValue(seatsUsed.members), upsert: jest.fn().mockResolvedValue({}) },
      customRole: { findFirst: jest.fn().mockResolvedValue(null) },
      invitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as never);
    return tx;
  }

  it('suma la empresa a la cuenta de la sesión, aunque el correo difiera en mayúsculas', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-9', email: 'contadora@estudio.cl', companyId: 'estudio', isSuperAdmin: false } as never);
    const tx = mockTransaction({ users: 2, members: 1 });

    await expect(acceptInvitationAsMember('tok', 'u-9')).resolves.toMatchObject({ companyId: 'cliente', role: 'ACCOUNTANT' });
    expect(tx.companyMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u-9', companyId: 'cliente', role: 'ACCOUNTANT', customRoleId: null } })
    );
    expect(tx.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1', companyId: 'cliente', acceptedAt: null } }));
  });

  it('una sesión de otra cuenta no puede aceptarla', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-7', email: 'otra@persona.cl', companyId: 'x', isSuperAdmin: false } as never);
    await expect(acceptInvitationAsMember('tok', 'u-7')).rejects.toThrow(/Entra con esa cuenta/);
  });

  it('si la empresa apagó Multiempresa, no se acepta', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(
      invitationRow({ company: { businessName: 'Cliente SpA', status: 'ACTIVE', maxUsers: 5, features: { hasMultiCompany: false } } }) as never
    );
    await expect(acceptInvitationAsMember('tok', 'u-9')).rejects.toThrow(/Multiempresa/);
  });

  it('las membresías ocupan cupo del plan', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-9', email: 'contadora@estudio.cl', companyId: 'estudio', isSuperAdmin: false } as never);
    const tx = mockTransaction({ users: 3, members: 2 });
    await expect(acceptInvitationAsMember('tok', 'u-9')).rejects.toThrow(/máximo de 5 usuarios/);
    expect(tx.companyMembership.upsert).not.toHaveBeenCalled();
  });
});

describe('countSeatsInUse', () => {
  it('suma equipo activo, membresías e invitaciones vigentes', async () => {
    jest.spyOn(prisma.user, 'count').mockResolvedValue(3);
    jest.spyOn(prisma.companyMembership, 'count').mockResolvedValue(2);
    jest.spyOn(prisma.invitation, 'count').mockResolvedValue(1);
    await expect(countSeatsInUse('cliente')).resolves.toBe(6);
  });
});

describe('gestión de miembros de otras empresas', () => {
  const member = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    userId: 'u-9',
    role: 'ACCOUNTANT',
    user: { isSuperAdmin: false, isActive: true },
    ...overrides,
  });

  it('nadie cambia su propio acceso, y solo un Dueño administra a otro Dueño', async () => {
    const find = jest.spyOn(prisma.companyMembership, 'findFirst');
    find.mockResolvedValueOnce(member({ userId: 'yo' }) as never);
    await expect(changeMemberRole('cliente', 'yo', 'm-1', 'SALES', 'OWNER')).rejects.toThrow(/tu propio acceso/);

    find.mockResolvedValueOnce(member({ role: 'OWNER' }) as never);
    await expect(changeMemberRole('cliente', 'admin', 'm-1', 'SALES', 'ADMIN')).rejects.toThrow(/Solo un Dueño/);
  });

  it('no deja a la empresa sin Dueño activo al bajar de rol a un Dueño por membresía', async () => {
    jest.spyOn(prisma.companyMembership, 'findFirst').mockResolvedValue(member({ role: 'OWNER' }) as never);
    jest.spyOn(prisma.user, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.companyMembership, 'count').mockResolvedValue(1);
    jest.spyOn(prisma.companyFeatures, 'findUnique').mockResolvedValue({ hasMultiCompany: true } as never);
    const update = jest.spyOn(prisma.companyMembership, 'updateMany');
    await expect(changeMemberRole('cliente', 'otro-dueno', 'm-1', 'ADMIN', 'OWNER')).rejects.toThrow(/al menos un Dueño/);
    expect(update).not.toHaveBeenCalled();
  });

  it('cambiar el rol base reemplaza el rol personalizado, filtrando por empresa', async () => {
    jest.spyOn(prisma.companyMembership, 'findFirst').mockResolvedValue(member() as never);
    const update = jest.spyOn(prisma.companyMembership, 'updateMany').mockResolvedValue({ count: 1 });
    await changeMemberRole('cliente', 'admin', 'm-1', 'SALES', 'ADMIN');
    expect(update).toHaveBeenCalledWith({ where: { id: 'm-1', companyId: 'cliente' }, data: { role: 'SALES', customRoleId: null } });
  });

  it('quitar el acceso borra la membresía y cierra sus sesiones, avisos y conectores de ESTA empresa', async () => {
    jest.spyOn(prisma.companyMembership, 'findFirst').mockResolvedValue(member() as never);
    const deleteMembership = jest.spyOn(prisma.companyMembership, 'deleteMany').mockReturnValue('borrar' as never);
    const revoke = jest.spyOn(prisma.userSession, 'updateMany').mockReturnValue('revocar' as never);
    const push = jest.spyOn(prisma.pushSubscription, 'deleteMany').mockReturnValue('push' as never);
    const mcp = jest.spyOn(prisma.mcpPersonalToken, 'updateMany').mockReturnValue('mcp' as never);
    const transaction = jest.spyOn(prisma, '$transaction').mockResolvedValue([] as never);

    await expect(removeMember('cliente', 'admin', 'm-1', 'ADMIN')).resolves.toEqual({ userId: 'u-9' });
    expect(deleteMembership).toHaveBeenCalledWith({ where: { id: 'm-1', companyId: 'cliente' } });
    expect(revoke).toHaveBeenCalledWith({ where: { userId: 'u-9', companyId: 'cliente', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(push).toHaveBeenCalledWith({ where: { userId: 'u-9', companyId: 'cliente' } });
    expect(mcp).toHaveBeenCalledWith({ where: { userId: 'u-9', companyId: 'cliente', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(transaction).toHaveBeenCalledWith(['borrar', 'revocar', 'push', 'mcp']);
  });

  it('se puede eliminar a un Dueño suspendido si queda otro Dueño activo', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-2', role: 'OWNER', isActive: false, isSuperAdmin: false } as never);
    jest.spyOn(prisma.user, 'count').mockImplementation((async (args: { where: Record<string, unknown> }) =>
      (args.where.role === 'OWNER' ? 1 : 0)) as never);
    jest.spyOn(prisma.companyMembership, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.companyFeatures, 'findUnique').mockResolvedValue(null);
    const remove = jest.spyOn(prisma.user, 'deleteMany').mockResolvedValue({ count: 1 });
    await expect(deleteUser('cliente', 'u-1', 'u-2', 'OWNER')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalled();
  });
});

describe('cuentas que trabajan en varias empresas', () => {
  it('un admin de la empresa hogar no puede darle una contraseña temporal (entraría a las otras empresas)', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-9', role: 'SALES', isSuperAdmin: false, customRole: null } as never);
    jest.spyOn(prisma.companyMembership, 'count').mockResolvedValue(1);
    const update = jest.spyOn(prisma.user, 'updateMany');
    await expect(resetUserTemporaryPassword('estudio', 'admin', 'u-9', 'ADMIN')).rejects.toThrow(/Olvidaste tu contraseña/);
    expect(update).not.toHaveBeenCalled();
  });

  it('un Dueño por membresía no cuenta si la empresa ya no tiene Multiempresa (no podría entrar)', async () => {
    jest.spyOn(prisma.companyMembership, 'findFirst').mockResolvedValue({
      id: 'm-2', userId: 'u-3', role: 'OWNER', user: { isSuperAdmin: false, isActive: true },
    } as never);
    jest.spyOn(prisma.user, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.companyMembership, 'count').mockResolvedValue(2);
    jest.spyOn(prisma.companyFeatures, 'findUnique').mockResolvedValue({ hasMultiCompany: false } as never);
    await expect(removeMember('cliente', 'otro', 'm-2', 'OWNER')).rejects.toThrow(/al menos un Dueño/);
  });

  it('la invitación no se puede usar dos veces aunque dos aceptaciones corran a la vez', async () => {
    jest.spyOn(prisma.invitation, 'findUnique').mockResolvedValue(invitationRow() as never);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u-9', email: 'contadora@estudio.cl', companyId: 'estudio', isSuperAdmin: false } as never);
    const tx = {
      user: { count: jest.fn().mockResolvedValue(0) },
      companyMembership: { count: jest.fn().mockResolvedValue(0), upsert: jest.fn().mockResolvedValue({}) },
      customRole: { findFirst: jest.fn() },
      invitation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as never);
    await expect(acceptInvitationAsMember('tok', 'u-9')).rejects.toThrow(/ya fue utilizada/);
    expect(tx.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1', companyId: 'cliente', acceptedAt: null } }));
  });
});
