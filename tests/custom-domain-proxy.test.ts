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

  it('la landing corporativa /empresas tampoco se sirve bajo el dominio del certamen: va a la plataforma', async () => {
    const response = await proxy(request('missuniversotemuco.cl', '/empresas'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://erp.aether.cl/empresas');
  });

  it('en producción, la dirección vercel.app redirige al dominio de la plataforma conservando la ruta', async () => {
    process.env.VERCEL_ENV = 'production';
    try {
      const response = await proxy(request('erp-tawny-iota.vercel.app', '/certamen/miss?x=1'));
      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe('https://erp.aether.cl/certamen/miss?x=1');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it('la plataforma y vercel.app siguen con el flujo normal', async () => {
    for (const host of ['erp.aether.cl', 'erp-abc.vercel.app', 'otra-rama-abc.vercel.app']) {
      const response = await proxy(request(host, '/dashboard'));
      expect(response.headers.get('location')).toContain('/login');
    }
    expect((await proxy(request('erp.aether.cl'))).headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('proxy y sitios web (/web/[slug])', () => {
  const PLATFORM = 'erp.aether.cl';
  const OWN_DOMAIN = 'minegocio.cl';

  it('en la plataforma, /web/mi-sitio se ve sin sesión (pasa, sin redirigir a /login)', async () => {
    const response = await proxy(request(PLATFORM, '/web/mi-sitio'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('en la plataforma, el documento HTML propio /web/mi-sitio/raw también es público', async () => {
    const response = await proxy(request(PLATFORM, '/web/mi-sitio/raw'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('/web a secas SIN sesión no es una ruta pública: redirige a /login', async () => {
    const response = await proxy(request(PLATFORM, '/web'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe('/web');
  });

  it('un prefijo parecido (/webinars, /webhook-x) tampoco se cuela como público: la barra final de /web/ es deliberada', async () => {
    for (const path of ['/webinars', '/webhook-x', '/website']) {
      const response = await proxy(request(PLATFORM, path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    }
  });

  it('en un dominio propio, /web/mi-sitio/raw se sirve tal cual (el sitio HTML lo incrusta en su iframe)', async () => {
    for (const path of ['/web/mi-sitio/raw', '/web/mi-sitio/raw/', '/web/mi-sitio/raw?x=1', '/web/abc/raw']) {
      const response = await proxy(request(OWN_DOMAIN, path));
      expect({ path, next: response.headers.get('x-middleware-next') }).toEqual({ path, next: '1' });
    }
  });

  it('en un dominio propio, /web/mi-sitio (la página) va a la plataforma: un dominio no muestra las páginas de otros sitios', async () => {
    const response = await proxy(request(OWN_DOMAIN, '/web/mi-sitio'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://erp.aether.cl/web/mi-sitio');
  });

  it('en un dominio propio, /web/otro/raw/extra va a la plataforma (solo /raw exacto pasa)', async () => {
    const response = await proxy(request(OWN_DOMAIN, '/web/otro/raw/extra'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://erp.aether.cl/web/otro/raw/extra');
  });

  it('en un dominio propio, un slug fuera de formato en /raw (mayúsculas, muy corto, con separador codificado) va a la plataforma', async () => {
    for (const path of ['/web/Mi-Sitio/raw', '/web/ab/raw', '/web/a%2Fb/raw', '/web/../raw', '/web//raw', '/web/raw']) {
      const response = await proxy(request(OWN_DOMAIN, path));
      expect({ path, status: response.status }).toEqual({ path, status: 307 });
    }
  });

  it('en un dominio propio, /web a secas y /web/ van a la plataforma', async () => {
    for (const path of ['/web', '/web/']) {
      const response = await proxy(request(OWN_DOMAIN, path));
      expect({ path, status: response.status }).toEqual({ path, status: 307 });
    }
  });

  it('la raíz del dominio propio sigue reescribiéndose a /sitio/[host] (que resuelve certamen o sitio web)', async () => {
    const response = await proxy(request(`www.${OWN_DOMAIN}`));
    expect(response.headers.get('x-middleware-rewrite')).toContain(`/sitio/${OWN_DOMAIN}`);
  });
});

describe('proxy y páginas internas de un sitio web en dominio propio', () => {
  it('/servicios se reescribe a /sitio/[dominio]/servicios (sin redirigir)', async () => {
    const response = await proxy(request('www.minegocio.cl', '/servicios'));
    expect(response.headers.get('x-middleware-rewrite')).toContain('/sitio/minegocio.cl/servicios');
    expect(response.status).toBe(200);
  });

  it('las rutas reservadas siguen yendo a la plataforma', async () => {
    const response = await proxy(request('minegocio.cl', '/login?x=1'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://erp.aether.cl/login?x=1');
  });

  it('en la plataforma, /web/mi-sitio/servicios se ve sin sesión', async () => {
    const response = await proxy(request('erp.aether.cl', '/web/mi-sitio/servicios'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
