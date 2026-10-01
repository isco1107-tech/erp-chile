import { buildPosterContent, type PosterContentOptions, type PosterPiece } from '@/lib/posters/pieces';
import {
  EMPTY_OVERRIDES,
  applyPosterOverrides,
  campaignOverrides,
  overrideImages,
  pieceHasPhoto,
  posterOverridesSchema,
  type PosterOverridesInput,
} from '@/lib/posters/overrides';
import { posterSite } from './helpers/poster-site';

const NOW = new Date('2026-10-01T15:00:00Z');
const opts = (piece: PosterPiece): PosterContentOptions => ({ piece, candidateId: null, note: null, qr: true, origin: 'https://app.test', siteUrl: 'https://app.test/certamen/miss-sur', now: NOW });
const content = (piece: PosterPiece) => buildPosterContent(posterSite(), opts(piece))!;
const parse = (input: PosterOverridesInput) => posterOverridesSchema.parse(input);
const IMG = 'https://x.public.blob.vercel-storage.com/pageant-posters/co1/p1-1.png';

describe('posterOverridesSchema', () => {
  it('vacío = todo automático', () => {
    expect(parse({})).toEqual(EMPTY_OVERRIDES);
  });

  it('limpia los textos a una línea', () => {
    expect(parse({ texts: { headline: '  Gran\n final \t2026 ' } }).texts.headline).toBe('Gran final 2026');
  });

  it('rechaza textos demasiado largos con un mensaje claro', () => {
    const result = posterOverridesSchema.safeParse({ texts: { headline: 'x'.repeat(81) } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('Titular: máximo 80 caracteres');
  });

  it('acota datos, ítems, logos y escala del titular', () => {
    expect(posterOverridesSchema.safeParse({ facts: Array(5).fill({ label: 'a', value: 'b' }) }).success).toBe(false);
    expect(posterOverridesSchema.safeParse({ list: { title: 't', items: Array(6).fill('x') } }).success).toBe(false);
    expect(posterOverridesSchema.safeParse({ sponsorLogos: Array(9).fill(IMG) }).success).toBe(false);
    expect(posterOverridesSchema.safeParse({ titleScale: 2 }).success).toBe(false);
  });

  it('no acepta campos desconocidos ni bloques que no se pueden ocultar', () => {
    expect(posterOverridesSchema.safeParse({ companyId: 'otra' }).success).toBe(false);
    expect(posterOverridesSchema.safeParse({ hidden: ['headline'] }).success).toBe(false);
  });
});

describe('applyPosterOverrides', () => {
  it('sin personalización no cambia nada (salvo el decor por defecto)', () => {
    const base = content('convocatoria');
    expect(applyPosterOverrides(base, EMPTY_OVERRIDES)).toEqual(base);
  });

  it('un texto propio reemplaza al automático; vacío vuelve al automático', () => {
    const base = content('convocatoria');
    const custom = applyPosterOverrides(base, parse({ texts: { headline: 'Casting Temuco', eyebrow: 'Último llamado', note: 'Trae tu carnet' } }));
    expect(custom.headline).toBe('Casting Temuco');
    expect(custom.eyebrow).toBe('Último llamado');
    expect(custom.note).toBe('Trae tu carnet');
    expect(applyPosterOverrides(base, parse({ texts: { headline: '' } })).headline).toBe(base.headline);
  });

  it('ocultar bloques los saca del afiche', () => {
    const custom = applyPosterOverrides(content('convocatoria'), parse({ hidden: ['kicker', 'edition', 'subline', 'facts', 'list', 'qr', 'contact', 'cta', 'photo'] }));
    expect(custom).toMatchObject({ kicker: null, edition: null, subline: null, facts: [], list: null, qr: null, contact: [], cta: null, backgroundUrl: null });
  });

  it('datos y lista propios reemplazan a los automáticos (sin filas vacías)', () => {
    const custom = applyPosterOverrides(
      content('convocatoria'),
      parse({ facts: [{ label: 'Casting', value: 'Sábado 18' }, { label: '', value: '' }], list: { title: 'Requisitos', items: ['Carnet', '', 'Foto'] } }),
    );
    expect(custom.facts).toEqual([{ label: 'Casting', value: 'Sábado 18' }]);
    expect(custom.list).toEqual({ title: 'Requisitos', items: ['Carnet', 'Foto'], marker: 'check' });
  });

  it('se puede agregar un botón a una pieza que no lo trae', () => {
    const base = content('auspiciadores');
    expect(base.cta).toBeNull();
    expect(applyPosterOverrides(base, parse({ texts: { cta: 'Únete', url: 'misssur.cl' } })).cta).toEqual({ label: 'Únete', displayUrl: 'misssur.cl' });
  });

  it('la foto propia va donde la pieza tiene foto: portada o retrato', () => {
    expect(applyPosterOverrides(content('convocatoria'), parse({ photoUrl: IMG })).backgroundUrl).toBe(IMG);
    const portrait = applyPosterOverrides(content('candidata'), parse({ photoUrl: IMG }));
    expect(portrait.hero.kind === 'portrait' && portrait.hero.photoUrl).toBe(IMG);
    expect(pieceHasPhoto(content('gala'))).toBe(false);
  });

  it('logo, logos de auspiciadores, encuadre y escala van al decor', () => {
    const custom = applyPosterOverrides(content('gala'), parse({ logoUrl: IMG, sponsorLogos: [IMG, IMG], photoPosition: 'top', titleScale: 1.2 }));
    expect(custom.decor).toEqual({ logoUrl: IMG, sponsorLogos: [IMG, IMG], photoPosition: 'top', titleScale: 1.2 });
  });
});

describe('campaignOverrides / overrideImages', () => {
  const full = parse({ texts: { headline: 'X' }, facts: [{ label: 'a', value: 'b' }], hidden: ['qr'], photoUrl: IMG, logoUrl: IMG, sponsorLogos: [IMG], titleScale: 0.9 });

  it('a la campaña solo pasa lo que sirve en todas las piezas', () => {
    expect(campaignOverrides(full)).toEqual({ ...EMPTY_OVERRIDES, logoUrl: IMG, sponsorLogos: [IMG], titleScale: 0.9 });
  });

  it('lista todas las imágenes para validar su origen', () => {
    expect(overrideImages(full)).toEqual([IMG, IMG, IMG]);
  });
});
