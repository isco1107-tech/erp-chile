/**
 * Ruta del afiche (`GET /api/projects/[id]/poster`): permisos, multi-tenant y
 * validación de parámetros. La composición visual real (satori/`ImageResponse`)
 * se prueba aparte (`poster-render.test.tsx`, pura) y se comprobó a mano
 * generando PNGs reales (ver el PR) — acá solo se cablea el llamador.
 */

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));
jest.mock('@/lib/images/subset-font', () => ({ fetchGoogleFontSubset: jest.fn().mockResolvedValue(null), fetchImageAsDataUrl: jest.fn().mockResolvedValue(null) }));
jest.mock('@/modules/projects/services/public-site.service', () => ({ getPageantSitePreview: jest.fn() }));
jest.mock('@/modules/projects/services/poster-render', () => {
  const actual = jest.requireActual('@/modules/projects/services/poster-render');
  return { ...actual, renderPosterElement: jest.fn(() => null) };
});
jest.mock('next/og', () => ({ ImageResponse: jest.fn().mockImplementation(() => ({ headers: new Map() })) }));

import { GET } from '@/app/api/projects/[id]/poster/route';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { fetchImageAsDataUrl } from '@/lib/images/subset-font';
import { getPageantSitePreview } from '@/modules/projects/services/public-site.service';
import { renderPosterElement } from '@/modules/projects/services/poster-render';
import { ImageResponse } from 'next/og';

const SITE = {
  slug: 'miss-sur',
  name: 'Miss Sur',
  organizer: 'Aurora SpA',
  tagline: null,
  description: null,
  galaDate: null,
  venueName: null,
  venueAddress: null,
  coverImageUrl: 'https://x.public.blob.vercel-storage.com/pageant-covers/co1/foto.jpg',
  faviconUrl: null,
  accent: 'gold' as const,
  instagramHandle: 'misssur',
  contactEmail: null,
  whatsapp: null,
  candidates: [],
  sponsorsByTier: [],
  packages: [],
  tickets: null,
  voting: null,
  registration: { href: '/register/candidate/abc', token: 'abc', closesAt: null, minAge: 18, maxCandidates: null, benefits: [], classesNote: null },
  candidateSide: true,
  registrationNotice: null,
  voteRanking: null,
  results: null,
  sponsorLeadForm: true,
  pastWinners: [],
  director: null,
  sponsorNote: null,
  customDomain: null,
};

function call(url: string, id = 'p1') {
  return GET(new Request(url), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireAuthWithPermission as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@b.cl', companyId: 'co1' });
  (getPageantSitePreview as jest.Mock).mockResolvedValue(SITE);
});

describe('GET /api/projects/[id]/poster', () => {
  it('exige projects:read', async () => {
    await call('https://app.test/api/projects/p1/poster');
    expect(requireAuthWithPermission).toHaveBeenCalledWith('projects:read');
  });

  it('sin sesión, no consulta el certamen', async () => {
    (requireAuthWithPermission as jest.Mock).mockRejectedValue(new AuthError('No tienes sesión', 401));
    const res = await call('https://app.test/api/projects/p1/poster');
    expect(res.status).toBe(401);
    expect(getPageantSitePreview).not.toHaveBeenCalled();
  });

  it('busca el certamen con el companyId de la SESIÓN, nunca uno del cuerpo o la URL', async () => {
    await call('https://app.test/api/projects/p1/poster', 'p1');
    expect(getPageantSitePreview).toHaveBeenCalledWith('co1', 'p1');
  });

  it('certamen de otra empresa (o inexistente): 404, nunca genera la imagen', async () => {
    (getPageantSitePreview as jest.Mock).mockResolvedValue(null);
    const res = await call('https://app.test/api/projects/ajeno/poster', 'ajeno');
    expect(res.status).toBe(404);
    expect(ImageResponse).not.toHaveBeenCalled();
  });

  it('formato inválido cae al valor por defecto (feed), nunca lanza', async () => {
    const res = await call('https://app.test/api/projects/p1/poster?format=banner');
    expect(res.status).not.toBe(500);
    const input = (renderPosterElement as jest.Mock).mock.calls[0][0];
    expect(input.format).toBe('feed');
  });

  it('acento inválido cae al del sitio, nunca lanza', async () => {
    await call('https://app.test/api/projects/p1/poster?accent=neon');
    const input = (renderPosterElement as jest.Mock).mock.calls[0][0];
    expect(input.accent).toBe('gold');
  });

  it('acento válido en la URL reemplaza al del sitio (solo vista previa, no se guarda nada)', async () => {
    await call('https://app.test/api/projects/p1/poster?accent=rose');
    const input = (renderPosterElement as jest.Mock).mock.calls[0][0];
    expect(input.accent).toBe('rose');
  });

  it('sin publicSlug real ("vista-previa"), no arma una URL pública falsa', async () => {
    (getPageantSitePreview as jest.Mock).mockResolvedValue({ ...SITE, slug: 'vista-previa' });
    await call('https://app.test/api/projects/p1/poster');
    const input = (renderPosterElement as jest.Mock).mock.calls[0][0];
    expect(input.siteUrl).toBeNull();
  });

  it('con dominio propio, la URL del afiche es ese dominio, no /certamen/slug', async () => {
    (getPageantSitePreview as jest.Mock).mockResolvedValue({ ...SITE, customDomain: 'misssur.cl' });
    await call('https://app.test/api/projects/p1/poster');
    const input = (renderPosterElement as jest.Mock).mock.calls[0][0];
    expect(input.siteUrl).toBe('https://misssur.cl');
  });

  it('trae la portada real del certamen para incrustarla (nunca una URL cualquiera del pedido)', async () => {
    await call('https://app.test/api/projects/p1/poster');
    expect(fetchImageAsDataUrl).toHaveBeenCalledWith(SITE.coverImageUrl);
  });

  it('?download=1 pide la descarga como archivo; sin el parámetro, no', async () => {
    await call('https://app.test/api/projects/p1/poster?download=1');
    const opts = (ImageResponse as unknown as jest.Mock).mock.calls[0][1];
    expect(opts.headers?.['Content-Disposition']).toContain('attachment');
    (ImageResponse as unknown as jest.Mock).mockClear();
    await call('https://app.test/api/projects/p1/poster');
    const opts2 = (ImageResponse as unknown as jest.Mock).mock.calls[0][1];
    expect(opts2.headers).toBeUndefined();
  });

  it('un fallo inesperado se reporta con el companyId y responde 500 en español, nunca 200 con basura', async () => {
    (getPageantSitePreview as jest.Mock).mockRejectedValue(new Error('boom'));
    const res = await call('https://app.test/api/projects/p1/poster');
    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ companyId: 'co1' }));
  });
});
