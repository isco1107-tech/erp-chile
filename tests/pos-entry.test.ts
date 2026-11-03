import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { proxy } from '@/proxy';
import { ERP_ENTRY_COOKIE, entryDestination, posEntry } from '@/lib/auth/entry-preference';
import { issueSession } from '@/lib/auth/issue-session';
import { listAccessibleCompanies } from '@/lib/auth/accessible-companies';
import { clearSessionCookie, createSessionToken, setSessionCookieServer } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { company: { findUnique: jest.fn() } } }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/sessions', () => ({ recordSession: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ ...jest.requireActual('@/lib/auth/session'), createSessionToken: jest.fn() }));
jest.mock('@/lib/auth/accessible-companies', () => ({
  ...jest.requireActual('@/lib/auth/accessible-companies'), listAccessibleCompanies: jest.fn(),
}));

const originalSecret = process.env.JWT_SECRET;
const user = { id: 'cashier-1', role: 'SALES', email: 'cajera@example.cl', companyId: 'company-1', sessionVersion: 0 };
const company = (id: string) => ({ id, name: id, isHome: id === user.companyId, status: 'ACTIVE' as const, operational: true });

beforeEach(() => {
  jest.resetAllMocks();
  process.env.JWT_SECRET = 'pos-entry-test-signing-key';
  jest.mocked(createSessionToken).mockResolvedValue('new-token');
  jest.mocked(prisma.company.findUnique).mockResolvedValue({ businessName: 'Local', features: { hasInventory: true } } as never);
  jest.mocked(listAccessibleCompanies).mockResolvedValue([company(user.companyId)]);
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function request(path = '/pos', cookie?: string) {
  return new NextRequest(`https://aether.example${path}`, { headers: cookie ? { cookie } : undefined });
}

describe('destinos y preferencia de acceso al POS', () => {
  it.each([
    ['pos', '/pos'], ['bodega', '/bodega'], ['erp', '/dashboard'],
    [undefined, '/dashboard'], ['https://evil.example', '/dashboard'], ['/pos', '/dashboard'], ['pos-evil', '/dashboard'],
  ])('solo acepta destinos de la lista cerrada (%s)', (preference, destination) => {
    expect(entryDestination(preference)).toBe(destination);
  });

  it.each([
    ['aether-entry=pos', true], ['session=x; aether-entry=pos; other=y', true],
    [null, false], ['other=aether-entry=pos', false], ['aether-entry=pos-evil', false], ['aether-entry=%2Fpos', false],
  ])('interpreta la cookie completa sin aceptar coincidencias parciales (%s)', (header, expected) => {
    expect(posEntry(header)).toBe(expected);
  });
});

describe('ingreso dedicado del POS', () => {
  it('el formulario es público y recuerda el POS sin conceder sesión', async () => {
    const response = await proxy(request('/pos/ingresar'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.cookies.get(ERP_ENTRY_COOKIE)).toMatchObject({ value: 'pos', httpOnly: true, path: '/', sameSite: 'lax' });
    expect(response.cookies.get('session')).toBeUndefined();
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it.each(['/pos', '/pos/turnos'])('sin sesión manda %s al ingreso del POS con callback local', async (path) => {
    const response = await proxy(request(path, 'aether-entry=pos'));
    const destination = new URL(response.headers.get('location')!);
    expect(destination.origin).toBe('https://aether.example');
    expect(destination.pathname).toBe('/pos/ingresar');
    expect(destination.searchParams.get('callbackUrl')).toBe(path);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('una sesión vencida elimina el token y vuelve al ingreso del POS', async () => {
    jest.mocked(jwtVerify).mockRejectedValue(new Error('expired'));
    const response = await proxy(request('/pos', 'session=expired; aether-entry=pos'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pos/ingresar');
    expect(response.cookies.get('session')?.value).toBe('');
  });

  it('un challenge de 2FA no autoriza el terminal', async () => {
    jest.mocked(jwtVerify).mockResolvedValue({ payload: { purpose: 'totp-challenge' }, protectedHeader: { alg: 'HS256' } });
    const response = await proxy(request('/pos', 'session=challenge'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pos/ingresar');
    expect(response.cookies.get('session')?.value).toBe('');
  });

  it('con sesión firmada deja pasar al terminal', async () => {
    jest.mocked(jwtVerify).mockResolvedValue({ payload: { purpose: 'session' }, protectedHeader: { alg: 'HS256' } });
    const response = await proxy(request('/pos', 'session=valid'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it('el enlace de login con callback POS abre su ingreso dedicado', async () => {
    const response = await proxy(request('/login?callbackUrl=%2Fpos'));
    expect(response.headers.get('location')).toBe('https://aether.example/pos/ingresar');
  });

  it('la preferencia POS nunca autoriza el dashboard', async () => {
    const response = await proxy(request('/dashboard', 'aether-entry=pos'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });
});

describe('sesión de cajero conserva el terminal elegido', () => {
  const signInRequest = () => new Request('https://aether.example/api/auth/signin', {
    method: 'POST', headers: { cookie: 'aether-entry=pos', 'user-agent': 'AetherPOS/0.1.2' },
  });

  it('tras autenticarse entra directo al POS y mantiene una cookie de sesión separada', async () => {
    const response = await issueSession(user, signInRequest());
    expect((await response.json()).data.redirectTo).toBe('/pos');
    expect(response.cookies.get(ERP_ENTRY_COOKIE)?.value).toBe('pos');
    expect(response.cookies.get('session')).toMatchObject({ value: 'new-token', httpOnly: true, path: '/' });
  });

  it('cuando tiene varias empresas selecciona antes de abrir la caja y conserva POS', async () => {
    jest.mocked(listAccessibleCompanies).mockResolvedValue([company(user.companyId), company('company-2')]);
    const response = await issueSession(user, signInRequest());
    expect((await response.json()).data.redirectTo).toBe('/seleccionar-empresa');
    expect(response.cookies.get(ERP_ENTRY_COOKIE)?.value).toBe('pos');
  });

  it('rotar la sesión al cambiar contraseña o empresa conserva la preferencia POS', async () => {
    const set = jest.fn();
    jest.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'pos' }), set } as never);
    await setSessionCookieServer('rotated-token');
    expect(set).toHaveBeenCalledWith(ERP_ENTRY_COOKIE, 'pos', expect.objectContaining({ httpOnly: true, path: '/' }));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: 'session', value: 'rotated-token' }));
  });

  it('cerrar sesión elimina la autorización y conserva el ingreso POS para el próximo cajero', () => {
    const response = NextResponse.json({ success: true });
    response.cookies.set(ERP_ENTRY_COOKIE, 'pos');
    clearSessionCookie(response);
    expect(response.cookies.get('session')).toMatchObject({ value: '', maxAge: 0 });
    expect(response.cookies.get(ERP_ENTRY_COOKIE)?.value).toBe('pos');
  });
});

describe('cada persona vuelve a la app que estaba usando', () => {
  it.each([
    ['/bodega', 'bodega'], ['/bodega/x', 'bodega'], ['/pos', 'pos'], ['/control', 'control'],
    ['/dashboard', 'erp'], ['/dashboard/inventory', 'erp'],
  ])('con sesión, %s recuerda «%s» (para el selector de empresa y el cambio de contraseña)', async (path, entry) => {
    jest.mocked(jwtVerify).mockResolvedValue({ payload: { purpose: 'session', userId: user.id } } as never);
    const response = await proxy(request(path, 'session=token; aether-entry=control'));
    expect(response.cookies.get(ERP_ENTRY_COOKIE)?.value).toBe(entry);
  });
});

