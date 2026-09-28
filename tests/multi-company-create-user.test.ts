/**
 * "Crear cuenta directamente" con un correo que ya tiene cuenta en otra
 * empresa: nunca una segunda cuenta ni un cambio de contraseña. Si quien la
 * crea ya administra a esa persona en otra empresa, se le suma esta al
 * instante; si no, corresponde invitarla (decide ella).
 */
import { prisma } from '@/lib/prisma';
import { createUserDirect, managesPersonElsewhere, MULTI_COMPANY_REQUIRED_MESSAGE } from '@/lib/services/users.service';

type FindFirstArgs = { where: { id?: string; email?: unknown } };

const existing = { id: 'persona', email: 'Juan@Grupo.cl', name: 'Juan Pérez', companyId: 'empresa-a', isActive: true, isSuperAdmin: false };
const input = { email: 'juan@grupo.cl', name: 'Juan', role: 'SALES' as const };

/** Dueño de la empresa A (hogar) que ahora trabaja en la B. */
const ownerOfA = { companyId: 'empresa-a', role: 'OWNER', customRole: null, companyMemberships: [] };
const personInA = { companyId: 'empresa-a', companyMemberships: [] };
const activeCompany = (id: string, features: Record<string, boolean> = { hasMultiCompany: true }) => ({ id, status: 'ACTIVE', features });

function mockUsers(users: { byEmail?: unknown; actor?: unknown; person?: unknown }) {
  return jest.spyOn(prisma.user, 'findFirst').mockImplementation(((args: FindFirstArgs) => {
    if (args.where.email !== undefined) return Promise.resolve(users.byEmail ?? null);
    if (args.where.id === 'actor') return Promise.resolve(users.actor ?? null);
    if (args.where.id === 'persona') return Promise.resolve(users.person ?? null);
    return Promise.resolve(null);
  }) as never);
}

function mockTransaction(options: { seatsUsed?: number; maxUsers?: number } = {}) {
  const tx = {
    company: { findUnique: jest.fn().mockResolvedValue({ maxUsers: options.maxUsers ?? 10 }) },
    user: { count: jest.fn().mockResolvedValue(options.seatsUsed ?? 1) },
    companyMembership: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'm-nueva' }) },
    customRole: { findFirst: jest.fn().mockResolvedValue(null) },
    invitation: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as never);
  return tx;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createUserDirect con un correo que ya tiene cuenta', () => {
  it('busca el correo sin distinguir mayúsculas y nunca crea una segunda cuenta', async () => {
    const find = mockUsers({ byEmail: existing, actor: ownerOfA, person: personInA });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.company, 'findMany').mockResolvedValue([activeCompany('empresa-a')] as never);
    mockTransaction();
    const create = jest.spyOn(prisma.user, 'create');

    await createUserDirect('empresa-b', 'actor', input, { multiCompany: true });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'juan@grupo.cl', mode: 'insensitive' } } }));
    expect(create).not.toHaveBeenCalled();
  });

  it('si quien la crea la administra en otra empresa, le suma esta al instante con el rol elegido', async () => {
    mockUsers({ byEmail: existing, actor: ownerOfA, person: personInA });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.company, 'findMany').mockResolvedValue([activeCompany('empresa-a')] as never);
    const tx = mockTransaction();

    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).resolves.toEqual({
      kind: 'member-added',
      membershipId: 'm-nueva',
      email: existing.email,
      name: existing.name,
    });
    expect(tx.companyMembership.create).toHaveBeenCalledWith({
      data: { userId: 'persona', companyId: 'empresa-b', role: 'SALES', customRoleId: null },
      select: { id: true },
    });
    // La invitación pendiente a ese correo (si había) ya no ocupa cupo.
    expect(tx.invitation.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 'empresa-b', acceptedAt: null, email: { equals: existing.email, mode: 'insensitive' } },
    });
  });

  it('si no la administra en ninguna otra empresa, hay que invitarla', async () => {
    mockUsers({ byEmail: existing, actor: { ...ownerOfA, companyId: 'empresa-z' }, person: personInA });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    const transaction = jest.spyOn(prisma, '$transaction');

    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).resolves.toEqual({ kind: 'needs-invitation' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('una cuenta de plataforma o suspendida se trata como desconocida: invitación, nunca acceso directo', async () => {
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.company, 'findMany').mockResolvedValue([activeCompany('empresa-a')] as never);
    const transaction = jest.spyOn(prisma, '$transaction');

    mockUsers({ byEmail: { ...existing, isSuperAdmin: true }, actor: ownerOfA, person: personInA });
    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).resolves.toEqual({ kind: 'needs-invitation' });

    mockUsers({ byEmail: { ...existing, isActive: false }, actor: ownerOfA, person: personInA });
    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).resolves.toEqual({ kind: 'needs-invitation' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('sin Multiempresa explica qué falta', async () => {
    mockUsers({ byEmail: existing });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: false })).rejects.toThrow(MULTI_COMPANY_REQUIRED_MESSAGE);
  });

  it('rechaza a quien ya es del equipo o ya tiene acceso', async () => {
    mockUsers({ byEmail: { ...existing, companyId: 'empresa-b' } });
    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).rejects.toThrow(/ya es parte del equipo/);

    mockUsers({ byEmail: existing });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue({ id: 'm-1' } as never);
    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).rejects.toThrow(/ya tiene acceso/);
  });

  it('respeta el cupo del plan', async () => {
    mockUsers({ byEmail: existing, actor: ownerOfA, person: personInA });
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.company, 'findMany').mockResolvedValue([activeCompany('empresa-a')] as never);
    const tx = mockTransaction({ seatsUsed: 3, maxUsers: 3 });

    await expect(createUserDirect('empresa-b', 'actor', input, { multiCompany: true })).rejects.toThrow(/permite 3 usuarios/);
    expect(tx.companyMembership.create).not.toHaveBeenCalled();
  });
});

describe('managesPersonElsewhere', () => {
  function setup(actor: unknown, person: unknown, companies: unknown[]) {
    mockUsers({ actor, person });
    jest.spyOn(prisma.company, 'findMany').mockResolvedValue(companies as never);
  }

  it('administrador base en la empresa hogar de la persona: sí', async () => {
    setup({ ...ownerOfA, role: 'ADMIN' }, personInA, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(true);
  });

  it('vendedor en esa empresa: no (no administra al equipo)', async () => {
    setup({ ...ownerOfA, role: 'SALES' }, personInA, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(false);
  });

  it('el rol personalizado manda: con settings:users sí, sin él no', async () => {
    setup({ ...ownerOfA, role: 'SALES', customRole: { permissions: ['settings:users'] } }, personInA, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(true);

    setup({ ...ownerOfA, role: 'ADMIN', customRole: { permissions: ['sales:read'] } }, personInA, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(false);
  });

  it('por membresía cuenta solo si esa empresa tiene Multiempresa', async () => {
    const actor = { companyId: 'empresa-z', role: 'SALES', customRole: null, companyMemberships: [{ companyId: 'empresa-a', role: 'OWNER', customRole: null }] };
    setup(actor, personInA, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(true);

    setup(actor, personInA, [activeCompany('empresa-a', { hasMultiCompany: false })]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(false);
  });

  it('una empresa suspendida no cuenta', async () => {
    setup(ownerOfA, personInA, [{ ...activeCompany('empresa-a'), status: 'SUSPENDED' }]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(false);
  });

  it('la persona trabaja en la empresa del actor por membresía: también cuenta', async () => {
    setup(ownerOfA, { companyId: 'empresa-z', companyMemberships: [{ companyId: 'empresa-a' }] }, [activeCompany('empresa-a')]);
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(true);
  });

  it('compartir solo la empresa donde se la quiere sumar no cuenta', async () => {
    const find = jest.spyOn(prisma.company, 'findMany');
    mockUsers({ actor: { ...ownerOfA, companyId: 'empresa-b' }, person: { companyId: 'empresa-z', companyMemberships: [{ companyId: 'empresa-b' }] } });
    await expect(managesPersonElsewhere('actor', 'persona', 'empresa-b')).resolves.toBe(false);
    expect(find).not.toHaveBeenCalled();
  });
});
