import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { isPosterFormat } from '@/lib/posters/formats';
import { cleanPosterNote, isPosterPiece } from '@/lib/posters/pieces';
import { isPosterStyle } from '@/lib/posters/styles';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import { buildPosterImage } from '@/modules/projects/services/poster.service';

/**
 * Afiche del certamen en PNG (ver `src/lib/posters/`), con los datos reales de
 * su micrositio. Herramienta del panel (`projects:read`), no ruta pública.
 *
 * Parámetros, todos opcionales y validados (uno inválido toma su valor por
 * defecto, nunca rompe): `piece` (convocatoria…), `style` (gala, editorial,
 * impacto), `format` (feed, story, square, landscape, print), `accent` (por
 * defecto el del micrositio), `candidate` (id, para la pieza "candidata"),
 * `note` (mensaje propio, no se guarda), `qr` (1/0; por defecto según el
 * formato) y `download=1` para bajarlo como archivo.
 */

function isAccent(value: string | null): value is PublicAccentKey {
  return (PUBLIC_ACCENTS as readonly string[]).includes(value ?? '');
}

// Un mosaico de 30 fotos a tamaño de impresión puede tardar varios segundos.
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:read');
    companyId = session.companyId;
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const piece = query.get('piece');
    const style = query.get('style');
    const format = query.get('format');
    const accent = query.get('accent');
    const qr = query.get('qr');

    const build = await buildPosterImage(session.companyId, id, {
      piece: isPosterPiece(piece) ? piece : 'convocatoria',
      style: isPosterStyle(style) ? style : 'gala',
      format: isPosterFormat(format) ? format : 'feed',
      accent: isAccent(accent) ? accent : null,
      candidateId: query.get('candidate')?.slice(0, 64) || null,
      note: cleanPosterNote(query.get('note')),
      qr: qr === '1' ? true : qr === '0' ? false : null,
    });
    if (!build.ok) return NextResponse.json({ success: false, error: build.error }, { status: build.status });

    return new ImageResponse(build.element, {
      width: build.width,
      height: build.height,
      fonts: build.fonts.length > 0 ? build.fonts : undefined,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(query.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="${build.filename}"` } : {}),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'proyectos', companyId, extra: { reason: 'poster-image' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el afiche' }, { status: 500 });
  }
}
