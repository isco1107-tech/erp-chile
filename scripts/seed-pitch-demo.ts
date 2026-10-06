/**
 * Datos ficticios para capturas comerciales: certámenes, candidatas (ficha y
 * tablero de casting) y auspicios. SOLO base local. Corre DESPUÉS de
 * seed-manual-demo.ts.
 *
 *   npx tsx --conditions=react-server scripts/seed-pitch-demo.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { formatRut } from '../src/lib/chile/rut';
import { contactCreateSchema } from '../src/modules/contacts/schema';
import { createContact } from '../src/modules/contacts/services/contacts.service';
import { projectCreateSchema } from '../src/modules/projects/schema';
import { createProject } from '../src/modules/projects/services/projects.service';
import { candidateCreateSchema, candidatePresentationSchema } from '../src/modules/candidates/schema';
import { createCandidate, updateCandidateStatus } from '../src/modules/candidates/services/candidates.service';
import { updateCandidatePresentation } from '../src/modules/candidates/services/casting.service';
import { deliverableCreateSchema, sponsorshipContractCreateSchema, sponsorshipPackageSchema, sponsorshipPaymentSchema } from '../src/modules/sponsorships/schema';
import { addDeliverable, createSponsorshipContract, toggleDeliverable, updateSponsorshipPayment } from '../src/modules/sponsorships/services/sponsorships.service';
import { createPackage } from '../src/modules/sponsorships/services/packages.service';
import { MANUAL_DEMO_ADMIN_EMAIL } from './manual-demo-constants';

function assertLocalDatabase(): void {
  const host = new URL(process.env.DATABASE_URL ?? 'http://x').hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error('Solo corre contra una base local.');
    process.exit(1);
  }
}

function rut(body: number): string {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return formatRut(`${body}-${rest === 11 ? '0' : rest === 10 ? 'K' : String(rest)}`);
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

type Status = 'APPLICANT' | 'UNDER_REVIEW' | 'CALLED_TO_CASTING' | 'OFFICIAL_CANDIDATE' | 'FINALIST' | 'WINNER' | 'WITHDRAWN' | 'REJECTED';

const CANDIDATES: { full: string; stage: string; birth: string; comuna: string; status: Status; height: number; dress: string; shoe: string; ig: string; repr: string; occ: string; num: number | null; contract: boolean; docs: number; pub: boolean; motive: string; cause: string }[] = [
  { full: 'Valentina Paz Morales Ríos', stage: 'Valentina Morales', birth: '2003-05-14', comuna: 'Curicó', status: 'FINALIST', height: 174, dress: '36', shoe: '38', ig: '@valen.morales', repr: 'Curicó', occ: 'Estudiante de Enología', num: 1, contract: true, docs: 4, pub: true, motive: 'Quiero representar a las mujeres del campo y mostrar el orgullo de nuestra tierra vitivinícola.', cause: 'Becas para hijas de temporeras' },
  { full: 'Camila Andrea Soto Pérez', stage: 'Camila Soto', birth: '2002-11-02', comuna: 'Talca', status: 'FINALIST', height: 171, dress: '38', shoe: '38', ig: '@camisoto.cl', repr: 'Talca', occ: 'Técnico en Enfermería', num: 2, contract: true, docs: 4, pub: true, motive: 'Creo en el servicio a la comunidad y quiero que mi voz llegue más lejos.', cause: 'Salud rural y donación de sangre' },
  { full: 'Isidora Belén Rojas Fuentes', stage: 'Isidora Rojas', birth: '2004-02-21', comuna: 'Molina', status: 'OFFICIAL_CANDIDATE', height: 176, dress: '36', shoe: '39', ig: '@isi.rojasf', repr: 'Molina', occ: 'Modelo y estudiante de Derecho', num: 3, contract: true, docs: 4, pub: true, motive: 'Es un sueño de familia: mi abuela fue reina de la vendimia en 1974.', cause: 'Reciclaje en ferias libres' },
  { full: 'Fernanda Ignacia Díaz Lagos', stage: 'Fernanda Díaz', birth: '2001-08-30', comuna: 'Linares', status: 'OFFICIAL_CANDIDATE', height: 169, dress: '38', shoe: '37', ig: '@ferdiaz.lagos', repr: 'Linares', occ: 'Ingeniera Agrónoma', num: 4, contract: true, docs: 3, pub: true, motive: 'Quiero unir la tecnología agrícola con la tradición de la vendimia.', cause: 'Huertos escolares' },
  { full: 'Antonia Sofía Herrera Vidal', stage: 'Antonia Herrera', birth: '2003-12-09', comuna: 'Constitución', status: 'OFFICIAL_CANDIDATE', height: 173, dress: '36', shoe: '38', ig: '@anto.herrera', repr: 'Constitución', occ: 'Estudiante de Pedagogía', num: 5, contract: false, docs: 3, pub: true, motive: 'Me apasiona enseñar y quiero inspirar a niñas de zonas costeras.', cause: 'Lectura en escuelas rurales' },
  { full: 'Josefa Catalina Muñoz Araya', stage: 'Josefa Muñoz', birth: '2002-04-18', comuna: 'San Clemente', status: 'CALLED_TO_CASTING', height: 172, dress: '38', shoe: '38', ig: '@josefa.munoz', repr: 'San Clemente', occ: 'Diseñadora gráfica', num: null, contract: false, docs: 3, pub: false, motive: 'Quiero aportar mi mirada creativa a la identidad del certamen.', cause: 'Arte comunitario' },
  { full: 'Martina Emilia Castro Núñez', stage: 'Martina Castro', birth: '2005-01-27', comuna: 'Teno', status: 'CALLED_TO_CASTING', height: 175, dress: '34', shoe: '39', ig: '@marti.castro', repr: 'Teno', occ: 'Estudiante de Kinesiología', num: null, contract: false, docs: 2, pub: false, motive: 'El deporte me cambió la vida y quiero que más jóvenes lo vivan.', cause: 'Deporte inclusivo' },
  { full: 'Florencia Javiera Ortiz Bravo', stage: 'Florencia Ortiz', birth: '2000-09-11', comuna: 'Rauco', status: 'CALLED_TO_CASTING', height: 170, dress: '38', shoe: '37', ig: '@flor.ortizb', repr: 'Rauco', occ: 'Periodista', num: null, contract: false, docs: 3, pub: false, motive: 'Quiero contar las historias de nuestra zona y darles voz.', cause: 'Memoria oral campesina' },
  { full: 'Trinidad Maite Vargas Sepúlveda', stage: 'Trinidad Vargas', birth: '2003-07-03', comuna: 'Maule', status: 'UNDER_REVIEW', height: 168, dress: '36', shoe: '37', ig: '@trini.vargas', repr: 'Maule', occ: 'Estudiante de Turismo', num: null, contract: false, docs: 2, pub: false, motive: 'Me encanta mostrar la belleza de nuestros valles al mundo.', cause: 'Turismo rural sustentable' },
  { full: 'Emilia Constanza Parra Tapia', stage: 'Emilia Parra', birth: '2004-10-25', comuna: 'Romeral', status: 'UNDER_REVIEW', height: 173, dress: '36', shoe: '38', ig: '@emi.parra', repr: 'Romeral', occ: 'Estudiante de Nutrición', num: null, contract: false, docs: 2, pub: false, motive: 'Quiero promover una alimentación sana ligada a nuestros productos locales.', cause: 'Alimentación saludable' },
  { full: 'Agustina Pilar Leiva Cortés', stage: 'Agustina Leiva', birth: '2002-06-08', comuna: 'Sagrada Familia', status: 'APPLICANT', height: 171, dress: '38', shoe: '38', ig: '@agus.leiva', repr: 'Sagrada Familia', occ: 'Asistente dental', num: null, contract: false, docs: 2, pub: false, motive: 'Siempre soñé con subir a ese escenario; esta es mi oportunidad.', cause: 'Cuidado animal' },
  { full: 'Renata Ailén Figueroa Salas', stage: 'Renata Figueroa', birth: '2003-03-16', comuna: 'Hualañé', status: 'APPLICANT', height: 174, dress: '36', shoe: '39', ig: '@rena.figueroa', repr: 'Hualañé', occ: 'Estudiante de Psicología', num: null, contract: false, docs: 2, pub: false, motive: 'Quiero abrir conversaciones sobre salud mental en el campo.', cause: 'Salud mental juvenil' },
  { full: 'Amanda Rocío Navarro Fierro', stage: 'Amanda Navarro', birth: '2001-12-19', comuna: 'Vichuquén', status: 'WITHDRAWN', height: 169, dress: '38', shoe: '37', ig: '@amanda.navarro', repr: 'Vichuquén', occ: 'Contadora auditora', num: null, contract: false, docs: 1, pub: false, motive: 'Quería participar para representar a mi comuna.', cause: 'Emprendimiento femenino' },
  { full: 'Bárbara Ximena Pizarro Vera', stage: 'Bárbara Pizarro', birth: '2002-02-07', comuna: 'Curepto', status: 'REJECTED', height: 160, dress: '40', shoe: '37', ig: '@barbi.pizarro', repr: 'Curepto', occ: 'Peluquera', num: null, contract: false, docs: 1, pub: false, motive: 'Me gustaría participar y conocer gente nueva.', cause: 'Peluquería solidaria' },
];

const BENEFITS = ['Logo en backdrop y pantallas de la gala', 'Mención en la transmisión en vivo', 'Entradas VIP para la gala', 'Stand en el hall de entrada', 'Publicación en redes del certamen'];

async function main() {
  assertLocalDatabase();
  const company = await prisma.company.findUnique({ where: { rut: formatRut('99999999-9') } });
  const owner = await prisma.user.findUnique({ where: { email: MANUAL_DEMO_ADMIN_EMAIL } });
  if (!company || !owner) throw new Error('Primero corre scripts/seed-manual-demo.ts');
  const companyId = company.id;
  if ((await prisma.project.count({ where: { companyId } })) > 0) {
    console.log('Ya hay certámenes: nada que hacer.');
    return;
  }
  await prisma.company.update({
    where: { id: companyId },
    data: { businessName: 'Producciones Aether SpA', giro: 'Producción de eventos y certámenes', address: 'Av. Providencia 1234, Of. 501', comuna: 'Providencia' },
  });

  // ── Certámenes ───────────────────────────────────────────────────────────
  const rv = await createProject(
    companyId,
    projectCreateSchema.parse({ code: 'RV27', name: 'Reina de la Vendimia 2027', budgetedIncome: 48_000_000, budgetedExpense: 31_000_000, startDate: isoDay(-60), endDate: isoDay(120), status: 'IN_PROGRESS', galaDate: `${isoDay(118)}T21:00:00-03:00`, venueName: 'Teatro Municipal de Curicó', venueAddress: 'Merced 452, Curicó', minCandidateAge: 18, requireCandidatePhoto: true, publicWhatsapp: '+56912345678', instagramHandle: '@reinavendimia27' })
  );
  const ma = await createProject(
    companyId,
    projectCreateSchema.parse({ code: 'MA27', name: 'Miss Araucanía 2027', budgetedIncome: 36_500_000, budgetedExpense: 24_000_000, startDate: isoDay(-20), endDate: isoDay(200), status: 'PLANNING', galaDate: `${isoDay(190)}T20:30:00-03:00`, venueName: 'Casino Dreams Temuco', venueAddress: 'Av. Alemania 0945, Temuco', minCandidateAge: 18 })
  );
  const rve = await createProject(
    companyId,
    projectCreateSchema.parse({ code: 'RV26', name: 'Reina de la Vendimia 2026', budgetedIncome: 42_000_000, budgetedExpense: 28_500_000, startDate: isoDay(-430), endDate: isoDay(-250), status: 'COMPLETED', galaDate: `${isoDay(-252)}T21:00:00-03:00`, venueName: 'Teatro Municipal de Curicó', venueAddress: 'Merced 452, Curicó' })
  );

  // ── Candidatas (Reina de la Vendimia 2027) ───────────────────────────────
  let idx = 0;
  for (const c of CANDIDATES) {
    idx += 1;
    const created = await createCandidate(
      companyId,
      candidateCreateSchema.parse({
        projectId: rv.id,
        rut: rut(19_000_000 + idx * 137_411),
        fullName: c.full,
        stageName: c.stage,
        birthDate: c.birth,
        email: `${c.stage.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@correo.cl`,
        phone: `+569${String(41_230_000 + idx * 7_331)}`,
        dressSize: c.dress,
        shoeSize: c.shoe,
        heightCm: c.height,
        emergencyContactName: 'María Eugenia (madre)',
        emergencyContactPhone: `+569${String(52_100_000 + idx * 5_113)}`,
        comuna: c.comuna,
        direccion: `Calle Los Aromos ${100 + idx * 13}, ${c.comuna}`,
        ocupacion: c.occ,
        instagram: c.ig,
        idiomas: idx % 3 === 0 ? 'Español, inglés intermedio' : 'Español, inglés básico',
        experiencia: idx % 2 === 0 ? 'Reina estudiantil 2022, desfiles de moda local y animación de eventos escolares.' : 'Participación en desfiles benéficos y voluntariado.',
        motivacion: c.motive,
        causaSocial: c.cause,
        condicionesMedicas: idx === 4 ? 'Alergia leve al látex (avisar a maquillaje).' : undefined,
        notes: c.status === 'FINALIST' ? 'Excelente desenvolvimiento en pasarela y entrevista.' : undefined,
      })
    );
    const photo = `/demo-avatars/${String(idx).padStart(2, '0')}.svg`;
    await prisma.candidate.updateMany({
      where: { id: created.id, companyId },
      data: { photoUrl: photo, folio: `RV27-2026-${String(idx).padStart(4, '0')}`, createdAt: new Date(Date.now() - (20 - idx) * 86_400_000 * 2) },
    });
    if (c.status !== 'APPLICANT') {
      await updateCandidateStatus(companyId, created.id, {
        status: c.status,
        motivoDescarte: c.status === 'REJECTED' ? 'No cumple el requisito de estatura mínima de la convocatoria' : undefined,
      } as Parameters<typeof updateCandidateStatus>[2]);
    }
    if (c.num !== null || c.pub) {
      await updateCandidatePresentation(companyId, created.id, candidatePresentationSchema.parse({ candidateNumber: c.num, representing: c.repr, publicBio: c.pub ? `${c.stage.split(' ')[0]}, ${c.occ.toLowerCase()} de ${c.comuna}. ${c.cause}.` : undefined, showOnPublicSite: c.pub }));
    }
    const docTypes = [
      ['Fotografía de rostro', 'PHOTO_FACE'],
      ['Fotografía de cuerpo entero', 'PHOTO_FULL_BODY'],
      ['Certificado médico', 'MEDICAL_CERTIFICATE'],
    ] as const;
    for (const [title, type] of docTypes.slice(0, Math.min(c.docs, 3))) {
      await prisma.candidateDocument.create({ data: { companyId, candidateId: created.id, title, documentType: type, fileUrl: photo, status: 'PENDING' } });
    }
    if (c.contract) {
      await prisma.candidateDocument.create({ data: { companyId, candidateId: created.id, title: 'Contrato de imagen', documentType: 'CONTRACT_IMAGE', fileUrl: photo, status: 'SIGNED', signedAt: new Date(Date.now() - 12 * 86_400_000) } });
    }
  }

  // ── Auspiciadores ────────────────────────────────────────────────────────
  const brands = [
    { body: 76_123_450, name: 'Viña Santa Clara S.A.', giro: 'Producción y exportación de vinos', email: 'marketing@vinasantaclara.cl', comuna: 'Curicó' },
    { body: 77_234_560, name: 'Banco Regional del Maule', giro: 'Servicios financieros', email: 'eventos@bancomaule.cl', comuna: 'Talca' },
    { body: 76_345_670, name: 'Cervecería Valle Central', giro: 'Elaboración de cerveza artesanal', email: 'alianzas@vallecentral.cl', comuna: 'Curicó' },
    { body: 78_456_780, name: 'Clínica Dental Sonríe', giro: 'Servicios odontológicos', email: 'contacto@clinicasonrie.cl', comuna: 'Talca' },
    { body: 77_567_890, name: 'Radio Bío Maule FM', giro: 'Radiodifusión', email: 'comercial@biomaule.cl', comuna: 'Curicó' },
    { body: 76_678_900, name: 'Tostaduría Café del Valle', giro: 'Tostado y venta de café', email: 'ventas@cafedelvalle.cl', comuna: 'Molina' },
    { body: 78_789_010, name: 'Joyas Altamira', giro: 'Joyería y relojería', email: 'hola@joyasaltamira.cl', comuna: 'Providencia' },
    { body: 77_890_120, name: 'Constructora Pehuén Ltda.', giro: 'Construcción de edificios', email: 'rse@pehuen.cl', comuna: 'Temuco' },
  ];
  const brandIds: string[] = [];
  for (const b of brands) {
    const c = await createContact(companyId, contactCreateSchema.parse({ rut: rut(b.body), razonSocial: b.name, giro: b.giro, email: b.email, comuna: b.comuna, isCustomer: true }));
    brandIds.push(c.id);
  }

  const packagesFor = async (projectId: string) => {
    for (const [tier, name, price, slots, order] of [
      ['TITULAR_MAIN_SPONSOR', 'Auspiciador Principal', 15_000_000, 1, 1],
      ['GOLD', 'Auspiciador Oro', 8_000_000, 3, 2],
      ['SILVER', 'Auspiciador Plata', 4_500_000, 5, 3],
      ['BRONZE', 'Auspiciador Bronce', 1_800_000, 10, 4],
    ] as const) {
      await createPackage(companyId, sponsorshipPackageSchema.parse({ projectId, tier, name, price, maxSlots: slots, order, isPublic: true, benefits: BENEFITS.slice(0, 5 - order) }));
    }
  };
  await packagesFor(rv.id);
  await packagesFor(ma.id);

  type Tier = 'TITULAR_MAIN_SPONSOR' | 'GOLD' | 'SILVER' | 'BRONZE' | 'MEDIA_PARTNER' | 'CANJE_BARTER' | 'OFFICIAL_SPONSOR';
  const contracts: { brand: number; project: string; tier: Tier; cash: number; paid: number; barter?: [number, string]; status: 'PROPOSAL' | 'CONFIRMED' | 'COMPLETED'; signed: boolean; deliverables: [string, 'MENCION' | 'BACKSTAGE' | 'PAUTA' | 'OTRO', number, boolean][] }[] = [
    { brand: 0, project: rv.id, tier: 'TITULAR_MAIN_SPONSOR', cash: 15_000_000, paid: 9_000_000, status: 'CONFIRMED', signed: true, deliverables: [['Logo en backdrop de la gala', 'PAUTA', 100, false], ['Mención de apertura en la gala', 'MENCION', 118, false], ['Sesión de fotos con las candidatas', 'BACKSTAGE', 60, true], ['Publicación de anuncio en Instagram', 'PAUTA', 30, true]] },
    { brand: 1, project: rv.id, tier: 'GOLD', cash: 8_000_000, paid: 8_000_000, status: 'CONFIRMED', signed: true, deliverables: [['Logo en pantallas LED', 'PAUTA', 118, false], ['Entrega de premio a la ganadora', 'MENCION', 118, false], ['Video institucional en intermedio', 'PAUTA', 118, false]] },
    { brand: 2, project: rv.id, tier: 'SILVER', cash: 4_500_000, paid: 2_250_000, status: 'CONFIRMED', signed: true, deliverables: [['Stand de degustación en el hall', 'BACKSTAGE', 118, false], ['Mención en la transmisión', 'MENCION', 118, false]] },
    { brand: 3, project: rv.id, tier: 'BRONZE', cash: 1_800_000, paid: 0, status: 'PROPOSAL', signed: false, deliverables: [] },
    { brand: 4, project: rv.id, tier: 'MEDIA_PARTNER', cash: 0, paid: 0, barter: [3_200_000, 'Cuñas radiales diarias durante 8 semanas'], status: 'CONFIRMED', signed: true, deliverables: [['Spots radiales semanales', 'PAUTA', 90, true], ['Cobertura en vivo de la gala', 'MENCION', 118, false]] },
    { brand: 5, project: rv.id, tier: 'CANJE_BARTER', cash: 0, paid: 0, barter: [1_500_000, 'Café para producción, backstage y gala'], status: 'CONFIRMED', signed: false, deliverables: [['Estación de café en backstage', 'BACKSTAGE', 118, false]] },
    { brand: 6, project: rv.id, tier: 'SILVER', cash: 4_500_000, paid: 0, status: 'PROPOSAL', signed: false, deliverables: [] },
    { brand: 7, project: ma.id, tier: 'TITULAR_MAIN_SPONSOR', cash: 15_000_000, paid: 5_000_000, status: 'CONFIRMED', signed: true, deliverables: [['Logo en backdrop y programa', 'PAUTA', 190, false], ['Mención de apertura', 'MENCION', 190, false]] },
    { brand: 1, project: rve.id, tier: 'GOLD', cash: 7_000_000, paid: 7_000_000, status: 'COMPLETED', signed: true, deliverables: [['Logo en pantallas', 'PAUTA', -252, true], ['Entrega de premio', 'MENCION', -252, true]] },
  ];
  for (const k of contracts) {
    const created = await createSponsorshipContract(
      companyId,
      sponsorshipContractCreateSchema.parse({ projectId: k.project, contactId: brandIds[k.brand]!, tier: k.tier, cashAmount: k.cash, isBarter: !!k.barter, barterValuation: k.barter?.[0] ?? 0, barterDescription: k.barter?.[1], status: k.status })
    );
    for (const [title, type, due, done] of k.deliverables) {
      const d = await addDeliverable(companyId, created.id, deliverableCreateSchema.parse({ title, type, dueDate: isoDay(due) }));
      if (done) await toggleDeliverable(companyId, d.id);
    }
    if (k.paid > 0) await updateSponsorshipPayment(companyId, created.id, sponsorshipPaymentSchema.parse({ paidAmount: k.paid }));
    if (k.signed) await prisma.sponsorshipContract.updateMany({ where: { id: created.id, companyId }, data: { agreementFileUrl: 'https://demo.invalid/carta-compromiso.pdf', agreementSignedAt: new Date(Date.now() - 20 * 86_400_000) } });
  }

  console.log('Datos de pitch listos:', { rv: rv.id, ma: ma.id, rve: rve.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
