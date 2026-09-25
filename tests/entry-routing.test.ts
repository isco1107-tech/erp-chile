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

  it.each([
    ['aether-entry=erp', undefined],
    [undefined, 'Mozilla/5.0 AetherDesktop/0.1.1'],
  ])('envía al login a un cliente sin sesión (%s, %s)', async (cookie, agent) => {
    const response = await proxy(request('/', cookie, agent));
    expect(response.headers.get('location')).toBe('https://aether.example/login');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.cookies.get('aether-entry')?.value).toBe('erp');
  });

  it('envía una sesión firmada al dashboard sin elegir otra empresa', async () => {
    verify.mockResolvedValue({ payload: { purpose: 'session', activeCompanyId: 'company-b' }, protectedHeader: { alg: 'HS256' } });
    const response = await proxy(request('/', 'session=valid'));
    expect(response.headers.get('location')).toBe('https://aether.example/dashboard');
    expect(response.cookies.get('session')).toBeUndefined();
  });

  it('una sesión vencida vuelve al login y se elimina', async () => {
    verify.mockRejectedValue(new Error('expired'));
    const response = await proxy(request('/', 'session=expired'));
    expect(response.headers.get('location')).toBe('https://aether.example/login');
    expect(response.cookies.get('session')?.value).toBe('');
  });

  it('un token de otro propósito no abre el dashboard', async () => {
    verify.mockResolvedValue({ payload: { purpose: 'totp-challenge' }, protectedHeader: { alg: 'HS256' } });
    expect((await proxy(request('/', 'session=challenge'))).headers.get('location')).toBe('https://aether.example/login');
  });

  it('la preferencia no autoriza rutas privadas', async () => {
    const response = await proxy(request('/dashboard/inventory', 'aether-entry=erp'));
    expect(response.headers.get('location')).toContain('/login?callbackUrl=');
  });

  it.each(['/conoce-aether', '/downloads/releases.json', '/manual/screenshots/dashboard.png'])('permite visitar %s incluso siendo cliente', async path => {
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
    // Sin redirección: se renderiza el login (junto a la intro en video).
    const element = (await LoginLayout({ children: 'login' })) as { props: { children: unknown[] } };
    expect(element.props.children).toContain('login');
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
