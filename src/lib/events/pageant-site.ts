/**
 * Lógica pura del micrositio público de un certamen (`/certamen/{slug}`):
 * todo lo que la página deriva de los datos reales del proyecto — título
 * compuesto, fechas legibles, el recorrido hasta la gala, cifras y preguntas
 * frecuentes. Sin I/O, sin `Date.now()` implícito: `now` entra como
 * parámetro para que el servidor y el navegador rendericen lo mismo (las
 * fechas se formatean una sola vez en el servidor; el navegador puede tener
 * otra versión de ICU y la hidratación no cuadraría).
 *
 * Regla del micrositio: un dato que no existe se omite, nunca se inventa.
 * Cada cifra, etapa o pregunta sale de algo configurado en el proyecto.
 */

const TIME_ZONE = 'America/Santiago';

export interface PageantTitle {
  /** Línea chica sobre el nombre, ej. "Miss Universo". Vacía si el nombre es de una palabra. */
  lead: string;
  /** La palabra protagonista, ej. "Temuco". */
  main: string;
  /** Edición, si el nombre termina en un año (ej. "2026"). */
  edition: string | null;
}

/** "Miss Universo Temuco 2026" → { lead: "Miss Universo", main: "Temuco", edition: "2026" }. */
export function splitPageantTitle(name: string): PageantTitle {
  const clean = name.trim().replace(/\s+/g, ' ');
  const yearMatch = /\s((?:19|20)\d{2})$/.exec(clean);
  const edition = yearMatch ? yearMatch[1] : null;
  const rest = yearMatch ? clean.slice(0, yearMatch.index).trim() : clean;
  const words = rest.split(' ').filter(Boolean);
  if (words.length <= 1) return { lead: '', main: rest || clean, edition };
  return { lead: words.slice(0, -1).join(' '), main: words[words.length - 1], edition };
}

export interface GalaDateParts {
  weekday: string;
  day: string;
  month: string;
  year: string;
  time: string;
  /** "Sábado 12 de diciembre de 2026 · 20:30 h" */
  long: string;
  /** "12 de diciembre" */
  short: string;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** Partes de la fecha de la gala en hora de Chile y reloj de 24 h (sin "p. m.", que cambia entre versiones de ICU). */
export function galaDateParts(iso: string): GalaDateParts {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const weekday = part(parts, 'weekday');
  const day = part(parts, 'day');
  const month = part(parts, 'month');
  const year = part(parts, 'year');
  const time = `${part(parts, 'hour')}:${part(parts, 'minute')}`;
  const capitalized = weekday.charAt(0).toLocaleUpperCase('es-CL') + weekday.slice(1);
  return { weekday: capitalized, day, month, year, time, long: `${capitalized} ${day} de ${month} de ${year} · ${time} h`, short: `${day} de ${month}` };
}

/** "19 de octubre" (hora de Chile). */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', timeZone: TIME_ZONE }).format(new Date(iso));
}

export type JourneyStatus = 'done' | 'current' | 'upcoming';

export interface JourneyStage {
  key: 'registration' | 'casting' | 'official' | 'gala' | 'crowned';
  title: string;
  detail: string;
  status: JourneyStatus;
}

export interface JourneyInput {
  registration: { closesAt: string | null } | null;
  candidateCount: number;
  galaDate: string | null;
  venueName: string | null;
  hasResults: boolean;
}

/**
 * El camino a la corona, en las mismas etapas que modela el sistema
 * (postulación → casting → candidatas oficiales → gala → coronación). La
 * etapa "actual" sale de los datos: resultados publicados, gala pasada,
 * postulación abierta (manda aunque ya haya candidatas oficiales: el
 * llamado sigue vigente) o candidatas ya elegidas.
 */
export function pageantJourney(input: JourneyInput, now: Date): JourneyStage[] {
  const galaPassed = input.galaDate ? new Date(input.galaDate).getTime() <= now.getTime() : false;
  const current: JourneyStage['key'] = input.hasResults
    ? 'crowned'
    : galaPassed
      ? 'gala'
      : input.registration
        ? 'registration'
        : input.candidateCount > 0
          ? 'official'
          : 'casting';
  const order: JourneyStage['key'][] = ['registration', 'casting', 'official', 'gala', 'crowned'];
  const currentIndex = order.indexOf(current);

  const stages: Array<Omit<JourneyStage, 'status'>> = [
    {
      key: 'registration',
      title: 'Postulación',
      detail: input.registration
        ? input.registration.closesAt
          ? `Abierta hasta el ${shortDate(input.registration.closesAt)}`
          : 'Abierta: postula en línea'
        : 'Formulario en línea con folio al instante',
    },
    { key: 'casting', title: 'Casting', detail: 'La organización revisa cada ficha y cita a quienes avanzan' },
    {
      key: 'official',
      title: 'Candidatas oficiales',
      detail:
        input.candidateCount > 0 && currentIndex >= order.indexOf('official')
          ? `${input.candidateCount} ${input.candidateCount === 1 ? 'candidata elegida' : 'candidatas elegidas'} en preparación`
          : 'Preparación junto al equipo de producción',
    },
    {
      key: 'gala',
      title: 'Gala final',
      detail: input.galaDate ? `${galaDateParts(input.galaDate).short}${input.venueName ? ` · ${input.venueName}` : ''}` : 'Fecha por anunciar',
    },
    { key: 'crowned', title: 'Coronación', detail: input.hasResults ? 'Tenemos nueva reina' : 'Una de ellas recibe la corona' },
  ];

  return stages.map((stage, index) => ({
    ...stage,
    status: input.hasResults ? 'done' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

export interface PageantHighlight {
  value: string;
  label: string;
}

export interface HighlightInput {
  candidates: Array<{ representing: string | null }>;
  sponsorCount: number;
  galaDate: string | null;
}

/** Cifras de la cinta bajo "El certamen": solo las que tienen dato real y valor > 0. */
export function pageantHighlights(input: HighlightInput, now: Date): PageantHighlight[] {
  const highlights: PageantHighlight[] = [];
  const count = input.candidates.length;
  if (count > 0) highlights.push({ value: String(count), label: count === 1 ? 'Candidata oficial' : 'Candidatas oficiales' });
  const places = new Set(input.candidates.map((c) => c.representing?.trim().toLocaleLowerCase('es-CL')).filter((p): p is string => Boolean(p)));
  if (places.size > 1) highlights.push({ value: String(places.size), label: 'Comunas representadas' });
  if (input.galaDate) {
    const days = Math.ceil((new Date(input.galaDate).getTime() - now.getTime()) / 86_400_000);
    if (days > 0) highlights.push({ value: String(days), label: days === 1 ? 'Día para la gala' : 'Días para la gala' });
  }
  if (input.sponsorCount > 0) highlights.push({ value: String(input.sponsorCount), label: input.sponsorCount === 1 ? 'Marca aliada' : 'Marcas aliadas' });
  return highlights;
}

export interface FaqInput {
  name: string;
  registration: { closesAt: string | null; minAge: number } | null;
  voting: { pricePerVote: number } | null;
  tickets: { fromPrice: number | null } | null;
  galaDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  sponsorChannel: 'form' | 'email' | null;
  contactEmail: string | null;
  formatMoney: (amount: number) => string;
}

export interface PageantFaq {
  q: string;
  a: string;
}

/** Preguntas frecuentes armadas solo con lo que el certamen tiene habilitado. */
export function pageantFaq(input: FaqInput): PageantFaq[] {
  const faq: PageantFaq[] = [];
  if (input.registration) {
    faq.push({
      q: '¿Cómo postulo al certamen?',
      a: `Completa el formulario en línea desde este sitio: tus datos, tu perfil y dos fotografías recientes (rostro y cuerpo completo). Debes tener al menos ${input.registration.minAge} años. Al enviarlo recibes tu folio al instante.${input.registration.closesAt ? ` Las postulaciones cierran el ${shortDate(input.registration.closesAt)}.` : ''}`,
    });
  }
  if (input.voting) {
    faq.push({
      q: '¿Cómo funciona la votación del público?',
      a: `Eliges a tu candidata, la cantidad de votos y pagas en línea. Cada voto cuesta ${input.formatMoney(input.voting.pricePerVote)} y se suma a su marcador apenas se confirma el pago.`,
    });
  }
  if (input.tickets) {
    faq.push({
      q: '¿Dónde compro entradas para la gala?',
      a: `En línea, desde este mismo sitio${input.tickets.fromPrice != null ? `, desde ${input.formatMoney(input.tickets.fromPrice)}` : ''}. Tu entrada llega por correo con un código QR que se escanea en el acceso.`,
    });
  }
  if (input.galaDate || input.venueName) {
    const when = input.galaDate ? `el ${galaDateParts(input.galaDate).long.replace(' · ', ' a las ')}` : '';
    const where = input.venueName ? `en ${input.venueName}${input.venueAddress ? ` (${input.venueAddress})` : ''}` : '';
    faq.push({ q: '¿Cuándo y dónde es la gala final?', a: `La gala de ${input.name} se realiza ${[when, where].filter(Boolean).join(', ')}.` });
  }
  if (input.sponsorChannel === 'form') {
    faq.push({ q: '¿Cómo puede participar mi marca?', a: 'Déjanos tus datos en la sección de auspicios y el equipo comercial te envía la propuesta con los planes disponibles.' });
  } else if (input.sponsorChannel === 'email' && input.contactEmail) {
    faq.push({ q: '¿Cómo puede participar mi marca?', a: `Escríbenos a ${input.contactEmail} y te enviamos la propuesta comercial del certamen.` });
  }
  return faq;
}

/** Enlace "Agregar a Google Calendar" para la gala (duración estimada: 3 horas). */
export function galaCalendarUrl(input: { name: string; galaDate: string; venueName: string | null; venueAddress: string | null; siteUrl: string }): string {
  const start = new Date(input.galaDate);
  const end = new Date(start.getTime() + 3 * 3_600_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Gala ${input.name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: input.siteUrl,
    location: [input.venueName, input.venueAddress].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Búsqueda del recinto en Google Maps (sin API key ni coordenadas guardadas). */
export function venueMapsUrl(venueName: string | null, venueAddress: string | null): string | null {
  const query = [venueName, venueAddress].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** Iniciales para la tarjeta de una candidata sin foto ("Antonella Riquelme" → "AR"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('es-CL');
}

/** Lo que el micrositio necesita del certamen para derivar su vista (estructuralmente, `PublicPageantSite` lo cumple). */
export interface PageantViewSource {
  slug: string;
  name: string;
  galaDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  contactEmail: string | null;
  candidates: Array<{ representing: string | null }>;
  sponsorsByTier: Array<{ names: string[] }>;
  tickets: { fromPrice: number | null } | null;
  voting: { pricePerVote: number } | null;
  registration: { closesAt: string | null; minAge: number } | null;
  results: unknown[] | null;
  sponsorLeadForm: boolean;
  packages: unknown[];
}

export interface PageantView {
  title: PageantTitle;
  gala: GalaDateParts | null;
  registrationClosesLabel: string | null;
  journey: JourneyStage[];
  highlights: PageantHighlight[];
  faq: PageantFaq[];
  calendarUrl: string | null;
  mapsUrl: string | null;
  siteUrl: string;
}

/** Todo lo derivado del micrositio, calculado una vez en el servidor con el mismo `now`. */
export function buildPageantView(site: PageantViewSource, now: Date, baseUrl: string, formatMoney: (amount: number) => string): PageantView {
  const siteUrl = `${baseUrl}/certamen/${site.slug}`;
  const sponsorCount = new Set(site.sponsorsByTier.flatMap((tier) => tier.names)).size;
  const hasSponsorSection = sponsorCount > 0 || site.packages.length > 0 || site.sponsorLeadForm;
  return {
    title: splitPageantTitle(site.name),
    gala: site.galaDate ? galaDateParts(site.galaDate) : null,
    registrationClosesLabel: site.registration?.closesAt ? shortDate(site.registration.closesAt) : null,
    journey: pageantJourney(
      { registration: site.registration, candidateCount: site.candidates.length, galaDate: site.galaDate, venueName: site.venueName, hasResults: Boolean(site.results?.length) },
      now
    ),
    highlights: pageantHighlights({ candidates: site.candidates, sponsorCount, galaDate: site.galaDate }, now),
    faq: pageantFaq({
      name: site.name,
      registration: site.registration,
      voting: site.voting,
      tickets: site.tickets,
      galaDate: site.galaDate,
      venueName: site.venueName,
      venueAddress: site.venueAddress,
      sponsorChannel: !hasSponsorSection ? null : site.sponsorLeadForm ? 'form' : site.contactEmail ? 'email' : null,
      contactEmail: site.contactEmail,
      formatMoney,
    }),
    calendarUrl: site.galaDate ? galaCalendarUrl({ name: site.name, galaDate: site.galaDate, venueName: site.venueName, venueAddress: site.venueAddress, siteUrl }) : null,
    mapsUrl: venueMapsUrl(site.venueName, site.venueAddress),
    siteUrl,
  };
}
