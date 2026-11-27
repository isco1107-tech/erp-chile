import { ImageResponse } from 'next/og';
import { derivePaletteTokens } from '@/lib/events/pageant-palette';
import { galaDateParts, splitPageantTitle } from '@/lib/events/pageant-site';
import { captureException } from '@/lib/observability';
import { fetchGoogleFontSubset, fetchImageAsDataUrl } from '@/lib/images/subset-font';
import { getPublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Imagen para compartir el micrositio (WhatsApp, Instagram, Facebook): el
 * nombre del certamen con la tipografía y los colores del sitio, fecha y
 * recinto de la gala, y la portada de fondo si la organización subió una.
 * Todo con datos reales del certamen; lo que no existe no aparece.
 */
export const alt = 'Certamen';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENTS: Record<string, { a: string; mid: string }> = {
  gold: { a: '#e9d2a0', mid: '#a8823f' },
  rose: { a: '#f2c2cb', mid: '#b3243f' },
  violet: { a: '#d8cbf7', mid: '#7a5bc7' },
  cyan: { a: '#bde7ef', mid: '#2e8a9e' },
  emerald: { a: '#c4e6d2', mid: '#2f7d5b' },
};

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicPageantSite(slug).catch((error: unknown) => {
    captureException(error, { module: 'certamen', extra: { slug, reason: 'og-image' } });
    return null;
  });
  const title = splitPageantTitle(site?.name ?? 'Certamen');
  // Con los colores de la portada, la imagen para compartir lleva los mismos que el sitio.
  const palette = site?.palette ? derivePaletteTokens(site.palette).main : null;
  const accent = palette ? { a: palette['--a'], mid: palette['--a-mid'] } : (ACCENTS[site?.accent ?? 'gold'] ?? ACCENTS.gold);
  const night = palette ? { c1: palette['--night-3'], c2: palette['--night-2'], c3: palette['--night'], rgb: palette['--night-rgb'] } : { c1: '#111841', c2: '#0c1130', c3: '#070a1c', rgb: '7, 10, 28' };
  const gala = site?.galaDate ? galaDateParts(site.galaDate) : null;
  const meta = [gala ? `${gala.day} de ${gala.month} · ${gala.time} h` : null, site?.venueName ?? null].filter(Boolean).join('   ·   ');
  // Todo el texto de la imagen va en el recorte de la fuente: si falta un carácter, se mezclaría con la de respaldo.
  const allText = [title.lead.toUpperCase(), title.main, title.edition ?? '', meta].join('');
  const [font, cover] = await Promise.all([fetchGoogleFontSubset('Italiana', allText), fetchImageAsDataUrl(site?.coverImageUrl ?? null)]);
  const mainSize = Math.min(210, Math.floor(1000 / Math.max(title.main.length * 0.62, 3.2)));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          background: `radial-gradient(circle at 50% 0%, ${night.c1} 0%, ${night.c2} 45%, ${night.c3} 100%)`,
          color: '#f5f1e8',
          fontFamily: font ? 'Italiana' : undefined,
        }}
      >
        {cover && (
          <img src={cover} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        )}
        {cover && <div style={{ position: 'absolute', inset: 0, display: 'flex', background: `linear-gradient(180deg, rgba(${night.rgb},0.55) 0%, rgba(${night.rgb},0.72) 60%, rgba(${night.rgb},0.92) 100%)` }} />}
        <div style={{ position: 'absolute', top: 36, left: 36, width: 70, height: 70, display: 'flex', borderTop: `1px solid ${accent.a}`, borderLeft: `1px solid ${accent.a}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', bottom: 36, right: 36, width: 70, height: 70, display: 'flex', borderBottom: `1px solid ${accent.a}`, borderRight: `1px solid ${accent.a}`, opacity: 0.6 }} />

        {title.lead && (
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, letterSpacing: 16, textTransform: 'uppercase' }}>
            <div style={{ display: 'flex', width: 70, height: 1, background: accent.a, marginRight: 26 }} />
            {title.lead}
            <div style={{ display: 'flex', width: 70, height: 1, background: accent.a, marginLeft: 10 }} />
          </div>
        )}
        <div style={{ display: 'flex', fontSize: mainSize, lineHeight: 1, color: accent.a, marginTop: 6 }}>{title.main}</div>
        {title.edition && <div style={{ display: 'flex', fontSize: 26, letterSpacing: 18, color: accent.a, marginTop: 10 }}>{title.edition}</div>}
        {meta && <div style={{ display: 'flex', fontSize: 26, color: 'rgba(245,241,232,0.78)', marginTop: 34 }}>{meta}</div>}
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'Italiana', data: font, style: 'normal', weight: 400 }] : undefined }
  );
}
