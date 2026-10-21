/**
 * Ruta del afiche (`GET /api/projects/[id]/poster`): permisos, multi-tenant,
 * validación de parámetros y respuestas. La composición (`composePoster`) se
 * prueba aparte (`poster-compose.test.tsx`); acá solo se cablea el llamador.
 */

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));
jest.mock('@/modules/projects/services/poster.service', () => ({ buildPosterImage: jest.fn() }));
jest.mock('@/modules/projects/services/poster-designs.service', () => ({ getPosterDesign: jest.fn() }));
jest.mock('next/og', () => ({ ImageResponse: jest.fn().mockImplementation(() => ({ ok: true })) }));

import { ImageResponse } from 'next/og';
import { GET, POST } from '@/app/api/projects/[id]/poster/route';
import { EMPTY_OVERRIDES } from '@/lib/posters/overrides';
import { getPosterDesign } from '@/modules/projects/services/poster-designs.service';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { buildPosterImage } from '@/modules/projects/services/poster.service';

const requireAuth = requireAuthWithPermission as jest.Mock;
const build = buildPosterImage as jest.Mock;
const imageResponse = ImageResponse as unknown as jest.Mock;
const getDesign = getPosterDesign as jest.Mock;

const OK = { ok: true, element: 'elemento', width: 1080, height: 1350, fonts: [{ name: 'PosterSans', data: new ArrayBuffer(1), weight: 500, style: 'normal' }], filename: 'afiche-miss-sur-gala-feed.png', omitted: [] as string[] };

function post(body: unknown, query = '') {
  return POST(new Request(`https://app.test/api/projects/p1/poster${query}`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'p1' }) });
}

function call(query = '') {
  return GET(new Request(`https://app.test/api/projects/p1/poster${query}`), { params: Promise.resolve({ id: 'p1' }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAuth.mockResolvedValue({ companyId: 'co1', userId: 'u1' });
  build.mockResolvedValue(OK);
});

describe('GET /api/projects/[id]/poster', () => {
  it('exige projects:read', async () => {
    requireAuth.mockRejectedValue(new AuthError('No autorizado', 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(requireAuth).toHaveBeenCalledWith('projects:read');
    expect(build).not.toHaveBeenCalled();
  });

  it('la empresa sale de la sesión, nunca de la URL', async () => {
    await call('?companyId=otra');
    expect(build).toHaveBeenCalledWith('co1', 'p1', expect.any(Object));
  });

  it('sin parámetros usa los valores por defecto', async () => {
    await call();
    expect(build.mock.calls[0]![2]).toEqual({ piece: 'convocatoria', style: 'gala', format: 'feed', accent: null, candidateId: null, note: null, qr: null });
  });

  it('pasa los parámetros válidos', async () => {
    await call('?piece=candidata&style=impacto&format=print&accent=rose&candidate=c2&note=Casting%20s%C3%A1bado&qr=1');
    expect(build.mock.calls[0]![2]).toEqual({ piece: 'candidata', style: 'impacto', format: 'print', accent: 'rose', candidateId: 'c2', note: 'Casting sábado', qr: true });
  });

  it('un parámetro inválido toma su valor por defecto, nunca rompe', async () => {
    await call('?piece=hackeo&style=<script>&format=gigante&accent=negro&qr=talvez');
    expect(build.mock.calls[0]![2]).toMatchObject({ piece: 'convocatoria', style: 'gala', format: 'feed', accent: null, qr: null });
  });

  it('limpia el mensaje propio y acota el id de candidata', async () => {
    await call(`?note=${encodeURIComponent('  hola\n\tmundo ')}&candidate=${'x'.repeat(200)}&qr=0`);
    expect(build.mock.calls[0]![2]).toMatchObject({ note: 'hola mundo', candidateId: 'x'.repeat(64), qr: false });
  });

  it('dibuja el PNG con el tamaño y las fuentes de la composición, sin caché compartida', async () => {
    await call();
    const [element, options] = imageResponse.mock.calls[0]!;
    expect(element).toBe('elemento');
    expect(options).toMatchObject({ width: 1080, height: 1350, fonts: OK.fonts, headers: { 'Cache-Control': 'private, no-store' } });
    expect(options.headers['Content-Disposition']).toBeUndefined();
  });

  it('download=1 lo baja como archivo', async () => {
    await call('?download=1');
    expect(imageResponse.mock.calls[0]![1].headers['Content-Disposition']).toBe('attachment; filename="afiche-miss-sur-gala-feed.png"');
  });

  it('sin fuentes descargadas, deja la de reserva del renderizador', async () => {
    build.mockResolvedValue({ ...OK, fonts: [] });
    await call();
    expect(imageResponse.mock.calls[0]![1].fonts).toBeUndefined();
  });

  it('certamen de otra empresa o inexistente: 404', async () => {
    build.mockResolvedValue({ ok: false, status: 404, error: 'Certamen no encontrado' });
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'Certamen no encontrado' });
  });

  it('pieza no disponible: 409 con el motivo accionable', async () => {
    build.mockResolvedValue({ ok: false, status: 409, error: 'La votación del público no está abierta.' });
    const response = await call('?piece=votacion');
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('La votación del público no está abierta.');
  });

  it('error inesperado: 500 en español y a observabilidad', async () => {
    build.mockRejectedValue(new Error('boom'));
    const response = await call();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('No se pudo generar el afiche');
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ module: 'proyectos', companyId: 'co1' }));
  });

  it('avisa los bloques que no cupieron', async () => {
    build.mockResolvedValue({ ...OK, omitted: ['facts', 'list'] });
    await call();
    expect(imageResponse.mock.calls[0]![1].headers['X-Poster-Omitted']).toBe('facts,list');
  });

  it('un diseño guardado se busca en este certamen y empresa', async () => {
    getDesign.mockResolvedValue({ id: 'd1', name: 'Mío', updatedAt: '', request: { piece: 'gala', style: 'impacto', format: 'story', accent: null, candidateId: null, qr: true, overrides: EMPTY_OVERRIDES } });
    await call('?design=d1');
    expect(getDesign).toHaveBeenCalledWith('co1', 'p1', 'd1');
    expect(build.mock.calls[0]![2]).toEqual({ piece: 'gala', style: 'impacto', format: 'story', accent: null, candidateId: null, qr: true, overrides: EMPTY_OVERRIDES, note: null });
  });

  it('un diseño de otro certamen o empresa: 404', async () => {
    getDesign.mockResolvedValue(null);
    expect((await call('?design=ajeno')).status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[id]/poster', () => {
  it('dibuja con la personalización validada (solo projects:read: dibujar no guarda)', async () => {
    await post({ piece: 'candidata', style: 'editorial', format: 'square', candidateId: 'c2', overrides: { texts: { headline: '  Gran  final ' }, titleScale: 1.1 } });
    expect(requireAuth).toHaveBeenCalledWith('projects:read');
    expect(build.mock.calls[0]![0]).toBe('co1');
    expect(build.mock.calls[0]![2]).toMatchObject({ piece: 'candidata', style: 'editorial', format: 'square', candidateId: 'c2', accent: null, qr: null, note: null, overrides: { texts: { headline: 'Gran final' }, titleScale: 1.1 } });
  });

  it('un cuerpo inválido es 400 con el motivo, sin dibujar', async () => {
    const response = await post({ piece: 'convocatoria', style: 'gala', format: 'feed', overrides: { texts: { headline: 'x'.repeat(200) } } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Titular: máximo 80 caracteres');
    expect(build).not.toHaveBeenCalled();
  });

  it('un JSON roto es 400', async () => {
    const response = await POST(new Request('https://app.test/api/projects/p1/poster', { method: 'POST', body: '{roto' }), { params: Promise.resolve({ id: 'p1' }) });
    expect(response.status).toBe(400);
  });

  it('imágenes ajenas: el servicio responde 400 y la ruta lo pasa', async () => {
    build.mockResolvedValue({ ok: false, status: 400, error: 'Las imágenes del afiche deben subirse desde el estudio de afiches' });
    const response = await post({ piece: 'gala', style: 'gala', format: 'feed', overrides: { logoUrl: 'https://evil.test/x.png' } });
    expect(response.status).toBe(400);
  });
});

