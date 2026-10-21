import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import type { PosterRequest } from '@/lib/posters/compose';
import { isPosterFormat } from '@/lib/posters/formats';
import { posterRequestSchema } from '@/lib/posters/overrides';
import { cleanPosterNote, isPosterPiece } from '@/lib/posters/pieces';
import { isPosterStyle } from '@/lib/posters/styles';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import { getPosterDesign } from '@/modules/projects/services/poster-designs.service';
import { buildPosterImage } from '@/modules/projects/services/poster.service';

/**
 * Afiche del certamen en PNG (ver `src/lib/posters/`), con los datos reales de
 * su micrositio. Herramienta del panel (`projects:read`), no ruta pública.
 *
 * - `GET ?piece=&style=&format=&accent=&candidate=&note=&qr=1|0`: afiche
 *   automático (un parámetro inválido toma su valor por defecto, nunca rompe).
 * - `GET ?design=<id>`: un diseño guardado de este certamen.
 * - `POST` con el pedido completo en JSON (`posterRequestSchema`), incluida la
 *   personalización del estudio: dibujar no guarda nada.
 * - `download=1` (en la URL) lo baja como archivo.
 *
 * La cabecera `X-Poster-Omitted` lista los bloques que no cupieron en el
 * formato, para que el estudio lo avise en vez de que algo desaparezca sin más.
 */

// Un mosaico de 30 fotos a tamaño de impresión puede tardar varios segundos.
export const maxDuration = 60;

function isAccent(value: string | null): value is PublicAccentKey {
  return (PUBLIC_ACCENTS as readonly string[]).includes(value ?? '');
}

function fromQuery(query: URLSearchParams): PosterRequest {
  const piece = query.get('piece');
  const style = query.get('style');
  const format = query.get('format');
  const accent = query.get('accent');
  const qr = query.get('qr');
  return {
    piece: isPosterPiece(piece) ? piece : 'convocatoria',
    style: isPosterStyle(style) ? style : 'gala',
    format: isPosterFormat(format) ? format : 'feed',
    accent: isAccent(accent) ? accent : null,
    candidateId: query.get('candidate')?.slice(0, 64) || null,
    note: cleanPosterNote(query.get('note')),
    qr: qr === '1' ? true : qr === '0' ? false : null,
  };
}

function errorResponse(error: unknown, companyId: string | undefined) {
  if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
  if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  captureException(error, { module: 'proyectos', companyId, extra: { reason: 'poster-image' } });
  return NextResponse.json({ success: false, error: 'No se pudo generar el afiche' }, { status: 500 });
}

async function render(companyId: string, projectId: string, request: PosterRequest, download: boolean) {
  const build = await buildPosterImage(companyId, projectId, request);
  if (!build.ok) return NextResponse.json({ success: false, error: build.error }, { status: build.status });
  return new ImageResponse(build.element, {
    width: build.width,
    height: build.height,
    fonts: build.fonts.length > 0 ? build.fonts : undefined,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Poster-Omitted': build.omitted.join(','),
      ...(download ? { 'Content-Disposition': `attachment; filename="${build.filename}"` } : {}),
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:read');
    companyId = session.companyId;
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const download = query.get('download') === '1';
    const designId = query.get('design');
    if (designId) {
      const design = await getPosterDesign(session.companyId, id, designId.slice(0, 64));
      if (!design) return NextResponse.json({ success: false, error: 'Diseño no encontrado' }, { status: 404 });
      return await render(session.companyId, id, { ...design.request, note: null }, download);
    }
    return await render(session.companyId, id, fromQuery(query), download);
  } catch (error) {
    return errorResponse(error, companyId);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:read');
    companyId = session.companyId;
    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = posterRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
    const download = new URL(request.url).searchParams.get('download') === '1';
    return await render(session.companyId, id, { ...parsed.data, note: null }, download);
  } catch (error) {
    return errorResponse(error, companyId);
  }
}
