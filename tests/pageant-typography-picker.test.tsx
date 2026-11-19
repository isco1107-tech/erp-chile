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
