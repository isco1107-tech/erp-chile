import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { proxy } from '@/proxy';
import LoginLayout from '@/app/login/layout';
import { AuthError, getAuthContext, TenantInactiveError } from '@/lib/auth/guards';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/session';

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  getAuthContext: jest.fn(),
  AuthError: class extends Error {},
  TenantInactiveError: class extends Error {},
}));
jest.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

const verify = jest.mocked(jwtVerify);
const context = jest.mocked(getAuthContext);
const originalSecret = process.env.JWT_SECRET;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.JWT_SECRET = 'entry-routing-test-key';
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function request(path = '/', cookie?: string, agent?: string) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (agent) headers.set('user-agent', agent);
  return new NextRequest(`https://aether.example${path}`, { headers });
}

describe('entrada comercial y acceso al ERP', () => {
  it('muestra la portada a una visita nueva', async () => {
    expect((await proxy(request())).headers.get('x-middleware-next')).toBe('1');
    expect(verify).not.toHaveBeenCalled();
  });

  it('/empresas (landing corporativa) responde sin sesión, sin redirigir a /login', async () => {
    const response = await proxy(request('/empresas'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    ['aether-entry=erp'],
    ['session=valid'],
    ['aether-entry=erp; session=valid'],
  ])('la raíz muestra la landing aunque sea cliente o tenga sesión (%s)', async cookie => {
    const response = await proxy(request('/', cookie));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('la app de escritorio sin sesión entra al login', async () => {
    const response = await proxy(request('/', undefined, 'Mozilla/5.0 AetherDesktop/0.1.1'));
    expect(response.headers.get('location')).toBe('https://aether.example/login');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.cookies.get('aether-entry')?.value).toBe('erp');
  });

  it('la app de escritorio con sesión firmada entra al dashboard', async () => {
    verify.mockResolvedValue({ payload: { purpose: 'session', activeCompanyId: 'company-b' }, protectedHeader: { alg: 'HS256' } });
    const response = await proxy(request('/', 'session=valid', 'Mozilla/5.0 AetherDesktop/0.1.1'));
    expect(response.headers.get('location')).toBe('https://aether.example/dashboard');
    expect(response.cookies.get('session')).toBeUndefined();
  });

  it('en la app de escritorio, una sesión vencida vuelve al login y se elimina', async () => {
    verify.mockRejectedValue(new Error('expired'));
    const response = await proxy(request('/', 'session=expired', 'Mozilla/5.0 AetherDesktop/0.1.1'));
    expect(response.headers.get('location')).toBe('https://aether.example/login');
    expect(response.cookies.get('session')?.value).toBe('');
  });

  it('en la app de escritorio, un token de otro propósito no abre el dashboard', async () => {
    verify.mockResolvedValue({ payload: { purpose: 'totp-challenge' }, protectedHeader: { alg: 'HS256' } });
    expect((await proxy(request('/', 'session=challenge', 'Mozilla/5.0 AetherDesktop/0.1.1'))).headers.get('location')).toBe('https://aether.example/login');
  });

  it('la preferencia no autoriza rutas privadas', async () => {
    const response = await proxy(request('/dashboard/inventory', 'aether-entry=erp'));
    expect(response.headers.get('location')).toContain('/login?callbackUrl=');
  });

  it('/empresas/opengraph-image (imagen para redes) también es pública', async () => {
    const response = await proxy(request('/empresas/opengraph-image'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/conoce-aether', '/empresas', '/downloads/releases.json', '/manual/screenshots/dashboard.png'])('permite visitar %s incluso siendo cliente', async path => {
    expect((await proxy(request(path, 'aether-entry=erp; session=expired'))).headers.get('x-middleware-next')).toBe('1');
    expect(verify).not.toHaveBeenCalled();
  });

  it('recuerda el acceso completado y conserva la preferencia al cerrar sesión', () => {
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, 'valid');
    expect(response.cookies.get('aether-entry')?.value).toBe('erp');
    clearSessionCookie(response);
    expect(response.cookies.get('session')?.value).toBe('');
    expect(response.cookies.get('aether-entry')?.value).toBe('erp');
  });
});

describe('login con validación de sesión vigente', () => {
  it('omite login cuando el contexto de empresa es válido', async () => {
    context.mockResolvedValue({ mustChangePassword: false } as Awaited<ReturnType<typeof getAuthContext>>);
    await expect(LoginLayout({ children: 'login' })).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('una sesión revocada muestra login sin bucles de redirección', async () => {
    context.mockRejectedValue(new AuthError('Sesión revocada', 401));
    await expect(LoginLayout({ children: 'login' })).resolves.toBe('login');
  });

  it('respeta el cambio obligatorio de contraseña', async () => {
    context.mockResolvedValue({ mustChangePassword: true } as Awaited<ReturnType<typeof getAuthContext>>);
    await expect(LoginLayout({ children: 'login' })).rejects.toThrow('REDIRECT:/change-password');
  });

  it('mantiene la pantalla de empresa suspendida', async () => {
    context.mockRejectedValue(new TenantInactiveError('SUSPENDED'));
    await expect(LoginLayout({ children: 'login' })).rejects.toThrow('REDIRECT:/suspended');
  });

  it('no oculta errores de infraestructura como si fueran falta de sesión', async () => {
    context.mockRejectedValue(new Error('database unavailable'));
    await expect(LoginLayout({ children: 'login' })).rejects.toThrow('database unavailable');
  });
});
