import { prisma } from '@/lib/prisma';

jest.mock('@/lib/auth/session', () => ({
  createSessionToken: jest.fn(async () => 'token'),
  setSessionCookie: jest.fn(),
}));
jest.mock('@/lib/auth/sessions', () => ({ recordSession: jest.fn() }));
jest.mock('@/lib/auth/accessible-companies', () => ({
  ...jest.requireActual('@/lib/auth/accessible-companies'),
  listAccessibleCompanies: jest.fn(),
}));

import { listAccessibleCompanies } from '@/lib/auth/accessible-companies';
import { issueSession } from '@/lib/auth/issue-session';

/** Al iniciar sesión, quien trabaja en varias empresas pasa primero por el selector. */

const user = { id: 'u1', role: 'OWNER', email: 'a@b.cl', companyId: 'home', isSuperAdmin: false, sessionVersion: 0 };
const req = new Request('https://aetherp.online/api/auth/signin', { method: 'POST' });
const company = (id: string, operational: boolean) => ({ id, name: id, isHome: id === 'home', status: operational ? 'ACTIVE' : 'SUSPENDED', operational });

beforeEach(() => {
  jest.spyOn(prisma.company, 'findUnique').mockResolvedValue({ businessName: 'Hogar' } as never);
});
afterEach(() => jest.restoreAllMocks());

async function redirectTo(): Promise<string> {
  const res = await issueSession(user, req);
  return ((await res.json()) as { data: { redirectTo: string } }).data.redirectTo;
}

describe('issueSession: destino tras el login', () => {
  it('con dos empresas operativas manda al selector', async () => {
    jest.mocked(listAccessibleCompanies).mockResolvedValue([company('home', true), company('filial', true)] as never);
    expect(await redirectTo()).toBe('/seleccionar-empresa');
  });

  it('con una sola empresa (o la otra suspendida) entra directo al panel', async () => {
    jest.mocked(listAccessibleCompanies).mockResolvedValue([company('home', true), company('filial', false)] as never);
    expect(await redirectTo()).toBe('/dashboard');
  });

  it('si no se puede leer la lista, entra igual a su empresa', async () => {
    jest.mocked(listAccessibleCompanies).mockRejectedValue(new Error('db caída'));
    expect(await redirectTo()).toBe('/dashboard');
  });
});
