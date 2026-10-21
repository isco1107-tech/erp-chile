import {
  POSTER_PIECES,
  buildPosterContent,
  cleanPosterNote,
  daysUntilGala,
  pieceAvailability,
  posterCandidateOptions,
  posterGlyphs,
  posterTitle,
  type PosterContentOptions,
  type PosterPiece,
} from '@/lib/posters/pieces';
import { posterSite } from './helpers/poster-site';

const NOW = new Date('2026-10-01T15:00:00Z');
const options = (piece: PosterPiece, extra: Partial<PosterContentOptions> = {}): PosterContentOptions => ({
  piece,
  candidateId: null,
  note: null,
  qr: false,
  origin: 'https://app.test',
  siteUrl: 'https://app.test/certamen/miss-sur',
  now: NOW,
  ...extra,
});

describe('posterTitle', () => {
  it('prefijo corto: antetítulo + última palabra como titular', () => {
    expect(posterTitle('Miss Universo Temuco 2026')).toEqual({ kicker: 'Miss Universo', headline: 'Temuco', edition: '2026' });
  });

  it('prefijo largo: el nombre completo es el titular (nunca una palabra suelta)', () => {
    expect(posterTitle('Reina de la Vendimia de Curicó')).toEqual({ kicker: null, headline: 'Reina de la Vendimia de Curicó', edition: null });
  });

  it('una sola palabra', () => {
    expect(posterTitle('Miss 2026')).toEqual({ kicker: null, headline: 'Miss', edition: '2026' });
  });
});

describe('daysUntilGala', () => {
  it('cuenta días calendario en hora de Chile, no horas', () => {
    // Gala el 12-dic a las 20:30 en Chile (23:30 UTC); "ahora" el 11-dic a las 23:00 en Chile.
    expect(daysUntilGala('2026-12-12T23:30:00.000Z', new Date('2026-12-12T02:00:00Z'))).toBe(1);
    expect(daysUntilGala('2026-12-12T23:30:00.000Z', new Date('2026-12-12T23:59:00Z'))).toBe(0);
    expect(daysUntilGala('2026-12-12T23:30:00.000Z', new Date('2026-12-14T12:00:00Z'))).toBe(-2);
  });
});

describe('pieceAvailability', () => {
  it('con todo configurado, las piezas de antes de la gala están disponibles', () => {
    const availability = pieceAvailability(posterSite(), NOW);
    for (const piece of ['convocatoria', 'gala', 'cuenta-regresiva', 'candidata', 'candidatas', 'votacion', 'auspiciadores', 'auspicio', 'salon-fama'] as const) {
      expect(availability[piece]).toEqual({ available: true });
    }
    expect(availability.resultados.available).toBe(false);
  });

  it('cada pieza sin su dato dice qué configurar', () => {
    const availability = pieceAvailability(
      posterSite({ galaDate: null, candidates: [], sponsorsByTier: [], packages: [], voting: null, pastWinners: [], registration: null, registrationNotice: { state: 'closed', opensAtLabel: null } }),
      NOW,
    );
    for (const piece of POSTER_PIECES) {
      const state = availability[piece];
      expect(state.available).toBe(false);
      if (!state.available) expect(state.reason.length).toBeGreaterThan(10);
    }
  });

  it('una gala que ya pasó no ofrece gala ni cuenta regresiva', () => {
    const availability = pieceAvailability(posterSite(), new Date('2026-12-20T12:00:00Z'));
    expect(availability.gala.available).toBe(false);
    expect(availability['cuenta-regresiva'].available).toBe(false);
  });

  it('la convocatoria "pronto" sí se puede anunciar', () => {
    const availability = pieceAvailability(posterSite({ registration: null, registrationNotice: { state: 'soon', opensAtLabel: '1 de noviembre' } }), NOW);
    expect(availability.convocatoria.available).toBe(true);
  });

  it('el mosaico pide al menos 2 candidatas con foto', () => {
    const site = posterSite();
    const onePhoto = posterSite({ candidates: site.candidates.map((c, i) => ({ ...c, photoUrl: i === 0 ? c.photoUrl : null })) });
    expect(pieceAvailability(onePhoto, NOW).candidatas.available).toBe(false);
  });
});

describe('buildPosterContent: nunca inventa', () => {
  it('una pieza no disponible no produce contenido', () => {
    expect(buildPosterContent(posterSite({ voting: null }), options('votacion'))).toBeNull();
  });

  it('convocatoria abierta: requisitos reales, sin la gala si no hay fecha', () => {
    const content = buildPosterContent(posterSite({ galaDate: null }), options('convocatoria'))!;
    expect(content.eyebrow).toBe('Postulaciones abiertas');
    expect(content.facts.map((f) => f.label)).toEqual(['Edad', 'Postula hasta', 'Cupos']);
    expect(content.facts[0]!.value).toBe('Desde 17 años');
    expect(content.list?.items).toEqual(['Clases de pasarela']);
  });

  it('convocatoria sin cupo ni fecha de cierre no los menciona', () => {
    const site = posterSite();
    const content = buildPosterContent(posterSite({ registration: { ...site.registration!, closesAt: null, maxCandidates: null, benefits: [] } }), options('convocatoria'))!;
    expect(content.facts.map((f) => f.label)).toEqual(['Edad', 'Gran final']);
    expect(content.list).toBeNull();
  });

  it('convocatoria "pronto": dice cuándo abre y no promete un formulario', () => {
    const content = buildPosterContent(posterSite({ registration: null, registrationNotice: { state: 'soon', opensAtLabel: '1 de noviembre' } }), options('convocatoria'))!;
    expect(content.eyebrow).toBe('Postulaciones muy pronto');
    expect(content.facts[0]).toEqual({ label: 'Abren', value: '1 de noviembre' });
    expect(content.cta?.label).toBe('Entérate primero');
  });

  it('candidata: solo datos públicos de la elegida', () => {
    const content = buildPosterContent(posterSite(), options('candidata', { candidateId: 'c2' }))!;
    expect(content.headline).toBe('Antonia Pérez');
    expect(content.kicker).toBe('Candidata N.º 2');
    expect(content.eyebrow).toBe('Finalista');
    expect(content.subline).toBeNull();
    expect(content.hero).toMatchObject({ kind: 'portrait', badge: '2', monogram: 'AP' });
    expect(JSON.stringify(content)).not.toMatch(/rut|edad|email/i);
  });

  it('candidata sin número ni foto: sin insignia y con monograma', () => {
    const content = buildPosterContent(posterSite(), options('candidata', { candidateId: 'c3' }))!;
    expect(content.kicker).toBe('Candidata');
    expect(content.hero).toMatchObject({ kind: 'portrait', photoUrl: null, badge: null, monogram: 'JS' });
  });

  it('una candidata inexistente cae en la primera (nunca en otra empresa)', () => {
    expect(buildPosterContent(posterSite(), options('candidata', { candidateId: 'otra' }))!.headline).toBe('Camila Rojas');
  });

  it('mosaico: todas las candidatas, con o sin foto', () => {
    const content = buildPosterContent(posterSite(), options('candidatas'))!;
    expect(content.hero.kind === 'mosaic' && content.hero.tiles.map((t) => t.title)).toEqual(['Camila Rojas', 'Antonia Pérez', 'Josefa Soto']);
    expect(content.subline).toBe('3 candidatas van por la corona');
  });

  it('auspicio: precios sin "+ IVA" y planes sin precio sin inventarlo', () => {
    const content = buildPosterContent(posterSite(), options('auspicio'))!;
    const items = content.hero.kind === 'names' ? content.hero.groups[0]!.items : [];
    expect(items).toEqual(['Oro — $1.200.000', 'Colaborador']);
    expect(JSON.stringify(content)).not.toContain('IVA');
  });

  it('cuenta regresiva: días reales, singular y "hoy"', () => {
    expect(buildPosterContent(posterSite(), options('cuenta-regresiva'))!.hero).toMatchObject({ kind: 'countdown', value: '72', unit: 'días' });
    expect(buildPosterContent(posterSite(), options('cuenta-regresiva', { now: new Date('2026-12-11T15:00:00Z') }))!.hero).toMatchObject({ value: '1', unit: 'día' });
    expect(buildPosterContent(posterSite(), options('cuenta-regresiva', { now: new Date('2026-12-12T15:00:00Z') }))!.hero).toMatchObject({ value: 'Hoy', unit: '' });
  });

  it('resultados: ganadora y podio en orden, sin importar el orden de llegada', () => {
    const results = [
      { rank: 2, name: 'B', number: 2, representing: null, photoUrl: null },
      { rank: 1, name: 'A', number: 1, representing: 'Temuco', photoUrl: null },
      { rank: 3, name: 'C', number: 3, representing: null, photoUrl: null },
    ];
    const content = buildPosterContent(posterSite({ results }), options('resultados'))!;
    expect(content.headline).toBe('A');
    expect(content.list?.items).toEqual(['2.º lugar · B', '3.er lugar · C']);
  });

  it('sin sitio publicado: sin dirección en el afiche, pero el QR va igual al enlace real de postulación', () => {
    const content = buildPosterContent(posterSite(), options('convocatoria', { siteUrl: null, qr: true }))!;
    expect(content.cta?.displayUrl).toBeNull();
    expect(content.qr?.url).toBe('https://app.test/register/candidate/rg');
  });

  it('el QR solo aparece si se pide y hay adónde llevar', () => {
    expect(buildPosterContent(posterSite(), options('gala'))!.qr).toBeNull();
    expect(buildPosterContent(posterSite(), options('gala', { qr: true }))!.qr?.url).toBe('https://app.test/tickets/tk');
    expect(buildPosterContent(posterSite(), options('auspiciadores', { qr: true, siteUrl: null }))!.qr).toBeNull();
  });

  it('contacto: Instagram y WhatsApp; el correo solo si no hay ninguno de los dos', () => {
    expect(buildPosterContent(posterSite(), options('gala'))!.contact).toEqual(['@misssur', '+56 9 1111 2222']);
    expect(buildPosterContent(posterSite({ instagramHandles: [], whatsapp: null }), options('gala'))!.contact).toEqual(['hola@misssur.cl']);
  });
});

describe('cleanPosterNote', () => {
  it('una línea, sin caracteres de control, máximo 140', () => {
    expect(cleanPosterNote('  Casting\n\tel sábado\u0007  ')).toBe('Casting el sábado');
    expect(cleanPosterNote('x'.repeat(300))).toHaveLength(140);
    expect(cleanPosterNote('   ')).toBeNull();
    expect(cleanPosterNote(null)).toBeNull();
  });
});

describe('posterCandidateOptions / posterGlyphs', () => {
  it('opciones con número cuando lo hay', () => {
    expect(posterCandidateOptions(posterSite()).map((c) => c.label)).toEqual(['N.º 1 · Camila Rojas', 'N.º 2 · Antonia Pérez', 'Josefa Soto']);
  });

  it('los glifos cubren el texto, sus mayúsculas y los dígitos', () => {
    const glyphs = posterGlyphs(buildPosterContent(posterSite(), options('convocatoria', { note: 'Ñandú' }))!);
    for (const char of 'TemucoTEMUCOÑANDÚñ0123456789 ') expect(glyphs).toContain(char);
  });
});
