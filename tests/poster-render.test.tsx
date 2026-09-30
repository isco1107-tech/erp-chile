import { renderToStaticMarkup } from 'react-dom/server';
import { posterDisplayText, renderPosterElement, POSTER_FORMATS, POSTER_SIZES, type PosterInput } from '@/modules/projects/services/poster-render';

/**
 * Afiche de convocatoria: se arma con los mismos datos reales del micrositio.
 * Estos tests cubren la regla central — nunca inventar un dato que no existe —
 * y que las tres variantes (postulaciones abiertas / pronto / sin novedad)
 * muestran el estado real, nunca uno que no corresponda. La fluidez real del
 * render (satori/`ImageResponse`) se comprobó a mano, no en Jest (ver PR).
 */

const base: PosterInput = {
  name: 'Miss Universo Temuco/Loncoche',
  tagline: 'La noche más esperada del sur de Chile',
  galaDate: '2026-12-12T23:30:00.000Z',
  venueName: 'Teatro Municipal de Temuco',
  coverDataUrl: null,
  accent: 'gold',
  registration: { minAge: 18, closesAt: '2026-10-19T23:00:00.000Z' },
  registrationOpensAtLabel: null,
  contactEmail: null,
  whatsappLabel: '+56 9 8990 1046',
  instagramHandle: 'missuniversetemuco',
  siteUrl: 'https://missuniversotemuco.com',
  format: 'feed',
};

const html = (input: PosterInput) => renderToStaticMarkup(renderPosterElement(input));

describe('posterDisplayText', () => {
  it('junta solo lo que necesita la fuente de display (nombre): nunca el resto del afiche', () => {
    expect(posterDisplayText({ name: 'Miss Universo Temuco/Loncoche' })).toBe('MISS UNIVERSOTemuco/Loncoche');
    expect(posterDisplayText({ name: 'Aurora 2026' })).toBe('Aurora2026');
  });
});

describe('renderPosterElement', () => {
  it('con inscripción abierta muestra el estado real: edad, fecha límite y sede, sin inventar nada más', () => {
    const out = html(base);
    expect(out).toContain('Postulaciones abiertas');
    expect(out).toContain('Desde 18 años');
    expect(out).toContain('Hasta el 19 de octubre');
    expect(out).toContain('Gala');
    expect(out).toContain('Teatro Municipal de Temuco');
    expect(out).toContain('Postula ahora en missuniversotemuco.com');
    expect(out).not.toContain('Postulaciones próximamente');
    expect(out).not.toContain('Conoce el certamen');
  });

  it('sin inscripción pero con aviso de apertura muestra "próximamente" y la fecha que avisa el sitio, nunca "abiertas"', () => {
    const out = html({ ...base, registration: null, registrationOpensAtLabel: '19 de octubre' });
    expect(out).toContain('Postulaciones próximamente');
    expect(out).toContain('Abren el 19 de octubre');
    expect(out).toContain('Entérate primero');
    expect(out).not.toContain('Postulaciones abiertas');
  });

  it('sin inscripción ni aviso cae al genérico "Conoce el certamen": nunca finge una convocatoria abierta', () => {
    const out = html({ ...base, registration: null, registrationOpensAtLabel: null });
    expect(out).toContain('Conoce el certamen');
    expect(out).not.toContain('Postulaciones abiertas');
    expect(out).not.toContain('Postulaciones próximamente');
  });

  it('sin fecha de gala ni sede, esas líneas simplemente no aparecen (nunca un placeholder inventado)', () => {
    const out = html({ ...base, galaDate: null, venueName: null });
    expect(out).not.toContain('Gala');
    expect(out).not.toContain('Teatro Municipal');
  });

  it('sin dirección pública usable, el llamado a la acción muestra el contacto real en vez de un enlace muerto', () => {
    const out = html({ ...base, siteUrl: null });
    expect(out).not.toContain('missuniversotemuco.com');
    expect(out).toContain('Postula ahora');
    expect(out).toContain('@missuniversetemuco');
    expect(out).toContain('+56 9 8990 1046');
  });

  it('sin ningún contacto configurado, no hay línea de contacto (no se inventa un canal)', () => {
    const out = html({ ...base, siteUrl: null, whatsappLabel: null, instagramHandle: null, contactEmail: null });
    expect(out).not.toContain('@missuniversetemuco');
  });

  it('con solo correo (sin Instagram ni WhatsApp), muestra el correo', () => {
    const out = html({ ...base, siteUrl: null, whatsappLabel: null, instagramHandle: null, contactEmail: 'contacto@certamen.cl' });
    expect(out).toContain('contacto@certamen.cl');
  });

  it('sin foto de portada no se agrega ninguna imagen de fondo', () => {
    expect(html(base)).not.toContain('<img');
  });

  it('con foto de portada la incluye como fondo', () => {
    const out = html({ ...base, coverDataUrl: 'data:image/jpeg;base64,AAAA' });
    expect(out).toContain('<img');
    expect(out).toContain('data:image/jpeg;base64,AAAA');
  });

  it('sin frase principal (tagline), esa línea no aparece', () => {
    expect(html({ ...base, tagline: null })).not.toContain('La noche más esperada');
  });

  it('cada formato tiene su tamaño de Instagram real y renderiza sin lanzar', () => {
    for (const format of POSTER_FORMATS) {
      const { width, height } = POSTER_SIZES[format];
      expect(width).toBe(1080);
      expect(height).toBeGreaterThan(0);
      expect(() => html({ ...base, format })).not.toThrow();
    }
  });

  it('cada color de acento renderiza sin lanzar', () => {
    for (const accent of ['gold', 'violet', 'rose', 'cyan', 'emerald'] as const) {
      expect(() => html({ ...base, accent })).not.toThrow();
    }
  });
});
