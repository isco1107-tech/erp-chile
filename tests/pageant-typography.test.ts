import {
  PAGEANT_FONT_KEYS,
  PAGEANT_FONT_ROLES,
  PAGEANT_TEXT_BLOCKS,
  PAGEANT_TEXT_FONT_KEYS,
  effectiveFont,
  fontsFor,
  pageantFontInfo,
  pageantTypographyCss,
  pageantTypographySchema,
  parsePageantTypography,
  fontSizeAdjust,
  widthScale,
} from '@/lib/events/pageant-typography';
import { PAGEANT_FONT_METRICS } from '@/lib/events/pageant-font-metrics';
import { projectPublicSiteSchema } from '@/modules/projects/schema';
import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';

describe('tipografía del micrositio del certamen', () => {
  it('sin elección no agrega estilos: el sitio se ve como siempre', () => {
    expect(pageantTypographyCss({})).toBe('');
    expect(parsePageantTypography(null)).toEqual({});
    expect(parsePageantTypography('italiana')).toEqual({});
    expect(parsePageantTypography(['x'])).toEqual({});
  });

  it('una familia general cambia su variable y las cifras siguen a las cursivas', () => {
    const css = pageantTypographyCss({ display: 'playfair', serif: 'lora' });
    expect(css).toContain('.pgs.pgs-typo { --display: var(--wsf-playfair)');
    expect(css).toContain('--serif: var(--wsf-lora)');
    // Sin cifra propia, las cifras usan la cursiva elegida, medida con cifras.
    expect(css).toContain('--numeric: var(--wsf-lora)');
    expect(css).toMatch(/--numeric-adjust: (none|0\.\d{3});/);
  });

  it('un bloque usa sus propios selectores, más específicos que la hoja base', () => {
    const css = pageantTypographyCss({ lead: 'merriweather', dropCap: 'cinzel', titleAccent: 'dancing' });
    expect(css).toContain('.pgs.pgs-typo .pgs-prose p.is-lead { font-family: var(--wsf-merriweather)');
    expect(css).toContain('.pgs.pgs-typo .pgs-prose p.is-lead::first-letter { font-family: var(--wsf-cinzel)');
    expect(css).toContain('.pgs.pgs-typo .pgs-h2 em, .pgs.pgs-typo .pgs-h3 em { font-family: var(--wsf-dancing)');
    // Sin familias generales elegidas no se tocan las variables.
    expect(css).not.toMatch(/--display|--serif|--sans/);
  });

  it('las cifras propias reemplazan la variable --numeric', () => {
    expect(pageantTypographyCss({ numbers: 'bebas', serif: 'lora' })).toContain('--numeric: var(--wsf-bebas)');
  });

  it('la hoja va con comillas simples y solo con fuentes de la lista (nada escrito por el usuario)', () => {
    const all = Object.fromEntries([...PAGEANT_FONT_ROLES, ...PAGEANT_TEXT_BLOCKS].map((entry) => [entry.key, fontsFor(entry.key)[3]]));
    const css = pageantTypographyCss(all);
    expect(css).not.toContain('"');
    expect(css).not.toMatch(/<|\/\*|@import|url\(/i);
    const sneaky = pageantTypographyCss({ display: 'inter; } body { display: none' } as unknown as Record<string, string>);
    expect(sneaky).toBe('');
  });

  it('cada selector de bloque existe en la hoja base del sitio', () => {
    for (const block of PAGEANT_TEXT_BLOCKS) {
      for (const selector of block.selectors) {
        const firstClass = selector.match(/\.pgs-[a-z-]+/)?.[0];
        expect(firstClass && PAGEANT_SITE_STYLES.includes(firstClass)).toBeTruthy();
      }
    }
  });

  it('al guardar rechaza bloques y fuentes desconocidas, y letras de título en texto largo', () => {
    expect(pageantTypographySchema.safeParse({ heroTitle: 'cinzel', lead: 'lora' }).success).toBe(true);
    expect(pageantTypographySchema.safeParse({ inventado: 'lora' }).success).toBe(false);
    expect(pageantTypographySchema.safeParse({ heroTitle: 'comic-sans' }).success).toBe(false);
    const script = pageantTypographySchema.safeParse({ sans: 'dancing' });
    expect(script.success).toBe(false);
    expect(script.error?.issues[0]?.message).toContain('solo para títulos');
    expect(pageantTypographySchema.safeParse({ prose: 'italiana' }).success).toBe(false);
  });

  it('al leer ignora clave por clave lo que ya no es válido', () => {
    expect(parsePageantTypography({ heroTitle: 'cinzel', lead: 'no-existe', sans: 'dancing', otra: 'lora' })).toEqual({ heroTitle: 'cinzel' });
  });

  it('el texto largo solo ofrece fuentes legibles en párrafos', () => {
    expect(fontsFor('sans')).toEqual(PAGEANT_TEXT_FONT_KEYS);
    expect(fontsFor('prose')).not.toContain('dancing');
    expect(fontsFor('heroTitle')).toEqual(PAGEANT_FONT_KEYS);
    expect(PAGEANT_TEXT_FONT_KEYS).toContain('karla');
    expect(PAGEANT_TEXT_FONT_KEYS).not.toContain('italiana');
  });

  it('«Igual que…» muestra la fuente heredada de su familia', () => {
    expect(effectiveFont({}, 'sectionTitles')).toBe('italiana');
    expect(effectiveFont({ display: 'cinzel' }, 'sectionTitles')).toBe('cinzel');
    expect(effectiveFont({ display: 'cinzel', sectionTitles: 'lora' }, 'sectionTitles')).toBe('lora');
    expect(effectiveFont({}, 'tagline')).toBe('cormorant');
    expect(effectiveFont({}, 'kickers')).toBe('karla');
  });

  it('cada fuente tiene nombre y su variable cargada', () => {
    for (const key of PAGEANT_FONT_KEYS) {
      const info = pageantFontInfo(key);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.css.length).toBeGreaterThan(0);
    }
    expect(new Set(PAGEANT_FONT_KEYS).size).toBe(PAGEANT_FONT_KEYS.length);
  });

  it('el formulario del sitio la guarda validada y vacía por defecto', () => {
    const base = {
      publicSiteEnabled: false,
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      showVoteRankingPublic: false,
      showResultsPublic: false,
      sponsorLeadFormEnabled: false,
    };
    expect(projectPublicSiteSchema.parse(base).publicTypography).toEqual({});
    expect(projectPublicSiteSchema.parse({ ...base, publicTypography: { lead: 'lora' } }).publicTypography).toEqual({ lead: 'lora' });
    expect(projectPublicSiteSchema.safeParse({ ...base, publicTypography: { lead: 'x' } }).success).toBe(false);
  });
});

describe('compensación de ancho en la hoja base', () => {
  it('toda familia del sitio viaja con su font-size-adjust (también tras el atajo font:)', () => {
    const families = PAGEANT_SITE_STYLES.match(/font-family: var\(--(display|serif|numeric|sans)\);/g) ?? [];
    const adjusted = PAGEANT_SITE_STYLES.match(/font-family: var\(--(display|serif|numeric|sans)\); font-size-adjust: var\(--\1-adjust, none\);/g) ?? [];
    expect(families.length).toBeGreaterThan(40);
    expect(adjusted.length).toBe(families.length);
    const shorthands = PAGEANT_SITE_STYLES.match(/font: [^;{}]*var\(--[a-z]+\);/g) ?? [];
    const shorthandsAdjusted = PAGEANT_SITE_STYLES.match(/font: [^;{}]*var\(--([a-z]+)\); font-size-adjust: var\(--\1-adjust, none\);/g) ?? [];
    expect(shorthands.length).toBeGreaterThan(0);
    expect(shorthandsAdjusted.length).toBe(shorthands.length);
  });
});

describe('compensación de ancho por fuente', () => {
  it('la de fábrica contra sí misma no se toca', () => {
    expect(fontSizeAdjust('italiana', 'italiana', 'mixed')).toBe('none');
    expect(fontSizeAdjust('karla', 'karla', 'mixed', true)).toBe('none');
  });

  it('una más ancha se achica en proporción a su ancho real (con margen)', () => {
    const scale = widthScale('unbounded', 'italiana', 'mixed');
    expect(scale).toBeLessThan(0.75);
    const m = PAGEANT_FONT_METRICS;
    const expected = Math.min(m.italiana.text / m.unbounded.text, m.italiana.caps / m.unbounded.caps) * 0.95;
    expect(scale).toBeCloseTo(expected, 5);
    expect(fontSizeAdjust('unbounded', 'italiana', 'mixed')).toBe((m.unbounded.xHeight * scale).toFixed(3));
  });

  it('una bastante más angosta no se agranda', () => {
    expect(widthScale('bebas', 'italiana', 'mixed')).toBe(1);
    expect(fontSizeAdjust('bebas', 'italiana', 'mixed')).toBe('none');
  });

  it('las etiquetas en negrita también se comparan en negrita', () => {
    expect(widthScale('montserrat', 'karla', 'caps', true)).toBeLessThanOrEqual(widthScale('montserrat', 'karla', 'caps', false));
  });

  it('toda fuente elegible tiene métricas medidas', () => {
    for (const key of PAGEANT_FONT_KEYS) {
      const metric = PAGEANT_FONT_METRICS[key];
      expect(metric.xHeight).toBeGreaterThan(0.2);
      expect(metric.text).toBeGreaterThan(0.2);
      expect(metric.bold.caps).toBeGreaterThan(0.2);
    }
  });

  it('cada regla de bloque lleva su compensación y las secciones del estudio no la heredan', () => {
    const css = pageantTypographyCss({ names: 'cinzel' });
    expect(css).toMatch(/\.pgs-card-name[^{]*\{ font-family: var\(--wsf-cinzel\)[^;]*; font-size-adjust: 0\.\d{3}; \}/);
    expect(css).toContain('.pgs.pgs-typo .ws-root { font-size-adjust: none; }');
  });
});
