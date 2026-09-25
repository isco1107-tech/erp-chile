import { ImageResponse } from 'next/og';
import { galaDateParts, splitPageantTitle } from '@/lib/events/pageant-site';
import { captureException } from '@/lib/observability';
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

/** Italiana (la del sitio) recortada a los caracteres usados; si Google Fonts no responde se usa la fuente por defecto. */
async function loadDisplayFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Italiana&text=${encodeURIComponent(text)}`)).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Portada como data URL: si no se puede descargar, la imagen se genera sin ella en vez de fallar. */
async function loadCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicPageantSite(slug).catch((error: unknown) => {
    captureException(error, { module: 'certamen', extra: { slug, reason: 'og-image' } });
    return null;
  });
  const title = splitPageantTitle(site?.name ?? 'Certamen');
  const accent = ACCENTS[site?.accent ?? 'gold'] ?? ACCENTS.gold;
  const gala = site?.galaDate ? galaDateParts(site.galaDate) : null;
  const meta = [gala ? `${gala.day} de ${gala.month} · ${gala.time} h` : null, site?.venueName ?? null].filter(Boolean).join('   ·   ');
  const organizerLine = site ? `${site.organizer} presenta` : '';
  // Todo el texto de la imagen va en el recorte de la fuente: si falta un carácter, se mezclaría con la de respaldo.
  const allText = [organizerLine, organizerLine.toUpperCase(), title.lead.toUpperCase(), title.main, title.edition ?? '', meta].join('');
  const [font, cover] = await Promise.all([loadDisplayFont(allText), loadCover(site?.coverImageUrl ?? null)]);
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
          background: 'radial-gradient(circle at 50% 0%, #111841 0%, #0c1130 45%, #070a1c 100%)',
          color: '#f5f1e8',
          fontFamily: font ? 'Italiana' : undefined,
        }}
      >
        {cover && (
          <img src={cover} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        )}
        {cover && <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(180deg, rgba(7,10,28,0.55) 0%, rgba(7,10,28,0.72) 60%, rgba(7,10,28,0.92) 100%)' }} />}
        <div style={{ position: 'absolute', top: 36, left: 36, width: 70, height: 70, display: 'flex', borderTop: `1px solid ${accent.a}`, borderLeft: `1px solid ${accent.a}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', bottom: 36, right: 36, width: 70, height: 70, display: 'flex', borderBottom: `1px solid ${accent.a}`, borderRight: `1px solid ${accent.a}`, opacity: 0.6 }} />

        {organizerLine && <div style={{ display: 'flex', fontSize: 20, letterSpacing: 8, textTransform: 'uppercase', color: accent.a, marginBottom: 22 }}>{organizerLine}</div>}
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
