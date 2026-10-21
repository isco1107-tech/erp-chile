/**
 * Prueba real de un dominio propio (`domainServesPlatform`): un dominio solo se
 * da por funcionando cuando `https://dominio/api/hosting/ping` responde nuestra
 * app. Antes se verificaba solo por el DNS y un dominio que Vercel no servía
 * quedaba «verificado» (y el sitio redirigía a una página de error).
 */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/security/outbound-url', () => ({ assertResolvesToPublicAddress: jest.fn() }));

import { assertResolvesToPublicAddress } from '@/lib/security/outbound-url';
import { domainServesPlatform, isVercelAddress, isVercelCname } from '@/lib/hosting/domain-lifecycle';
import { GET } from '@/app/api/hosting/ping/route';

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(assertResolvesToPublicAddress).mockResolvedValue(undefined);
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('domainServesPlatform', () => {
  it('responde la plataforma → funciona', async () => {
    fetchMock.mockResolvedValue(Response.json({ app: 'aether-erp' }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://miacademia.cl/api/hosting/ping');
  });

  it('el 404 de Vercel (dominio no agregado al proyecto), otra app o un error de red → no funciona', async () => {
    fetchMock.mockResolvedValueOnce(new Response('DEPLOYMENT_NOT_FOUND', { status: 404 }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
    fetchMock.mockResolvedValueOnce(Response.json({ app: 'otra' }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('certificate has expired'));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
  });

  it('sigue una redirección solo entre el dominio y su www, y solo por https', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 308, headers: { location: 'https://www.miacademia.cl/api/hosting/ping' } })).mockResolvedValueOnce(Response.json({ app: 'aether-erp' }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(true);

    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://otro-sitio.com/api/hosting/ping' } }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://miacademia.cl/api/hosting/ping' } }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
  });

  it('nunca consulta un dominio que resuelve a una IP privada (SSRF)', async () => {
    jest.mocked(assertResolvesToPublicAddress).mockRejectedValue(new Error('privada'));
    expect(await domainServesPlatform('interno.miacademia.cl')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no sigue redirecciones en cadena', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 308, headers: { location: 'https://www.miacademia.cl/api/hosting/ping' } }));
    expect(await domainServesPlatform('miacademia.cl')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('pistas de DNS de Vercel', () => {
  it('reconoce las direcciones y CNAME de Vercel, también los nuevos', () => {
    for (const ip of ['76.76.21.21', '76.76.21.98', '216.198.79.1', '64.29.17.1']) expect(isVercelAddress(ip)).toBe(true);
    for (const ip of ['1.2.3.4', '76.76.22.1']) expect(isVercelAddress(ip)).toBe(false);
    for (const t of ['cname.vercel-dns.com', 'cname.vercel-dns.com.', 'd1d4fc829fe7bc7c.vercel-dns-017.com']) expect(isVercelCname(t)).toBe(true);
    for (const t of ['vercel-dns.com.evil.cl', 'cname.netlify.com']) expect(isVercelCname(t)).toBe(false);
  });
});

describe('ruta de señal de vida', () => {
  it('responde quién es, sin caché', async () => {
    const res = GET();
    expect(await res.json()).toEqual({ app: 'aether-erp' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
