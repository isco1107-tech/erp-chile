import { pageantSeoDescription, pageantSeoTitle, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, type PageantSeoInput } from '@/lib/events/pageant-seo';
import { robotsTxt, sitemapXml } from '@/lib/hosting/seo-files';

const BASE: PageantSeoInput = {
  name: 'Miss Universo Temuco 2026',
  tagline: null,
  description: null,
  galaDate: null,
  venueName: null,
  candidateCount: 0,
  hasTickets: false,
  registrationOpen: false,
};

describe('pageantSeoTitle', () => {
  it('sin nada publicado, es solo el nombre (no inventa términos)', () => {
    expect(pageantSeoTitle(BASE)).toBe('Miss Universo Temuco 2026');
  });

  it('suma solo lo que el certamen tiene publicado', () => {
    expect(pageantSeoTitle({ ...BASE, candidateCount: 12, hasTickets: true })).toBe('Miss Universo Temuco 2026 | Candidatas, Entradas');
    expect(pageantSeoTitle({ ...BASE, registrationOpen: true })).toBe('Miss Universo Temuco 2026 | Postulaciones abiertas');
  });

  it('incluye la fecha de la gala en hora de Chile', () => {
    // 12 dic 2026 23:30 UTC = 20:30 en Chile (verano austral): sigue siendo el 12.
    expect(pageantSeoTitle({ ...BASE, galaDate: '2026-12-12T23:30:00.000Z' })).toBe('Miss Universo Temuco 2026 | Gala 12 de diciembre');
  });

  it('nunca pasa de 60 caracteres: salta el término que no cabe', () => {
    const title = pageantSeoTitle({ ...BASE, candidateCount: 5, hasTickets: true, registrationOpen: true, galaDate: '2026-12-12T23:30:00.000Z' });
    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
    expect(title.startsWith('Miss Universo Temuco 2026 | Candidatas, Entradas')).toBe(true);
  });

  it('un nombre ya largo queda intacto en vez de cortarse', () => {
    const name = 'Certamen Nacional de Belleza y Talento Región de La Araucanía 2026';
    expect(pageantSeoTitle({ ...BASE, name, candidateCount: 3 })).toBe(name);
  });
});

describe('pageantSeoDescription', () => {
  it('con lema y gala: lema + fecha y recinto', () => {
    const text = pageantSeoDescription({ ...BASE, tagline: 'La corona te espera', galaDate: '2026-12-12T23:30:00.000Z', venueName: 'Teatro Municipal de Temuco' });
    expect(text).toBe('La corona te espera. Gala el 12 de diciembre de 2026 en Teatro Municipal de Temuco.');
  });

  it('sin lema usa la primera oración de la descripción, no media frase', () => {
    const text = pageantSeoDescription({ ...BASE, description: 'Certamen oficial de la región. Reúne a jóvenes de toda La Araucanía durante seis meses de preparación.' });
    expect(text).toBe('Certamen oficial de la región.');
  });

  it('sin lema ni descripción se arma con los hechos que existen', () => {
    const text = pageantSeoDescription({ ...BASE, candidateCount: 8, hasTickets: true, galaDate: '2026-12-12T23:30:00.000Z' });
    expect(text).toBe('Sitio oficial de Miss Universo Temuco 2026: conoce a las candidatas, compra tus entradas. Gala el 12 de diciembre de 2026.');
  });

  it('sin ningún dato extra, solo dice que es el sitio oficial', () => {
    expect(pageantSeoDescription(BASE)).toBe('Sitio oficial de Miss Universo Temuco 2026.');
  });

  it('nunca pasa de 160 caracteres y corta en límite de palabra', () => {
    const long = 'Palabra '.repeat(60);
    const text = pageantSeoDescription({ ...BASE, tagline: long });
    expect(text.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/Palab…$/);
  });

  it('si el lema solo llena el largo, omite el dato de la gala en vez de cortarlo', () => {
    const tagline = 'Una noche inolvidable con las mejores candidatas de toda la región de La Araucanía, un jurado de lujo y espectáculo en vivo';
    const text = pageantSeoDescription({ ...BASE, tagline, galaDate: '2026-12-12T23:30:00.000Z', venueName: 'Teatro Municipal de Temuco' });
    expect(text.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX);
    expect(text).toBe(`${tagline}.`);
  });
});

describe('robotsTxt', () => {
  it('permite todo, excluye las rutas con token y apunta al sitemap del propio dominio', () => {
    const text = robotsTxt({ domain: 'missuniversotemuco.cl', indexable: true });
    expect(text).toContain('User-agent: *\nAllow: /\n');
    for (const path of ['/register/', '/tickets/', '/votar/', '/pagar/']) expect(text).toContain(`Disallow: ${path}\n`);
    expect(text).toContain('Sitemap: https://missuniversotemuco.cl/sitemap.xml');
    expect(text).not.toContain('erp.aether.cl');
  });

  it('un sitio no indexable bloquea todo', () => {
    expect(robotsTxt({ domain: 'minegocio.cl', indexable: false })).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('sitemapXml', () => {
  it('lista la raíz como URL absoluta https, sin repetir', () => {
    const xml = sitemapXml({ domain: 'missuniversotemuco.cl', paths: ['/', '', '/'] });
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain('<loc>https://missuniversotemuco.cl</loc>');
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it('incluye las páginas internas y escapa caracteres especiales', () => {
    const xml = sitemapXml({ domain: 'minegocio.cl', paths: ['/', '/servicios', 'contacto', '/a&b'] });
    expect(xml).toContain('<loc>https://minegocio.cl/servicios</loc>');
    expect(xml).toContain('<loc>https://minegocio.cl/contacto</loc>');
    expect(xml).toContain('<loc>https://minegocio.cl/a&amp;b</loc>');
  });
});
