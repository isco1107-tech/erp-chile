import { splitPageantTitle, galaDateParts, shortDate } from '@/lib/events/pageant-site';
import type { PublicAccentKey } from '../schema';

/**
 * Afiche de convocatoria para redes (Instagram, principalmente), armado con
 * los mismos datos reales que el micrositio público del certamen — nunca
 * texto inventado: lo que el certamen no tiene configurado, simplemente no
 * aparece en el afiche. Comparte lenguaje visual con `opengraph-image.tsx`
 * (mismo fondo, mismo acento, misma fuente de display), pero es su propio
 * punto de composición porque el afiche muestra más información (requisitos,
 * fecha límite, contacto) que la imagen para compartir el enlace.
 *
 * Deliberadamente sin corona ni otro glifo/SVG decorativo: la fuente de
 * display se recorta a los caracteres del texto real (ver
 * `subset-font.ts`), así que un glifo decorativo no vendría incluido, y un
 * ícono dibujado a mano es un riesgo de compatibilidad con el renderizador
 * (`satori`, detrás de `ImageResponse`) que no vale la pena correr en una
 * pieza de marketing: mejor una composición tipográfica y geométrica
 * (cintillos, píldoras, líneas finas) que SIEMPRE se ve bien.
 */

export const POSTER_FORMATS = ['feed', 'story', 'square'] as const;
export type PosterFormat = (typeof POSTER_FORMATS)[number];

export const POSTER_SIZES: Record<PosterFormat, { width: number; height: number; label: string; hint: string }> = {
  feed: { width: 1080, height: 1350, label: 'Feed', hint: '4:5 · publicación de Instagram' },
  story: { width: 1080, height: 1920, label: 'Story', hint: '9:16 · historia de Instagram' },
  square: { width: 1080, height: 1080, label: 'Cuadrado', hint: '1:1 · feed o WhatsApp' },
};

const ACCENTS: Record<PublicAccentKey, { a: string; mid: string }> = {
  gold: { a: '#e9d2a0', mid: '#a8823f' },
  rose: { a: '#f2c2cb', mid: '#b3243f' },
  violet: { a: '#d8cbf7', mid: '#7a5bc7' },
  cyan: { a: '#bde7ef', mid: '#2e8a9e' },
  emerald: { a: '#c4e6d2', mid: '#2f7d5b' },
};

export interface PosterInput {
  name: string;
  tagline: string | null;
  galaDate: string | null;
  venueName: string | null;
  coverDataUrl: string | null;
  accent: PublicAccentKey;
  /** `null` = la convocatoria no está abierta ahora mismo. */
  registration: { minAge: number; closesAt: string | null } | null;
  /** Solo cuando `registration` es `null`: si el sitio avisa que abre pronto. */
  registrationOpensAtLabel: string | null;
  contactEmail: string | null;
  whatsappLabel: string | null;
  instagramHandle: string | null;
  /** `null` = el sitio no tiene una dirección pública usable todavía (sin publicar o sin dominio). */
  siteUrl: string | null;
  format: PosterFormat;
}

/** Texto que necesita la fuente de display (Italiana), para recortarla justo a eso. */
export function posterDisplayText(input: Pick<PosterInput, 'name'>): string {
  const title = splitPageantTitle(input.name);
  return [title.lead.toUpperCase(), title.main, title.edition ?? ''].join('');
}

export function renderPosterElement(input: PosterInput) {
  const { width, height } = POSTER_SIZES[input.format];
  const accent = ACCENTS[input.accent];
  const title = splitPageantTitle(input.name);
  const gala = input.galaDate ? galaDateParts(input.galaDate) : null;
  const isStory = input.format === 'story';
  const pad = isStory ? 72 : 64;

  // Estado de la convocatoria: nunca se inventa una fecha ni un "abierta" que no sea cierto.
  const status: { pill: string; cta: string } = input.registration
    ? { pill: 'Postulaciones abiertas', cta: 'Postula ahora' }
    : input.registrationOpensAtLabel
      ? { pill: 'Postulaciones próximamente', cta: 'Entérate primero' }
      : { pill: 'Convocatoria', cta: 'Conoce el certamen' };

  const facts: string[] = [];
  if (input.registration) {
    facts.push(`Desde ${input.registration.minAge} años`);
    if (input.registration.closesAt) facts.push(`Hasta el ${shortDate(input.registration.closesAt)}`);
  } else if (input.registrationOpensAtLabel) {
    facts.push(`Abren el ${input.registrationOpensAtLabel}`);
  }
  if (gala) facts.push(`Gala · ${gala.day} de ${gala.month}`);
  if (input.venueName) facts.push(input.venueName);

  const contactLine = [
    input.instagramHandle ? `@${input.instagramHandle}` : null,
    input.whatsappLabel,
    !input.instagramHandle && !input.whatsappLabel ? input.contactEmail : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join('   ·   ');

  const titleSize = Math.min(isStory ? 128 : 112, Math.floor((width - pad * 2) / Math.max(title.main.length * 0.6, 3)));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'radial-gradient(circle at 50% 0%, #111841 0%, #0c1130 45%, #070a1c 100%)',
        color: '#f5f1e8',
        fontFamily: 'Italiana',
      }}
    >
      {input.coverDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={input.coverDataUrl} alt="" width={width} height={height} style={{ position: 'absolute', inset: 0, width, height, objectFit: 'cover' }} />
      )}
      {input.coverDataUrl && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(180deg, rgba(7,10,28,0.62) 0%, rgba(7,10,28,0.74) 55%, rgba(7,10,28,0.95) 100%)' }} />
      )}

      <div style={{ position: 'absolute', top: pad - 12, left: pad - 12, width: 64, height: 64, display: 'flex', borderTop: `1px solid ${accent.a}`, borderLeft: `1px solid ${accent.a}`, opacity: 0.55 }} />
      <div style={{ position: 'absolute', bottom: pad - 12, right: pad - 12, width: 64, height: 64, display: 'flex', borderBottom: `1px solid ${accent.a}`, borderRight: `1px solid ${accent.a}`, opacity: 0.55 }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${pad + 30}px ${pad}px 0`, flexGrow: 1 }}>
        <div
          style={{
            display: 'flex',
            padding: '10px 26px',
            borderRadius: 999,
            border: `1px solid ${accent.a}`,
            fontFamily: 'sans-serif',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: accent.a,
          }}
        >
          {status.pill}
        </div>

        {title.lead && (
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, fontFamily: 'sans-serif', fontWeight: 600, letterSpacing: 12, textTransform: 'uppercase', marginTop: 44 }}>
            <div style={{ display: 'flex', width: 50, height: 1, background: accent.a, marginRight: 22 }} />
            {title.lead}
            <div style={{ display: 'flex', width: 50, height: 1, background: accent.a, marginLeft: 22 }} />
          </div>
        )}
        <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1, color: accent.a, marginTop: title.lead ? 14 : 44, textAlign: 'center' }}>{title.main}</div>
        {title.edition && <div style={{ display: 'flex', fontFamily: 'sans-serif', fontSize: 24, fontWeight: 600, letterSpacing: 14, color: accent.a, marginTop: 14 }}>{title.edition}</div>}

        {input.tagline && (
          <div style={{ display: 'flex', fontFamily: 'sans-serif', fontSize: 27, fontWeight: 500, color: 'rgba(245,241,232,0.86)', marginTop: 34, textAlign: 'center', maxWidth: width - pad * 2 - 80 }}>
            {input.tagline}
          </div>
        )}

        {facts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: isStory ? 54 : 40 }}>
            {facts.map((fact) => (
              <div key={fact} style={{ display: 'flex', padding: '11px 22px', borderRadius: 999, border: '1px solid rgba(245,241,232,0.3)', fontFamily: 'sans-serif', fontSize: 21, fontWeight: 600, color: 'rgba(245,241,232,0.92)' }}>
                {fact}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `0 ${pad}px ${pad}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '24px 20px',
            borderRadius: 999,
            background: `linear-gradient(100deg, ${accent.mid}, ${accent.a})`,
            fontFamily: 'sans-serif',
            fontSize: isStory ? 30 : 26,
            fontWeight: 700,
            letterSpacing: 2,
            color: '#0c1130',
            textAlign: 'center',
          }}
        >
          {input.siteUrl ? `${status.cta} en ${input.siteUrl.replace(/^https?:\/\//, '')}` : status.cta}
        </div>
        {contactLine && (
          <div style={{ display: 'flex', fontFamily: 'sans-serif', fontSize: 20, fontWeight: 500, color: 'rgba(245,241,232,0.74)', marginTop: 22 }}>{contactLine}</div>
        )}
      </div>
    </div>
  );
}
