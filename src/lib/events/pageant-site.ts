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
      a: `Completa el formulario de inscripción de este sitio con tus datos de contacto y cuéntanos por qué quieres participar. Debes tener al menos ${input.registration.minAge} años. Al enviarlo recibes tu folio al instante y la organización te avisa por llamado, correo o WhatsApp el resultado de tu preselección.${input.registration.closesAt ? ` Las postulaciones cierran el ${shortDate(input.registration.closesAt)}.` : ''}`,
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
    faq.push({ q: '¿Cómo puede participar mi marca?', a: 'Elige tu paquete en la sección para sponsors y déjanos tus datos en el formulario: la organización te contacta para coordinar tu patrocinio.' });
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
export function buildPageantView(
  site: PageantViewSource & { customDomain?: string | null },
  now: Date,
  baseUrl: string,
  formatMoney: (amount: number) => string
): PageantView {
  // Con dominio propio verificado, esa es la dirección del sitio (compartir, calendario, SEO).
  const siteUrl = site.customDomain ? `https://${site.customDomain}` : `${baseUrl}/certamen/${site.slug}`;
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

// ---------------------------------------------------------------------------
// Vistas "Quiero ser candidata" / "Ser sponsor"
// ---------------------------------------------------------------------------

export type PageantAudience = 'candidata' | 'sponsor';

/** Enlace de WhatsApp con un mensaje listo para enviar (`href` es el `https://wa.me/<dígitos>` del certamen). */
export function whatsappMessageUrl(href: string, text: string): string {
  return `${href}?text=${encodeURIComponent(text)}`;
}

/** Mensaje predeterminado del botón de WhatsApp, según quién visita el sitio. */
export function whatsappGreeting(audience: PageantAudience, pageantName: string): string {
  return audience === 'sponsor' ? `Hola, quiero ser sponsor de ${pageantName}` : `Hola, quiero ser candidata de ${pageantName}`;
}

/** Mensaje para consultar por un paquete de patrocinio puntual. */
export function whatsappPackageMessage(pageantName: string, packageName: string, priceLabel: string | null): string {
  return `Hola, quiero información sobre el paquete ${packageName.toLocaleUpperCase('es-CL')}${priceLabel ? ` (${priceLabel})` : ''} de ${pageantName}`;
}

export interface ProcessStep {
  title: string;
  detail: string;
}

/** "Así es el proceso" de la inscripción. El cupo solo se menciona si la convocatoria lo definió. */
export function registrationProcess(input: { name: string; maxCandidates: number | null }): ProcessStep[] {
  const shortlist = input.maxCandidates ? `si quedaste entre las ${input.maxCandidates} preseleccionadas` : 'si quedaste preseleccionada';
  return [
    { title: 'Completa tu inscripción', detail: 'Llena el formulario con tus datos de contacto y cuéntanos por qué quieres participar.' },
    { title: 'Espera tu preselección', detail: `La organización revisa las postulaciones y te avisa por llamado, correo o WhatsApp ${shortlist}.` },
    { title: 'Vive el certamen', detail: `Forma parte del camino a la corona de ${input.name}.` },
  ];
}

/** "Así funciona tu alianza" para sponsors: el paso de pago depende de cómo se coordina. */
export function sponsorProcess(input: { hasPackages: boolean; hasWhatsapp: boolean }): ProcessStep[] {
  return [
    input.hasPackages
      ? { title: 'Elige tu paquete', detail: 'Según el nivel de exposición que buscas para tu marca.' }
      : { title: 'Cuéntanos de tu marca', detail: 'Déjanos tus datos y armamos una propuesta a tu medida.' },
    {
      title: 'Coordina tu patrocinio',
      detail: input.hasWhatsapp ? 'Envía el formulario o escríbenos por WhatsApp y coordinamos el acuerdo y el pago.' : 'Envía el formulario y la organización te contacta para coordinar el acuerdo y el pago.',
    },
    { title: 'Activa tu marca', detail: 'Tu logo, tus redes y tu empresa se integran al camino a la corona.' },
  ];
}

/**
 * Separa los beneficios que comparten TODOS los paquetes ("Incluye en todos
 * los paquetes") de los propios de cada uno ("Exclusivo Diamond"). Con un
 * solo paquete no hay nada "común": todo es de ese paquete.
 */
export function splitPackageBenefits<T extends { id: string; benefits: string[] }>(packages: T[]): { common: string[]; exclusive: Record<string, string[]> } {
  const norm = (b: string) => b.trim().toLocaleLowerCase('es-CL');
  const common =
    packages.length > 1 ? packages[0].benefits.filter((benefit) => packages.every((p) => p.benefits.some((other) => norm(other) === norm(benefit)))) : [];
  const commonKeys = new Set(common.map(norm));
  const exclusive: Record<string, string[]> = {};
  for (const p of packages) exclusive[p.id] = p.benefits.filter((benefit) => !commonKeys.has(norm(benefit)));
  return { common, exclusive };
}

export const DIRECTOR_TITLES = ['Director', 'Directora'] as const;
export type DirectorTitle = (typeof DIRECTOR_TITLES)[number];

/** Textos de la sección del director según cómo se nombra ("Conoce a la directora"). */
export function directorCopy(title: DirectorTitle | null): { label: DirectorTitle; invite: string; lead: string; word: string } {
  return title === 'Directora'
    ? { label: 'Directora', invite: 'Conoce a la directora', lead: 'Conoce a la', word: 'directora' }
    : { label: 'Director', invite: 'Conoce al director', lead: 'Conoce al', word: 'director' };
}

export interface AudienceHero {
  /** Línea chica sobre el título ("Convocatoria 2026"). */
  kicker: string;
  /** Llamado principal ("Sé la próxima reina"). */
  heading: string;
  lead: string;
  /** Datos cortos en pastillas; solo los que existen en el certamen. */
  pills: string[];
}

/**
 * Textos del hero según la vista, al estilo de la convocatoria de
 * referencia ("Sé la próxima…" / "Sé sponsor de la corona"). Las pastillas
 * salen de datos reales: cupo, cierre, cantidad de paquetes y precio mínimo.
 */
export function audienceHero(
  audience: PageantAudience,
  input: {
    name: string;
    edition: string | null;
    tagline: string | null;
    maxCandidates: number | null;
    registrationClosesLabel: string | null;
    registrationOpen: boolean;
    packagePrices: Array<number | null>;
    formatMoney: (amount: number) => string;
  }
): AudienceHero {
  const edition = input.edition ? ` ${input.edition}` : '';
  if (audience === 'sponsor') {
    const prices = input.packagePrices.filter((p): p is number => p != null);
    const pills = [
      input.packagePrices.length > 0 ? `${input.packagePrices.length} ${input.packagePrices.length === 1 ? 'categoría' : 'categorías'}` : null,
      prices.length > 0 ? `Desde ${input.formatMoney(Math.min(...prices))} + IVA` : null,
    ].filter((p): p is string => Boolean(p));
    return {
      kicker: `Patrocinios oficiales${edition}`,
      heading: 'Sé sponsor de la corona',
      lead: `Asocia tu marca a ${input.name} y acompaña a las candidatas en el camino a la corona.`,
      pills,
    };
  }
  const pills = [
    input.registrationOpen ? 'Inscripción en línea' : null,
    input.maxCandidates ? `Solo ${input.maxCandidates} cupos` : null,
    input.registrationOpen && input.registrationClosesLabel ? `Hasta el ${input.registrationClosesLabel}` : null,
  ].filter((p): p is string => Boolean(p));
  return {
    kicker: input.registrationOpen ? `Convocatoria${edition}` : `Temporada${edition}`.trim(),
    heading: input.registrationOpen ? 'Sé la próxima reina' : 'El camino a la corona',
    lead:
      input.tagline ??
      (input.registrationOpen
        ? `Inscríbete y vive el camino a la corona de ${input.name} desde adentro.`
        : `Conoce a las candidatas y vive ${input.name} desde adentro.`),
    pills,
  };
}
