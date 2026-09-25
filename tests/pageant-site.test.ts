import { z } from 'zod';
import { buildSponsorLeadConfirmationEmail } from '@/lib/email/templates';
import { projectCreateSchema, projectPublicSiteSchema, projectUpdateSchema } from '@/modules/projects/schema';
import {
  audienceHero,
  buildPageantView,
  directorCopy,
  galaCalendarUrl,
  galaDateParts,
  initials,
  pageantFaq,
  pageantHighlights,
  pageantJourney,
  registrationProcess,
  splitPackageBenefits,
  sponsorProcess,
  whatsappGreeting,
  whatsappMessageUrl,
  whatsappPackageMessage,
  splitPageantTitle,
  venueMapsUrl,
  type FaqInput,
  type PageantViewSource,
} from '@/lib/events/pageant-site';
import {
  contactEmailField,
  contactWhatsappField,
  formatWhatsappNumber,
  instagramHandleField,
  normalizeInstagramHandle,
  normalizeWhatsappNumber,
  pageantContact,
} from '@/lib/events/pageant-contact';
import { formatCurrency } from '@/lib/chile/tax';

/**
 * Micrositio del certamen: todo lo que la página deriva de los datos reales
 * (título, fechas, recorrido, cifras, preguntas) y el contacto propio de cada
 * certamen (nunca datos fijos de la plataforma).
 */

const NOW = new Date('2026-09-25T15:00:00Z');
const GALA = '2026-12-12T23:30:00.000Z'; // sábado 12 de diciembre, 20:30 en Chile (verano, UTC-3)

describe('Título del certamen', () => {
  it('separa la línea chica, la palabra protagonista y la edición', () => {
    expect(splitPageantTitle('Miss Universo Temuco 2026')).toEqual({ lead: 'Miss Universo', main: 'Temuco', edition: '2026' });
    expect(splitPageantTitle('  Reina de la   Vendimia ')).toEqual({ lead: 'Reina de la', main: 'Vendimia', edition: null });
    expect(splitPageantTitle('Aurora')).toEqual({ lead: '', main: 'Aurora', edition: null });
    expect(splitPageantTitle('Miss 2026')).toEqual({ lead: '', main: 'Miss', edition: '2026' });
  });

  it('arma iniciales para la tarjeta sin foto', () => {
    expect(initials('Antonella Riquelme')).toBe('AR');
    expect(initials('josefa maría sandoval')).toBe('JS');
    expect(initials('Isidora')).toBe('I');
    expect(initials('   ')).toBe('·');
  });
});

describe('Fechas de la gala', () => {
  it('formatea en hora de Chile, reloj de 24 h y día con mayúscula', () => {
    const parts = galaDateParts(GALA);
    expect(parts).toMatchObject({ weekday: 'Sábado', day: '12', month: 'diciembre', year: '2026', time: '20:30', short: '12 de diciembre' });
    expect(parts.long).toBe('Sábado 12 de diciembre de 2026 · 20:30 h');
  });

  it('enlaza a Google Calendar y Maps con los datos del recinto', () => {
    const url = new URL(galaCalendarUrl({ name: 'Miss Universo Temuco', galaDate: GALA, venueName: 'Teatro Municipal', venueAddress: 'Av. Pablo Neruda 01520, Temuco', siteUrl: 'https://x.cl/certamen/mut' }));
    expect(url.searchParams.get('dates')).toBe('20261212T233000Z/20261213T023000Z');
    expect(url.searchParams.get('location')).toBe('Teatro Municipal, Av. Pablo Neruda 01520, Temuco');
    expect(venueMapsUrl('Teatro Municipal', null)).toBe('https://www.google.com/maps/search/?api=1&query=Teatro%20Municipal');
    expect(venueMapsUrl(null, null)).toBeNull();
  });
});

describe('El camino a la corona', () => {
  const base = { registration: null, candidateCount: 0, galaDate: GALA, venueName: 'Teatro Municipal', hasResults: false };
  const statuses = (input: Parameters<typeof pageantJourney>[0], now = NOW) => pageantJourney(input, now).map((s) => s.status);

  it('con la postulación abierta, esa es la etapa actual (aunque ya haya candidatas)', () => {
    expect(statuses({ ...base, registration: { closesAt: '2026-10-19T23:00:00Z' }, candidateCount: 8 })).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    const [registration, , official] = pageantJourney({ ...base, registration: { closesAt: '2026-10-19T23:00:00Z' }, candidateCount: 8 }, NOW);
    expect(registration.detail).toBe('Abierta hasta el 19 de octubre');
    // Una etapa futura no anuncia cifras como si ya hubiera ocurrido.
    expect(official.detail).toBe('Preparación junto al equipo de producción');
  });

  it('avanza según los datos: candidatas elegidas, gala pasada, resultados', () => {
    expect(statuses(base)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    const withCandidates = pageantJourney({ ...base, candidateCount: 8 }, NOW);
    expect(withCandidates.map((s) => s.status)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(withCandidates[2].detail).toBe('8 candidatas elegidas en preparación');
    expect(statuses({ ...base, candidateCount: 8 }, new Date('2026-12-13T12:00:00Z'))).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(statuses({ ...base, candidateCount: 8, hasResults: true })).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(pageantJourney({ ...base, galaDate: null }, NOW)[3].detail).toBe('Fecha por anunciar');
  });
});

describe('Cifras y preguntas: solo con datos reales', () => {
  it('omite las cifras sin dato o en cero', () => {
    expect(pageantHighlights({ candidates: [], sponsorCount: 0, galaDate: null }, NOW)).toEqual([]);
    const highlights = pageantHighlights(
      { candidates: [{ representing: 'Temuco' }, { representing: 'temuco ' }, { representing: 'Villarrica' }, { representing: null }], sponsorCount: 1, galaDate: GALA },
      NOW
    );
    expect(highlights).toEqual([
      { value: '4', label: 'Candidatas oficiales' },
      { value: '2', label: 'Comunas representadas' },
      { value: '79', label: 'Días para la gala' },
      { value: '1', label: 'Marca aliada' },
    ]);
    // Gala ya pasada: no hay "días para la gala".
    expect(pageantHighlights({ candidates: [], sponsorCount: 0, galaDate: '2026-01-01T00:00:00Z' }, NOW)).toEqual([]);
  });

  it('arma las preguntas según lo que el certamen tiene habilitado', () => {
    const none: FaqInput = { name: 'MUT', registration: null, voting: null, tickets: null, galaDate: null, venueName: null, venueAddress: null, sponsorChannel: null, contactEmail: null, formatMoney: formatCurrency };
    expect(pageantFaq(none)).toEqual([]);
    const all = pageantFaq({
      ...none,
      registration: { closesAt: '2026-10-19T23:00:00Z', minAge: 18 },
      voting: { pricePerVote: 1000 },
      tickets: { fromPrice: 15000 },
      galaDate: GALA,
      venueName: 'Teatro Municipal',
      sponsorChannel: 'email',
      contactEmail: 'hola@mut.cl',
    });
    expect(all.map((f) => f.q)).toEqual([
      '¿Cómo postulo al certamen?',
      '¿Cómo funciona la votación del público?',
      '¿Dónde compro entradas para la gala?',
      '¿Cuándo y dónde es la gala final?',
      '¿Cómo puede participar mi marca?',
    ]);
    expect(all[0].a).toContain('al menos 18 años');
    expect(all[0].a).toContain('cierran el 19 de octubre');
    expect(all[1].a).toContain('$1.000');
    expect(all[2].a).toContain('desde $15.000');
    expect(all[3].a).toBe('La gala de MUT se realiza el Sábado 12 de diciembre de 2026 a las 20:30 h, en Teatro Municipal.');
    expect(all[4].a).toContain('hola@mut.cl');
  });

  it('deriva la vista completa del certamen con un solo "ahora"', () => {
    const source: PageantViewSource = {
      slug: 'miss-universo-temuco',
      name: 'Miss Universo Temuco 2026',
      galaDate: GALA,
      venueName: 'Teatro Municipal',
      venueAddress: null,
      contactEmail: null,
      candidates: [{ representing: 'Temuco' }],
      sponsorsByTier: [{ names: ['Clínica', 'Hotel'] }, { names: ['Hotel'] }],
      tickets: null,
      voting: null,
      registration: null,
      results: null,
      sponsorLeadForm: true,
      packages: [],
    };
    const view = buildPageantView(source, NOW, 'https://erp.cl', formatCurrency);
    expect(view.siteUrl).toBe('https://erp.cl/certamen/miss-universo-temuco');
    expect(view.title.main).toBe('Temuco');
    expect(view.highlights.find((h) => h.label === 'Marcas aliadas')?.value).toBe('2');
    expect(view.faq.map((f) => f.q)).toContain('¿Cómo puede participar mi marca?');
    expect(view.calendarUrl).toContain('calendar.google.com');
  });
});

describe('Contacto propio de cada certamen', () => {
  it('normaliza Instagram desde @, URL o usuario', () => {
    expect(normalizeInstagramHandle('@missuniversotemuco')).toBe('missuniversotemuco');
    expect(normalizeInstagramHandle('https://www.instagram.com/miss.temuco/?hl=es')).toBe('miss.temuco');
    expect(normalizeInstagramHandle('instagram.com/mut_2026')).toBe('mut_2026');
    expect(normalizeInstagramHandle('mi usuario!')).toBeNull();
  });

  it('normaliza WhatsApp chileno al formato de wa.me y lo muestra legible', () => {
    expect(normalizeWhatsappNumber('+56 9 8765 4321')).toBe('56987654321');
    expect(normalizeWhatsappNumber('987654321')).toBe('56987654321');
    expect(normalizeWhatsappNumber('123')).toBeNull();
    expect(formatWhatsappNumber('56987654321')).toBe('+56 9 8765 4321');
    expect(formatWhatsappNumber('5422123456789')).toBe('+5422123456789');
  });

  it('solo expone los canales configurados', () => {
    expect(pageantContact({ publicContactEmail: null, publicWhatsapp: null, instagramHandle: null })).toEqual({ email: null, whatsapp: null, instagram: null });
    expect(pageantContact({ publicContactEmail: 'hola@mut.cl', publicWhatsapp: '56987654321', instagramHandle: '@mut' })).toEqual({
      email: 'hola@mut.cl',
      whatsapp: { href: 'https://wa.me/56987654321', label: '+56 9 8765 4321' },
      instagram: { href: 'https://instagram.com/mut', handle: 'mut' },
    });
  });

  it('valida los campos del formulario: vacío es null, inválido explica el formato', () => {
    const schema = z.object({ email: contactEmailField, whatsapp: contactWhatsappField, instagram: instagramHandleField });
    expect(schema.parse({ email: '', whatsapp: '', instagram: '' })).toEqual({ email: null, whatsapp: null, instagram: null });
    expect(schema.parse({})).toEqual({ email: null, whatsapp: null, instagram: null });
    expect(schema.parse({ email: ' Hola@MUT.cl ', whatsapp: '+56 9 1234 5678', instagram: '@mut' })).toEqual({ email: 'hola@mut.cl', whatsapp: '56912345678', instagram: 'mut' });
    const bad = schema.safeParse({ email: 'no-es-correo', whatsapp: '12', instagram: 'a b' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toEqual([
      'El correo de contacto no es válido',
      'El WhatsApp no es un número válido (ej. +56 9 1234 5678)',
      'El Instagram no es un usuario válido (ej. @missuniversotemuco)',
    ]);
  });
});

describe('vistas candidata / sponsor del micrositio', () => {
  it('arma el link de WhatsApp con el mensaje predeterminado codificado', () => {
    const url = whatsappMessageUrl('https://wa.me/56981425816', whatsappGreeting('candidata', 'Miss Universo Las Condes 2026'));
    expect(url).toBe('https://wa.me/56981425816?text=Hola%2C%20quiero%20ser%20candidata%20de%20Miss%20Universo%20Las%20Condes%202026');
    expect(whatsappGreeting('sponsor', 'Miss X')).toBe('Hola, quiero ser sponsor de Miss X');
  });

  it('el mensaje por paquete lleva el nombre en mayúsculas y el precio si existe', () => {
    expect(whatsappPackageMessage('Miss X', 'Diamond Sponsor', '$2.000.000')).toBe('Hola, quiero información sobre el paquete DIAMOND SPONSOR ($2.000.000) de Miss X');
    expect(whatsappPackageMessage('Miss X', 'Gold', null)).toBe('Hola, quiero información sobre el paquete GOLD de Miss X');
  });

  it('el proceso menciona el cupo solo si la convocatoria lo definió', () => {
    expect(registrationProcess({ name: 'Miss X', maxCandidates: 20 })[1].detail).toContain('entre las 20 preseleccionadas');
    expect(registrationProcess({ name: 'Miss X', maxCandidates: null })[1].detail).toContain('si quedaste preseleccionada');
    expect(registrationProcess({ name: 'Miss X', maxCandidates: null })).toHaveLength(3);
  });

  it('separa los beneficios comunes a todos los paquetes de los exclusivos', () => {
    const { common, exclusive } = splitPackageBenefits([
      { id: 'd', benefits: ['Logo como Official Sponsor', 'Mención en escenario', '3 invitaciones VIP'] },
      { id: 'g', benefits: ['logo como official sponsor ', 'Mención en escenario', '1 invitación'] },
    ]);
    expect(common).toEqual(['Logo como Official Sponsor', 'Mención en escenario']);
    expect(exclusive).toEqual({ d: ['3 invitaciones VIP'], g: ['1 invitación'] });
  });

  it('con un solo paquete no hay beneficios "comunes"', () => {
    const { common, exclusive } = splitPackageBenefits([{ id: 'o', benefits: ['A', 'B'] }]);
    expect(common).toEqual([]);
    expect(exclusive.o).toEqual(['A', 'B']);
  });

  it('el proceso de sponsor se adapta a si hay paquetes y WhatsApp', () => {
    expect(sponsorProcess({ hasPackages: true, hasWhatsapp: true })[0].title).toBe('Elige tu paquete');
    expect(sponsorProcess({ hasPackages: false, hasWhatsapp: false })[1].detail).not.toContain('WhatsApp');
  });
});

describe('campos de contacto con null', () => {
  it('un formulario ya validado en el cliente reenvía null y el servidor lo acepta como vacío', () => {
    expect(contactWhatsappField.parse(null)).toBeNull();
    expect(contactEmailField.parse(null)).toBeNull();
    expect(instagramHandleField.parse(null)).toBeNull();
  });
});

describe('formulario de proyecto con WhatsApp', () => {
  const payload = { code: 'MULC', name: 'Miss Universo Las Condes 2026', startDate: '2026-10-01', budgetedIncome: 0, budgetedExpense: 0 };

  it.each(['', '+56 9 8142 5816'])('lo que validó el cliente (WhatsApp "%s") vuelve a validar en el servidor', (publicWhatsapp) => {
    for (const schema of [projectCreateSchema, projectUpdateSchema]) {
      const client = schema.parse({ ...payload, publicWhatsapp });
      expect(schema.safeParse(client).success).toBe(true);
    }
  });

  it('normaliza el WhatsApp al formato de wa.me', () => {
    expect(projectCreateSchema.parse({ ...payload, publicWhatsapp: '+56 9 8142 5816' }).publicWhatsapp).toBe('56981425816');
  });
});

describe('hero por vista (candidata / sponsor)', () => {
  const base = {
    name: 'Miss Universo Las Condes 2026',
    edition: '2026',
    tagline: null,
    maxCandidates: 20,
    registrationClosesLabel: '30 de octubre',
    registrationOpen: true,
    packagePrices: [2000000, 500000, null],
    formatMoney: (n: number) => `$${n.toLocaleString('es-CL')}`,
  };

  it('candidata: convocatoria con cupo y cierre reales', () => {
    const hero = audienceHero('candidata', base);
    expect(hero.kicker).toBe('Convocatoria 2026');
    expect(hero.heading).toBe('Sé la próxima reina');
    expect(hero.pills).toEqual(['Inscripción en línea', 'Solo 20 cupos', 'Hasta el 30 de octubre']);
  });

  it('candidata sin convocatoria abierta no promete inscripción', () => {
    const hero = audienceHero('candidata', { ...base, registrationOpen: false });
    expect(hero.pills).toEqual(['Solo 20 cupos']);
    expect(hero.heading).not.toContain('próxima');
  });

  it('usa la frase del certamen si existe', () => {
    expect(audienceHero('candidata', { ...base, tagline: 'Belleza con propósito' }).lead).toBe('Belleza con propósito');
  });

  it('sponsor: categorías y precio mínimo solo de paquetes con precio público', () => {
    const hero = audienceHero('sponsor', base);
    expect(hero.kicker).toBe('Patrocinios oficiales 2026');
    expect(hero.heading).toBe('Sé sponsor de la corona');
    expect(hero.pills).toEqual(['3 categorías', 'Desde $500.000 + IVA']);
    expect(audienceHero('sponsor', { ...base, packagePrices: [] }).pills).toEqual([]);
  });
});

describe('director del micrositio', () => {
  const site = {
    publicSiteEnabled: false,
    showCandidatesPublic: true,
    showSponsorsPublic: true,
    showVoteRankingPublic: false,
    showResultsPublic: false,
    sponsorLeadFormEnabled: true,
  };

  it('la trayectoria ignora líneas vacías y repetidas; la foto vacía queda en null', () => {
    const parsed = projectPublicSiteSchema.parse({
      ...site,
      directorName: 'Constanza Rey Ortiz',
      directorPhotoUrl: '',
      directorHighlights: ['Director Miss Venusmodel 2024', '', '  ', 'Director Miss Venusmodel 2024', 'Miss Teen Rostro 2018'],
    });
    expect(parsed.directorHighlights).toEqual(['Director Miss Venusmodel 2024', 'Miss Teen Rostro 2018']);
    expect(parsed.directorPhotoUrl).toBeNull();
    expect(parsed.directorRole).toBeNull();
  });
});

describe('director o directora', () => {
  it('nombra la sección según lo elegido y usa "Director" por defecto', () => {
    expect(directorCopy('Directora').invite).toBe('Conoce a la directora');
    expect(directorCopy('Director').invite).toBe('Conoce al director');
    expect(directorCopy(null).label).toBe('Director');
  });

  it('el micrositio acepta solo Director o Directora', () => {
    const base = { publicSiteEnabled: false, showCandidatesPublic: true, showSponsorsPublic: true, showVoteRankingPublic: false, showResultsPublic: false, sponsorLeadFormEnabled: true };
    expect(projectPublicSiteSchema.parse({ ...base, directorTitle: 'Directora' }).directorTitle).toBe('Directora');
    expect(projectPublicSiteSchema.parse(base).directorTitle).toBeNull();
    expect(projectPublicSiteSchema.safeParse({ ...base, directorTitle: 'Jefa' }).success).toBe(false);
  });
});

describe('correo de confirmación al sponsor', () => {
  it('saluda a la marca, nombra el paquete y deja el contacto del certamen', () => {
    const email = buildSponsorLeadConfirmationEmail({
      contactName: 'Ana Pérez',
      companyName: 'Joyas <Sur>',
      projectName: 'Miss Universo Temuco 2026',
      packageName: 'Diamond Sponsor',
      siteUrl: 'https://erp.example.cl/certamen/temuco',
      contact: { email: 'contacto@missuniversotemuco.cl', whatsapp: { href: 'https://wa.me/56989901046', label: '+56 9 8990 1046' } },
    });
    expect(email.subject).toBe('Recibimos tu solicitud de sponsor — Miss Universo Temuco 2026');
    expect(email.html).toContain('Joyas &lt;Sur&gt;');
    expect(email.text).toContain('Paquete de interés: Diamond Sponsor.');
    expect(email.text).toContain('WhatsApp: +56 9 8990 1046');
  });
});
