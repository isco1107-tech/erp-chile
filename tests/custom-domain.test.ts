import {
  appHosts,
  customDomainProblem,
  customDomainRoute,
  domainFromHost,
  isApexDomain,
  isPlatformHost,
  normalizeDomain,
} from '@/lib/hosting/custom-domain';

const ENV = { APP_URL: 'https://erp.aether.cl', VERCEL_URL: 'erp-abc123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'erp.aether.cl' };

describe('normalizeDomain', () => {
  it('limpia protocolo, www, ruta, puerto, mayúsculas y punto final', () => {
    expect(normalizeDomain('https://www.MissUniversoTemuco.cl/')).toBe('missuniversotemuco.cl');
    expect(normalizeDomain('  missuniversotemuco.cl:443/inicio?x=1 ')).toBe('missuniversotemuco.cl');
    expect(normalizeDomain('miss.temuco.cl.')).toBe('miss.temuco.cl');
  });
});

describe('customDomainProblem', () => {
  it('acepta dominios y subdominios propios', () => {
    expect(customDomainProblem('missuniversotemuco.cl', ENV)).toBeNull();
    expect(customDomainProblem('miss.temuco-eventos.com', ENV)).toBeNull();
  });

  it('rechaza lo que no es un dominio público propio', () => {
    expect(customDomainProblem('', ENV)).toMatch(/Escribe/);
    expect(customDomainProblem('missuniverso', ENV)).toMatch(/terminación/);
    expect(customDomainProblem('192.168.0.1', ENV)).toMatch(/IP/);
    expect(customDomainProblem('miss_temuco.cl', ENV)).toMatch(/caracteres/);
    expect(customDomainProblem('-miss.cl', ENV)).toMatch(/caracteres/);
    expect(customDomainProblem('miss.vercel.app', ENV)).toMatch(/vercel/);
    expect(customDomainProblem('localhost', ENV)).not.toBeNull();
  });

  it('nunca permite registrar el dominio de la plataforma ni uno de sus subdominios', () => {
    expect(customDomainProblem('erp.aether.cl', ENV)).toMatch(/plataforma/);
    expect(customDomainProblem('aether.cl', ENV)).toMatch(/plataforma/);
    expect(customDomainProblem('sitio.erp.aether.cl', ENV)).toMatch(/plataforma/);
  });
});

describe('isPlatformHost', () => {
  it('la plataforma, vercel.app y localhost son la app', () => {
    for (const host of ['erp.aether.cl', 'www.erp.aether.cl', 'ERP.AETHER.CL:443', 'erp-abc123.vercel.app', 'otra-rama.vercel.app', 'localhost:3000', '127.0.0.1', '', null]) {
      expect(isPlatformHost(host, ENV)).toBe(true);
    }
  });

  it('un dominio de certamen no es la plataforma', () => {
    expect(isPlatformHost('missuniversotemuco.cl', ENV)).toBe(false);
    expect(isPlatformHost('www.missuniversotemuco.cl', ENV)).toBe(false);
  });

  it('APP_HOSTS suma dominios extra de la plataforma', () => {
    expect(isPlatformHost('app.aether.cl', { ...ENV, APP_HOSTS: 'app.aether.cl, https://panel.aether.cl' })).toBe(true);
    expect(appHosts({ APP_HOSTS: 'panel.aether.cl' })).toEqual(expect.arrayContaining(['panel.aether.cl', 'www.panel.aether.cl']));
  });
});

describe('customDomainRoute', () => {
  it('la raíz es el micrositio', () => {
    expect(customDomainRoute('/')).toEqual({ kind: 'site' });
  });

  it('los flujos públicos del sitio se sirven en el mismo dominio', () => {
    for (const path of ['/register/candidate/abc', '/tickets/t1', '/votar/v1', '/pagar/p1', '/politica-privacidad', '/certamen/miss/opengraph-image', '/_next/data/x.json', '/icon.png']) {
      expect(customDomainRoute(path)).toEqual({ kind: 'pass' });
    }
  });

  it('el panel, el login o rutas parecidas nunca se sirven bajo el dominio del certamen', () => {
    for (const path of ['/login', '/dashboard', '/dashboard/sales', '/superadmin', '/sitio/otro.cl', '/registerX', '/certamen']) {
      expect(customDomainRoute(path)).toEqual({ kind: 'platform' });
    }
  });
});

describe('otros', () => {
  it('raíz vs. subdominio y host → dominio guardado', () => {
    expect(isApexDomain('missuniversotemuco.cl')).toBe(true);
    expect(isApexDomain('miss.temuco.cl')).toBe(false);
    expect(domainFromHost('WWW.MissUniversoTemuco.cl:443')).toBe('missuniversotemuco.cl');
  });
});
