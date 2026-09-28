/**
 * Multiempresa en autoservicio: invitar a alguien que ya tiene cuenta en otra
 * empresa le suma ESTA empresa como membresía (no una segunda cuenta), y solo
 * esa misma cuenta, con su sesión, puede aceptarla.
 */
import { prisma } from '@/lib/prisma';
import { acceptInvitation, acceptInvitationAsMember, inviteUser } from '@/lib/services/users.service';
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

  it('rechaza a quien ya es del equipo o ya tiene acceso, y cuentas de plataforma', async () => {
    const findUser = jest.spyOn(prisma.user, 'findFirst');
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValueOnce({ id: 'm-1' } as never);

    findUser.mockResolvedValueOnce({ ...existing, companyId: 'cliente' } as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).rejects.toThrow(/ya es parte del equipo/);

    findUser.mockResolvedValueOnce(existing as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).rejects.toThrow(/ya tiene acceso/);

    findUser.mockResolvedValueOnce({ ...existing, isSuperAdmin: true } as never);
    await expect(inviteUser('cliente', { email: existing.email, role: 'SALES' }, { multiCompany: true })).rejects.toThrow(/plataforma/);
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
    expect(tx.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1', companyId: 'cliente' } }));
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
