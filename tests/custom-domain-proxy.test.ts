import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

const ORIGINAL = { APP_URL: process.env.APP_URL, VERCEL_URL: process.env.VERCEL_URL };

beforeAll(() => {
  process.env.APP_URL = 'https://erp.aether.cl';
  process.env.VERCEL_URL = 'erp-abc.vercel.app';
});
afterAll(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(host: string, path = '/') {
  return new NextRequest(`https://${host}${path}`, { headers: new Headers({ host }) });
}

describe('proxy con dominio propio de un certamen', () => {
  it('la raíz del dominio muestra el micrositio (reescritura interna, sin redirigir)', async () => {
    const response = await proxy(request('www.missuniversotemuco.cl'));
    expect(response.headers.get('x-middleware-rewrite')).toContain('/sitio/missuniversotemuco.cl');
    expect(response.status).toBe(200);
  });

  it('los flujos públicos del sitio se sirven en el mismo dominio', async () => {
    const response = await proxy(request('missuniversotemuco.cl', '/register/candidate/tok'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('el login y el panel nunca se sirven bajo el dominio del certamen', async () => {
    const response = await proxy(request('missuniversotemuco.cl', '/dashboard/sales?x=1'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://erp.aether.cl/dashboard/sales?x=1');
  });

  it('la plataforma y vercel.app siguen con el flujo normal', async () => {
    for (const host of ['erp.aether.cl', 'erp-abc.vercel.app', 'otra-rama-abc.vercel.app']) {
      const response = await proxy(request(host, '/dashboard'));
      expect(response.headers.get('location')).toContain('/login');
    }
    expect((await proxy(request('erp.aether.cl'))).headers.get('x-middleware-rewrite')).toBeNull();
  });
});
