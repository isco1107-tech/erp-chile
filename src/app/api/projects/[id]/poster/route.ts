import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import { fetchGoogleFontSubset, fetchImageAsDataUrl } from '@/lib/images/subset-font';
import { getPageantSitePreview } from '@/modules/projects/services/public-site.service';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import { POSTER_FORMATS, POSTER_SIZES, posterDisplayText, renderPosterElement, type PosterFormat } from '@/modules/projects/services/poster-render';

/**
 * Afiche de convocatoria en PNG, listo para publicar (Instagram feed, story
 * o cuadrado), armado con los datos reales del certamen — los mismos que
 * alimentan su micrositio público, nunca inventados. Autenticado con
 * `projects:read`: es una herramienta del panel, no una ruta pública (a
 * diferencia de `/certamen/[slug]/opengraph-image`, que sí lo es).
 *
 * `?format=feed|story|square` (por defecto `feed`), `?accent=<acento>`
 * (por defecto el del micrositio) para previsualizar otro color sin
 * guardar nada, y `?download=1` para que el navegador lo baje como archivo
 * en vez de mostrarlo inline (así la misma URL sirve para la vista previa
 * `<img>` y para el botón "Descargar").
 */

function isFormat(value: string | null): value is PosterFormat {
  return (POSTER_FORMATS as readonly string[]).includes(value ?? '');
}

function isAccent(value: string | null): value is PublicAccentKey {
  return (PUBLIC_ACCENTS as readonly string[]).includes(value ?? '');
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:read');
    companyId = session.companyId;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = isFormat(searchParams.get('format')) ? (searchParams.get('format') as PosterFormat) : 'feed';
    const download = searchParams.get('download') === '1';

    const site = await getPageantSitePreview(session.companyId, id);
    if (!site) return NextResponse.json({ success: false, error: 'Certamen no encontrado' }, { status: 404 });

    const accent = isAccent(searchParams.get('accent')) ? (searchParams.get('accent') as PublicAccentKey) : site.accent;
    // `vista-previa` es el marcador de "sin dirección pública usable todavía" (ver `getPageantSitePreview`): sin
    // dominio propio ni `publicSlug`, no hay enlace real que ofrecer — el afiche muestra el contacto en su lugar.
    const siteUrl = site.slug === 'vista-previa' ? null : site.customDomain ? `https://${site.customDomain}` : `${getAppUrl()}/certamen/${site.slug}`;

    const input = {
      name: site.name,
      tagline: site.tagline,
      galaDate: site.galaDate,
      venueName: site.venueName,
      coverDataUrl: null as string | null,
      accent,
      registration: site.registration ? { minAge: site.registration.minAge, closesAt: site.registration.closesAt } : null,
      registrationOpensAtLabel: site.registrationNotice?.state === 'soon' ? site.registrationNotice.opensAtLabel : null,
      contactEmail: site.contactEmail,
      whatsappLabel: site.whatsapp?.label ?? null,
      instagramHandle: site.instagramHandle,
      siteUrl,
      format,
    };

    const [font, cover] = await Promise.all([fetchGoogleFontSubset('Italiana', posterDisplayText(input)), fetchImageAsDataUrl(site.coverImageUrl)]);

    const { width, height } = POSTER_SIZES[format];
    const filename = `afiche-${site.slug}-${format}.png`;
    return new ImageResponse(renderPosterElement({ ...input, coverDataUrl: cover }), {
      width,
      height,
      fonts: font ? [{ name: 'Italiana', data: font, style: 'normal', weight: 400 }] : undefined,
      headers: download ? { 'Content-Disposition': `attachment; filename="${filename}"` } : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'proyectos', companyId, extra: { reason: 'poster-image' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el afiche' }, { status: 500 });
  }
}
