import { renderToStaticMarkup } from 'react-dom/server';
import { TypographyPicker } from '@/components/projects/TypographyPicker';
import { PAGEANT_FONT_ROLES, PAGEANT_TEXT_BLOCKS } from '@/lib/events/pageant-typography';

const texts = { name: 'Fiesta de la Primavera Temuco', tagline: 'La fiesta vuelve', description: 'La Fiesta de la Primavera fue durante décadas la gran celebración.' };

describe('selector de tipografía del sitio del certamen', () => {
  it('ofrece un selector por familia y por cada bloque de texto', () => {
    const html = renderToStaticMarkup(<TypographyPicker value={{}} onChange={() => undefined} disabled={false} texts={texts} />);
    expect(html.match(/<select/g)?.length).toBe(PAGEANT_FONT_ROLES.length + PAGEANT_TEXT_BLOCKS.length);
    expect(html).toContain('De fábrica: Italiana');
    expect(html).toContain('Igual que «Títulos»: Italiana');
    expect(html).toContain('Igual que «Cursivas y frases»: Cormorant Garamond');
    // Sin cambios no aparece «Volver a la de fábrica» y los bloques quedan plegados.
    expect(html).not.toContain('Volver a la de fábrica');
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it('«Igual que…» muestra la familia general elegida y abre los bloques con letra propia', () => {
    const html = renderToStaticMarkup(<TypographyPicker value={{ display: 'cinzel', lead: 'lora' }} onChange={() => undefined} disabled={false} texts={texts} />);
    expect(html).toContain('Igual que «Títulos»: Cinzel');
    expect(html).toContain('Volver a la de fábrica');
    expect(html).toMatch(/<details[^>]*open/);
    expect(html).toContain('1 con letra propia');
  });

  it('el texto corrido no ofrece letras de título', () => {
    const html = renderToStaticMarkup(<TypographyPicker value={{}} onChange={() => undefined} disabled={false} texts={texts} />);
    const sans = /<select id="typo-sans"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(sans).toContain('Karla');
    expect(sans).not.toContain('Dancing Script');
    const hero = /<select id="typo-heroTitle"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(hero).toContain('Dancing Script');
  });
});

describe('logos del pie en el micrositio', () => {
  it('cada logo con enlace se abre en otra pestaña y sin enlace no se puede tocar', async () => {
    const { PageantSite } = await import('@/components/public/pageant/PageantSite');
    const { buildPageantView } = await import('@/lib/events/pageant-site');
    const { posterSite } = await import('./helpers/poster-site');
    const site = { ...posterSite(), footerPartners: { title: 'Organizan', items: [
      { id: 'a', name: 'Municipalidad', logoUrl: 'https://x.public.blob.vercel-storage.com/pageant-partners/co1/a.png', href: 'https://www.instagram.com/cuenta/' },
      { id: 'b', name: 'Productora', logoUrl: 'https://x.public.blob.vercel-storage.com/pageant-partners/co1/b.png', href: null },
    ] } };
    const html = renderToStaticMarkup(<PageantSite site={site} view={buildPageantView(site, new Date('2026-11-01T12:00:00Z'), 'https://ejemplo.cl', (n: number) => String(n))} />);
    expect(html).toContain('Organizan');
    expect(html).toMatch(/<a class="pgs-partner" href="https:\/\/www.instagram.com\/cuenta\/" target="_blank" rel="noopener noreferrer"[^>]*><img src="[^"]*a.png" alt="Municipalidad"/);
    expect(html).toMatch(/<span class="pgs-partner"[^>]*><img src="[^"]*b.png" alt="Productora"/);
  });
});
