import { formatCurrency } from '@/lib/chile/tax';
import { galaDateParts, shortDate, splitPageantTitle } from '@/lib/events/pageant-site';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Piezas de la campaña de un certamen y su contenido. Regla del motor: un
 * afiche dice SOLO lo que el certamen tiene configurado. Si una pieza
 * necesita un dato que falta (fecha de la gala, candidatas con foto,
 * auspiciadores confirmados…), la pieza no está disponible y `reason` dice
 * qué configurar; dentro de una pieza, el dato opcional que falta se omite.
 * Nada de esto toca la base de datos: todo sale del mismo ensamblado público
 * que alimenta el micrositio (`getPageantSitePreview`).
 */

export const POSTER_PIECES = [
  'convocatoria',
  'gala',
  'cuenta-regresiva',
  'candidata',
  'candidatas',
  'votacion',
  'auspiciadores',
  'auspicio',
  'resultados',
  'salon-fama',
] as const;
export type PosterPiece = (typeof POSTER_PIECES)[number];

export const POSTER_PIECE_INFO: Record<PosterPiece, { label: string; description: string }> = {
  convocatoria: { label: 'Convocatoria', description: 'Llamado a postular, con requisitos y fecha límite.' },
  gala: { label: 'Gran final', description: 'Fecha, hora y lugar de la gala, con entradas si están a la venta.' },
  'cuenta-regresiva': { label: 'Cuenta regresiva', description: 'Los días que faltan para la gala.' },
  candidata: { label: 'Candidata', description: 'Presentación de una candidata oficial, con su foto y número.' },
  candidatas: { label: 'Candidatas oficiales', description: 'Todas las candidatas en un mosaico.' },
  votacion: { label: 'Votación', description: 'Llamado a votar por la favorita del público.' },
  auspiciadores: { label: 'Agradecimiento', description: 'Gracias a los auspiciadores confirmados, por categoría.' },
  auspicio: { label: 'Busca auspiciadores', description: 'Invitación a empresas, con los planes de auspicio.' },
  resultados: { label: 'Resultados', description: 'La ganadora y el podio de la gala.' },
  'salon-fama': { label: 'Salón de la fama', description: 'Ganadoras de ediciones anteriores.' },
};

export function isPosterPiece(value: string | null | undefined): value is PosterPiece {
  return (POSTER_PIECES as readonly string[]).includes(value ?? '');
}

export type PieceAvailability = { available: true } | { available: false; reason: string };

const TIME_ZONE = 'America/Santiago';

/** Número de día calendario en hora de Chile (para restar fechas sin que la hora del día mueva el resultado). */
function chileDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const [y, m, d] = parts.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

/** Días calendario (en Chile) que faltan para la gala: 0 = hoy, negativo = ya pasó. */
export function daysUntilGala(galaIso: string, now: Date): number {
  return chileDayNumber(new Date(galaIso)) - chileDayNumber(now);
}

const MOSAIC_MIN = 2;

function candidatesWithPhoto(site: PublicPageantSite) {
  return site.candidates.filter((candidate) => candidate.photoUrl);
}

export function pieceAvailability(site: PublicPageantSite, now: Date): Record<PosterPiece, PieceAvailability> {
  const ok: PieceAvailability = { available: true };
  const no = (reason: string): PieceAvailability => ({ available: false, reason });
  const days = site.galaDate ? daysUntilGala(site.galaDate, now) : null;
  const sponsorNames = site.sponsorsByTier.reduce((sum, tier) => sum + tier.names.length, 0);

  return {
    convocatoria: !site.candidateSide
      ? no('Requiere el módulo de candidatas.')
      : site.registration || site.registrationNotice?.state === 'soon'
        ? ok
        : no('La convocatoria está cerrada. Ábrela (o ponle fecha de apertura) en Convocatoria.'),
    gala: days === null ? no('Configura la fecha de la gala en el sitio público.') : days < 0 ? no('La gala ya pasó.') : ok,
    'cuenta-regresiva': days === null ? no('Configura la fecha de la gala en el sitio público.') : days < 0 ? no('La gala ya pasó.') : ok,
    candidata: site.candidates.length > 0 ? ok : no('Aún no hay candidatas oficiales visibles en el sitio público.'),
    candidatas:
      candidatesWithPhoto(site).length >= MOSAIC_MIN ? ok : no('Se necesitan al menos 2 candidatas oficiales con foto visibles en el sitio público.'),
    votacion: site.voting ? ok : no('La votación del público no está abierta.'),
    auspiciadores: sponsorNames > 0 ? ok : no('Aún no hay auspiciadores confirmados visibles en el sitio público.'),
    auspicio: site.packages.length > 0 ? ok : no('Crea los planes de auspicio del certamen.'),
    resultados: site.results && site.results.length > 0 ? ok : no('Los resultados se publican después de la gala.'),
    'salon-fama': site.pastWinners.length > 0 ? ok : no('Agrega ganadoras de ediciones anteriores en el sitio público.'),
  };
}

/** Candidatas que se pueden elegir para la pieza "Candidata", en el orden del sitio. */
export function posterCandidateOptions(site: PublicPageantSite): Array<{ id: string; label: string; hasPhoto: boolean }> {
  return site.candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.number !== null ? `N.º ${candidate.number} · ${candidate.name}` : candidate.name,
    hasPhoto: Boolean(candidate.photoUrl),
  }));
}

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------

export interface PosterTile {
  photoUrl: string | null;
  title: string;
  caption: string | null;
  badge: string | null;
}

export type PosterHero =
  /** Sin pieza central: manda el título, sobre la portada si la hay. */
  | { kind: 'cover' }
  | { kind: 'date'; weekday: string; day: string; month: string; year: string; time: string }
  | { kind: 'countdown'; value: string; unit: string; caption: string }
  | { kind: 'portrait'; photoUrl: string | null; badge: string | null; monogram: string }
  | { kind: 'mosaic'; tiles: PosterTile[]; total: number }
  | { kind: 'names'; groups: Array<{ label: string | null; items: string[] }> };

export interface PosterFact {
  label: string;
  value: string;
}

export interface PosterContent {
  piece: PosterPiece;
  /** Rótulo corto de la pieza ("Postulaciones abiertas"). */
  eyebrow: string;
  /** Línea chica sobre el titular ("Miss Universo", "Candidata N.º 7"). */
  kicker: string | null;
  headline: string;
  edition: string | null;
  subline: string | null;
  hero: PosterHero;
  facts: PosterFact[];
  list: { title: string; items: string[]; marker: 'check' | 'rank' } | null;
  /** Mensaje propio escrito en el generador (opcional, no se guarda). */
  note: string | null;
  cta: { label: string; displayUrl: string | null } | null;
  qr: { url: string; caption: string } | null;
  contact: string[];
  /** Nombre del certamen, para mastheads y pies cuando el titular es otra cosa. */
  brand: string;
  organizer: string;
  /** Foto de fondo (portada del certamen) para las piezas que la usan. */
  backgroundUrl: string | null;
}

export interface PosterContentOptions {
  piece: PosterPiece;
  candidateId: string | null;
  note: string | null;
  qr: boolean;
  /** Origen público donde viven los enlaces (dominio propio verificado o la plataforma). */
  origin: string;
  /** Dirección del micrositio, o `null` si no está publicado. */
  siteUrl: string | null;
  now: Date;
}

/** Texto propio del generador: una línea, sin caracteres de control, hasta 140 caracteres. */
export function cleanPosterNote(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return value || null;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function contactLine(site: PublicPageantSite): string[] {
  const items: string[] = [];
  if (site.instagramHandle) items.push(`@${site.instagramHandle}`);
  if (site.whatsapp) items.push(site.whatsapp.label);
  if (items.length === 0 && site.contactEmail) items.push(site.contactEmail);
  return items;
}

function rankLabel(rank: number): string {
  return rank === 1 || rank === 3 ? `${rank}.er lugar` : `${rank}.º lugar`;
}

function candidateNumber(number: number | null): string | null {
  return number !== null ? `N.º ${number}` : null;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toLocaleUpperCase('es-CL');
}

/**
 * Título del certamen para el afiche. Con un prefijo corto ("Miss Universo")
 * va como antetítulo y la última palabra como titular grande, igual que el
 * micrositio; con un prefijo largo ("Reina de la Vendimia de"), partirlo así
 * dejaría un titular de una palabra suelta: va el nombre completo.
 */
export function posterTitle(name: string): { kicker: string | null; headline: string; edition: string | null } {
  const title = splitPageantTitle(name);
  if (!title.lead) return { kicker: null, headline: title.main, edition: title.edition };
  if (title.lead.split(' ').length <= 2) return { kicker: title.lead, headline: title.main, edition: title.edition };
  return { kicker: null, headline: `${title.lead} ${title.main}`, edition: title.edition };
}

/**
 * Arma el contenido de una pieza. Devuelve `null` si la pieza no está
 * disponible para este certamen (ver `pieceAvailability`).
 */
export function buildPosterContent(site: PublicPageantSite, options: PosterContentOptions): PosterContent | null {
  if (!pieceAvailability(site, options.now)[options.piece].available) return null;

  const title = posterTitle(site.name);
  const gala = site.galaDate ? galaDateParts(site.galaDate) : null;
  const siteDisplay = options.siteUrl ? displayUrl(options.siteUrl) : null;
  const absolute = (href: string) => (href.startsWith('http') ? href : `${options.origin}${href}`);
  const qr = (url: string | null, caption: string) => (options.qr && url ? { url, caption } : null);

  const base = {
    piece: options.piece,
    kicker: title.kicker,
    headline: title.headline,
    edition: title.edition,
    subline: site.tagline,
    facts: [] as PosterFact[],
    list: null as PosterContent['list'],
    note: options.note,
    contact: contactLine(site),
    brand: site.name,
    organizer: site.organizer,
    backgroundUrl: site.coverImageUrl,
  };

  const galaFact = gala ? { label: 'Gran final', value: gala.short } : null;
  const venueFact = site.venueName ? { label: 'Lugar', value: site.venueName } : null;

  switch (options.piece) {
    case 'convocatoria': {
      const registration = site.registration;
      const url = registration ? absolute(registration.href) : options.siteUrl;
      const facts: PosterFact[] = [];
      if (registration) {
        facts.push({ label: 'Edad', value: `Desde ${registration.minAge} años` });
        if (registration.closesAt) facts.push({ label: 'Postula hasta', value: shortDate(registration.closesAt) });
        if (registration.maxCandidates) facts.push({ label: 'Cupos', value: `${registration.maxCandidates} candidatas` });
      } else if (site.registrationNotice?.opensAtLabel) {
        facts.push({ label: 'Abren', value: site.registrationNotice.opensAtLabel });
      }
      if (galaFact) facts.push(galaFact);
      const benefits = registration?.benefits.filter(Boolean) ?? [];
      return {
        ...base,
        eyebrow: registration ? 'Postulaciones abiertas' : 'Postulaciones muy pronto',
        hero: { kind: 'cover' },
        facts,
        list: benefits.length > 0 ? { title: 'Qué incluye', items: benefits, marker: 'check' } : null,
        cta: { label: registration ? 'Postula ahora' : 'Entérate primero', displayUrl: siteDisplay },
        qr: qr(url, registration ? 'Escanea y postula' : 'Escanea para más información'),
      };
    }

    case 'gala':
    case 'cuenta-regresiva': {
      const tickets = site.tickets;
      const url = tickets ? absolute(tickets.href) : options.siteUrl;
      const facts: PosterFact[] = [];
      if (options.piece === 'cuenta-regresiva' && gala) facts.push({ label: 'Gran final', value: `${gala.short} · ${gala.time} h` });
      if (venueFact) facts.push(venueFact);
      if (tickets?.fromPrice) facts.push({ label: 'Entradas', value: `Desde ${formatCurrency(tickets.fromPrice)}` });
      const days = daysUntilGala(site.galaDate!, options.now);
      const hero: PosterHero =
        options.piece === 'gala'
          ? { kind: 'date', weekday: gala!.weekday, day: gala!.day, month: gala!.month, year: gala!.year, time: `${gala!.time} h` }
          : days === 0
            ? { kind: 'countdown', value: 'Hoy', unit: '', caption: 'es la gran final' }
            : { kind: 'countdown', value: String(days), unit: days === 1 ? 'día' : 'días', caption: 'para la gran final' };
      return {
        ...base,
        eyebrow: options.piece === 'gala' ? 'Gran final' : days === 0 ? 'Llegó el día' : 'Cuenta regresiva',
        hero,
        facts,
        cta: { label: tickets ? 'Compra tu entrada' : 'No te la pierdas', displayUrl: siteDisplay },
        qr: qr(url, tickets ? 'Escanea y compra tu entrada' : 'Escanea para más información'),
      };
    }

    case 'candidata': {
      const candidate = site.candidates.find((c) => c.id === options.candidateId) ?? site.candidates[0]!;
      const url = site.voting ? absolute(site.voting.href) : options.siteUrl;
      return {
        ...base,
        eyebrow: candidate.isWinner ? 'Ganadora' : candidate.isFinalist ? 'Finalista' : 'Candidata oficial',
        kicker: candidateNumber(candidate.number) ? `Candidata ${candidateNumber(candidate.number)}` : 'Candidata',
        headline: candidate.name,
        edition: null,
        subline: candidate.representing,
        hero: { kind: 'portrait', photoUrl: candidate.photoUrl, badge: candidate.number !== null ? String(candidate.number) : null, monogram: initialsOf(candidate.name) },
        facts: site.voting ? [{ label: 'Cada voto', value: formatCurrency(site.voting.pricePerVote) }] : [],
        cta: { label: site.voting ? 'Vota por ella' : 'Conócela', displayUrl: siteDisplay },
        qr: qr(url, site.voting ? 'Escanea y vota' : 'Escanea para conocerla'),
        backgroundUrl: null,
      };
    }

    case 'candidatas':
    case 'votacion': {
      // Todas las candidatas, con o sin foto (sin foto va su monograma): nadie queda fuera del mosaico.
      const tiles: PosterTile[] = site.candidates.map((c) => ({ photoUrl: c.photoUrl, title: c.name, caption: c.representing, badge: c.number !== null ? String(c.number) : null }));
      const isVote = options.piece === 'votacion';
      const url = isVote && site.voting ? absolute(site.voting.href) : options.siteUrl;
      const facts: PosterFact[] = [];
      if (isVote && site.voting) facts.push({ label: 'Cada voto', value: formatCurrency(site.voting.pricePerVote) });
      if (!isVote && galaFact) facts.push(galaFact);
      return {
        ...base,
        eyebrow: isVote ? 'Votación del público' : 'Candidatas oficiales',
        subline: isVote ? 'Vota por tu favorita' : `${site.candidates.length} ${site.candidates.length === 1 ? 'candidata' : 'candidatas'} van por la corona`,
        hero: tiles.length > 0 ? { kind: 'mosaic', tiles, total: site.candidates.length } : { kind: 'cover' },
        facts,
        cta: { label: isVote ? 'Vota ahora' : 'Conócelas', displayUrl: siteDisplay },
        qr: qr(url, isVote ? 'Escanea y vota' : 'Escanea para conocerlas'),
        backgroundUrl: null,
      };
    }

    case 'auspiciadores':
      return {
        ...base,
        eyebrow: 'Gracias a quienes nos acompañan',
        subline: null,
        hero: { kind: 'names', groups: site.sponsorsByTier.filter((tier) => tier.names.length > 0).map((tier) => ({ label: tier.label, items: tier.names })) },
        cta: null,
        qr: qr(options.siteUrl, 'Escanea y conoce el certamen'),
        backgroundUrl: null,
      };

    case 'auspicio': {
      const url = options.siteUrl ?? site.whatsapp?.href ?? null;
      const items = site.packages.map((pkg) => (pkg.price !== null ? `${pkg.name} — ${formatCurrency(pkg.price)}` : pkg.name));
      const facts: PosterFact[] = [];
      if (galaFact) facts.push(galaFact);
      if (venueFact) facts.push(venueFact);
      return {
        ...base,
        eyebrow: 'Auspicia el certamen',
        subline: site.sponsorNote ?? site.tagline,
        hero: { kind: 'names', groups: [{ label: 'Planes de auspicio', items }] },
        facts,
        cta: { label: 'Conversemos', displayUrl: siteDisplay },
        qr: qr(url, 'Escanea y conversemos'),
      };
    }

    case 'resultados': {
      const results = [...site.results!].sort((a, b) => a.rank - b.rank);
      const winner = results[0]!;
      const others = results.slice(1, 5).map((r) => `${rankLabel(r.rank)} · ${r.name}`);
      return {
        ...base,
        eyebrow: 'Resultados oficiales',
        kicker: site.name,
        headline: winner.name,
        edition: null,
        subline: winner.representing,
        hero: { kind: 'portrait', photoUrl: winner.photoUrl, badge: null, monogram: initialsOf(winner.name) },
        list: others.length > 0 ? { title: 'Podio', items: others, marker: 'rank' } : null,
        cta: options.siteUrl ? { label: 'Revive la gala', displayUrl: siteDisplay } : null,
        qr: qr(options.siteUrl, 'Escanea para ver los resultados'),
        backgroundUrl: null,
      };
    }

    case 'salon-fama': {
      const tiles: PosterTile[] = site.pastWinners.map((w) => ({
        photoUrl: w.photoUrl,
        title: w.name,
        caption: [w.title, w.year !== null ? String(w.year) : null].filter(Boolean).join(' · ') || null,
        badge: null,
      }));
      return {
        ...base,
        eyebrow: 'Salón de la fama',
        subline: null,
        hero: { kind: 'mosaic', tiles, total: tiles.length },
        cta: options.siteUrl ? { label: 'Conoce su historia', displayUrl: siteDisplay } : null,
        qr: qr(options.siteUrl, 'Escanea y conoce el certamen'),
        backgroundUrl: null,
      };
    }
  }
}

/** Todo el texto que puede dibujar el afiche: la fuente se recorta exactamente a estos caracteres. */
export function posterGlyphs(content: PosterContent): string {
  const parts: string[] = [content.eyebrow, content.kicker ?? '', content.headline, content.edition ?? '', content.subline ?? '', content.note ?? '', content.brand, content.organizer];
  for (const fact of content.facts) parts.push(fact.label, fact.value);
  if (content.list) parts.push(content.list.title, ...content.list.items);
  if (content.cta) parts.push(content.cta.label, content.cta.displayUrl ?? '');
  if (content.qr) parts.push(content.qr.caption);
  parts.push(...content.contact);
  const hero = content.hero;
  if (hero.kind === 'date') parts.push(hero.weekday, hero.day, hero.month, hero.year, hero.time);
  if (hero.kind === 'countdown') parts.push(hero.value, hero.unit, hero.caption);
  if (hero.kind === 'portrait') parts.push(hero.badge ?? '', hero.monogram);
  if (hero.kind === 'mosaic') for (const tile of hero.tiles) parts.push(tile.title, tile.caption ?? '', tile.badge ?? '', `+${hero.total}`);
  if (hero.kind === 'names') for (const group of hero.groups) parts.push(group.label ?? '', ...group.items);
  const text = parts.join(' ');
  // Mayúsculas también: los estilos ponen en mayúsculas rótulos y titulares.
  return Array.from(new Set(Array.from(`${text}${text.toLocaleUpperCase('es-CL')}0123456789+·—.,:/-N.º`))).join('');
}
