import { buildFiestaDesign, FIESTA, logoNameFromFile } from '../scripts/lib/fiesta-primavera';
import { creativeSiteSchema, parseCreativeSite } from '@/lib/web-sites/creative';
import { isBlockEmpty, LOGOS_VARIANTS, SECTION_PATTERNS } from '@/lib/web-sites/blocks';
import { kitTheme, THEME_KITS, themeProblems, themeSchema } from '@/lib/web-sites/theme';
import { projectPublicSiteSchema, PUBLIC_ACCENTS } from '@/modules/projects/schema';
import { POSTER_PALETTES } from '@/lib/posters/palettes';

describe('Fiesta de la Primavera de Temuco (contenido del script)', () => {
  it('arma un diseño válido para el panel, después de la portada y con el estilo Primavera', () => {
    const design = buildFiestaDesign([]);
    expect(creativeSiteSchema.safeParse(design).success).toBe(true);
    expect(design.enabled).toBe(true);
    expect(design.placement).toBe('afterHero');
    expect(design.theme.primary).toBe('#1f5a3c');
    expect(themeProblems(design.theme)).toEqual([]);
  });

  it('el carrusel de auspiciadores está listo en el editor; sin logos (ni la galería sin fotos) no sale al público', () => {
    const empty = buildFiestaDesign([]);
    const emptyLogos = empty.blocks.find((b) => b.type === 'logos');
    expect(emptyLogos?.hidden).toBe(false);
    expect(emptyLogos && isBlockEmpty(emptyLogos)).toBe(true);
    const gallery = empty.blocks.find((b) => b.type === 'gallery');
    expect(gallery && isBlockEmpty(gallery)).toBe(true);
    const shown = buildFiestaDesign([{ url: 'https://example.com/a.png', name: 'Marca Uno' }]).blocks.find((b) => b.type === 'logos');
    expect(shown && isBlockEmpty(shown)).toBe(false);
    expect(shown?.type === 'logos' && shown.variant).toBe('carousel');
    expect(shown?.type === 'logos' && shown.items[0]?.alt).toBe('Marca Uno');
  });

  it('la historia trae los hitos con fuente, incluido el registro de Temuco en 1928', () => {
    const timeline = buildFiestaDesign([]).blocks.find((b) => b.type === 'timeline');
    const dates = timeline?.type === 'timeline' ? timeline.items.map((item) => item.date) : [];
    expect(dates).toEqual(['1913', '1914', '1917 – 1919', '1928', 'Años 50', '2011 – 2012', 'Hoy']);
  });

  it('los datos del micrositio pasan el mismo esquema que el formulario del panel', () => {
    const parsed = projectPublicSiteSchema.safeParse({
      publicSlug: FIESTA.slug,
      publicSiteEnabled: false,
      publicSiteDesign: buildFiestaDesign([]),
      publicTagline: FIESTA.tagline,
      publicDescription: FIESTA.description,
      publicAccent: FIESTA.accent,
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      showVoteRankingPublic: false,
      showResultsPublic: false,
      sponsorLeadFormEnabled: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('el nombre de la marca sale del archivo', () => {
    expect(logoNameFromFile('Café_del-Sur.png')).toBe('Café del Sur');
  });
});

describe('Motor de páginas: primavera y movimiento', () => {
  it('ubicación «después de la portada» y valor desconocido cae al final', () => {
    expect(parseCreativeSite({ placement: 'afterHero' })?.placement).toBe('afterHero');
    expect(parseCreativeSite({ placement: 'inventada' })?.placement).toBe('after');
  });

  it('acento Primavera disponible en el micrositio y en los afiches', () => {
    expect(PUBLIC_ACCENTS).toContain('primavera');
    expect(POSTER_PALETTES.primavera.deep).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('textura de pétalos y estilo completo «Fiesta de primavera» legibles', () => {
    expect(SECTION_PATTERNS).toContain('petals');
    expect(LOGOS_VARIANTS).toEqual(expect.arrayContaining(['cards', 'carousel']));
    const kit = THEME_KITS.find((k) => k.id === 'spring-fest');
    expect(kit).toBeDefined();
    expect(themeProblems(themeSchema.parse(kitTheme(kit!)))).toEqual([]);
  });
});
