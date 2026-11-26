/**
 * Datos SIMULADOS de «CR Producciones» para mostrar cómo se ve y cómo funciona
 * la plataforma (capturas de pantalla). Todo es ficticio: personas, marcas,
 * montos, fotos (ilustraciones) y logos.
 *
 * SOLO contra una base LOCAL y desechable (se niega a correr si el host no es
 * localhost). Crea la empresa con los MISMOS servicios que usan las pantallas,
 * así folios, saldos y reglas de negocio quedan coherentes.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cr_demo \
 *   R2_PUBLIC_URL=https://localhost:8443/cr-demo \
 *     npx tsx --conditions=react-server scripts/demo-cr/seed-cr-producciones.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { formatRut } from '../../src/lib/chile/rut';
import { assertLocalDatabase } from '../lib/guard-production';
import { buildFiestaDesign, FIESTA } from '../lib/fiesta-primavera';
import type { CompanyFeatureFlags } from '../../src/lib/auth/modules';
import { contactCreateSchema } from '../../src/modules/contacts/schema';
import { createContact } from '../../src/modules/contacts/services/contacts.service';
import { projectCreateSchema } from '../../src/modules/projects/schema';
import { createProject } from '../../src/modules/projects/services/projects.service';
import { candidateCreateSchema, sessionSeriesCreateSchema } from '../../src/modules/candidates/schema';
import { createCandidate, getOrCreateRegistrationToken } from '../../src/modules/candidates/services/candidates.service';
import { createSessionSeries, getSession, listSessions, saveSessionAttendance } from '../../src/modules/candidates/services/sessions.service';
import { competitionRoundCreateSchema, judgeAssignmentCreateSchema, judgingCategoryCreateSchema } from '../../src/modules/judging/schema';
import { createCategory, createJudgeAssignment, submitScore } from '../../src/modules/judging/services/judging.service';
import { createRound, openRound } from '../../src/modules/judging/services/rounds.service';
import { stageTimelineItemCreateSchema, staffAccreditationCreateSchema, badgeTemplateCreateSchema, wardrobeItemCreateSchema } from '../../src/modules/production/schema';
import { chainStageSchedule, createBadgeTemplate, createStaffAccreditation, createStageItem, createWardrobeItem, generateWardrobePlan } from '../../src/modules/production/services/production.service';
import { deliverableCreateSchema, sponsorshipContractCreateSchema, sponsorshipPackageSchema } from '../../src/modules/sponsorships/schema';
import { addDeliverable, createSponsorshipContract, toggleDeliverable, updateSponsorshipPayment } from '../../src/modules/sponsorships/services/sponsorships.service';
import { createPackage } from '../../src/modules/sponsorships/services/packages.service';
import { ticketTypeCreateSchema } from '../../src/modules/ticketing/schema';
import { confirmTicketPayment, createPublicTicketOrder, createTicketType, getOrCreateTicketSalesToken } from '../../src/modules/ticketing/services/ticketing.service';
import { confirmVotePayment, createPublicVoteOrder, getOrCreateVoteSalesToken } from '../../src/modules/public-voting/services/public-voting.service';
import { opportunityCreateSchema } from '../../src/modules/crm/schema';
import { createOpportunity } from '../../src/modules/crm/services/crm.service';
import { paymentPlanCreateSchema } from '../../src/modules/payment-plans/schema';
import { createPaymentPlan, registerInstallmentPayment } from '../../src/modules/payment-plans/services/payment-plans.service';
import { purchaseDocumentCreateSchema } from '../../src/modules/purchases/schema';
import { createPurchaseDocument } from '../../src/modules/purchases/services/purchases.service';
import { feeDocumentCreateSchema } from '../../src/modules/fees/schema';
import { createFeeDocument, markFeeDocumentPaid } from '../../src/modules/fees/services/fees.service';
import { taskSchema } from '../../src/modules/tasks/schema';
import { createTask } from '../../src/modules/tasks/services/tasks.service';
import { assignJobPosition, assignManager, createJobPosition } from '../../src/modules/org-chart/services/org-chart.service';

assertLocalDatabase('seed-cr-producciones');

const ASSETS = (process.env.R2_PUBLIC_URL ?? 'https://localhost:8443/cr-demo').replace(/\/+$/, '');
const asset = (rel: string) => `${ASSETS}/${rel.split('/').map(encodeURIComponent).join('/')}`;
const portrait = (n: number) => asset(`portraits/cand-${String(n).padStart(2, '0')}.jpg`);

export const DEMO_EMAIL = 'direccion@crproducciones.local';
export const DEMO_PASSWORD = 'DemoCR2026!';

const FLAGS_ON: Partial<CompanyFeatureFlags> = {
  // Plan «Eventos» del tarifario…
  hasInstallmentPlans: true,
  hasPromissoryNotes: true,
  hasSalesPipeline: true,
  hasEventProjects: true,
  hasCandidates: true,
  hasSponsorships: true,
  hasLiveProduction: true,
  hasJudging: true,
  hasTicketing: true,
  hasPublicVoting: true,
  // …más equipo y finanzas del evento.
  hasOrgChart: true,
  hasTeamTasks: true,
  hasPurchases: true,
  hasTreasury: true,
  hasBudgets: true,
  hasFeeDocuments: true,
};

/** RUT válido (módulo 11) a partir del cuerpo numérico. */
function rut(body: number): string {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const dv = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return formatRut(`${body}-${dv}`);
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Pseudoaleatorio determinista para que la demo se vea igual cada vez. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = makeRng(2026);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;

// ── Datos ficticios ────────────────────────────────────────────────────────

interface CandSeed {
  full: string;
  stage: string;
  body: number;
  birth: string;
  rep: string;
  occ: string;
  ig: string;
  bio: string;
  motive: string;
  cause: string;
  status: 'OFFICIAL_CANDIDATE' | 'FINALIST' | 'WINNER' | 'APPLICANT' | 'UNDER_REVIEW' | 'CALLED_TO_CASTING' | 'WITHDRAWN' | 'REJECTED';
  photo?: number;
  height: number;
  strength?: number;
}

const FIESTA_CANDS: CandSeed[] = [
  { full: 'Antonia Millaray Cárdenas Soto', stage: 'Antonia Cárdenas', body: 20845612, birth: '2003-04-12', rep: 'Pueblo Nuevo', occ: 'Estudiante de Pedagogía en Inglés', ig: 'antonia.cardenas', bio: 'Estudiante de Pedagogía y voluntaria en talleres de lectura para niños. Sueña con enseñar en una escuela rural de la región.', motive: 'Quiero representar a mi barrio y devolverle a Temuco lo que me ha dado.', cause: 'Fomento lector infantil', status: 'OFFICIAL_CANDIDATE', photo: 1, height: 172, strength: 0.92 },
  { full: 'Josefa Antileo Navarrete', stage: 'Josefa Antileo', body: 21034587, birth: '2004-09-03', rep: 'Labranza', occ: 'Técnico en Enfermería', ig: 'josefa.antileo', bio: 'Técnico en Enfermería, bailarina de cueca y orgullosa de su raíz mapuche. Trabaja en un centro de salud familiar.', motive: 'Mostrar que la Araucanía es talento, trabajo y cultura viva.', cause: 'Salud preventiva rural', status: 'OFFICIAL_CANDIDATE', photo: 2, height: 168, strength: 0.88 },
  { full: 'Catalina Rebolledo Ibarra', stage: 'Catalina Rebolledo', body: 20567341, birth: '2002-01-27', rep: 'Padre Las Casas', occ: 'Ingeniera Comercial', ig: 'cata.rebolledo', bio: 'Ingeniera Comercial y emprendedora: lidera una pastelería artesanal con enfoque de comercio justo.', motive: 'Inspirar a otras jóvenes a emprender desde su comuna.', cause: 'Emprendimiento femenino', status: 'OFFICIAL_CANDIDATE', photo: 3, height: 175, strength: 0.81 },
  { full: 'Francisca Huenchumilla Parra', stage: 'Francisca Huenchumilla', body: 21245098, birth: '2003-11-18', rep: 'Barrio Inglés', occ: 'Estudiante de Derecho', ig: 'fran.huenchu', bio: 'Estudiante de Derecho, debatiente universitaria y colaboradora de una clínica jurídica gratuita.', motive: 'Dar voz a mi generación y a las mujeres de mi comunidad.', cause: 'Acceso a la justicia', status: 'OFFICIAL_CANDIDATE', photo: 4, height: 170, strength: 0.78 },
  { full: 'Valentina Quilaqueo Henríquez', stage: 'Valentina Quilaqueo', body: 20718930, birth: '2001-06-30', rep: 'Amanecer', occ: 'Kinesióloga', ig: 'vale.quilaqueo', bio: 'Kinesióloga con foco en rehabilitación deportiva. Entrena a un equipo escolar de vóleibol.', motive: 'Promover el deporte y la vida sana en los jóvenes.', cause: 'Deporte escolar', status: 'OFFICIAL_CANDIDATE', photo: 5, height: 177, strength: 0.74 },
  { full: 'Constanza Reyes Mansilla', stage: 'Constanza Reyes', body: 21176452, birth: '2004-03-08', rep: 'Pedro de Valdivia', occ: 'Estudiante de Diseño', ig: 'coni.reyes.d', bio: 'Estudiante de Diseño Gráfico. Ilustra afiches para ferias de artesanos y le encanta la fotografía analógica.', motive: 'Mostrar la creatividad joven del sur de Chile.', cause: 'Apoyo a artesanos locales', status: 'OFFICIAL_CANDIDATE', photo: 6, height: 169, strength: 0.7 },
  { full: 'Martina Painemal Vásquez', stage: 'Martina Painemal', body: 20934716, birth: '2002-12-14', rep: 'Fundo El Carmen', occ: 'Veterinaria', ig: 'marti.painemal', bio: 'Médico veterinaria de animales mayores. Visita predios rurales y apoya a pequeños productores.', motive: 'Que el campo también tenga reinas y voz.', cause: 'Bienestar animal', status: 'OFFICIAL_CANDIDATE', photo: 7, height: 171, strength: 0.66 },
  { full: 'Isidora Sepúlveda Cifuentes', stage: 'Isidora Sepúlveda', body: 21356809, birth: '2005-02-22', rep: 'Santa Rosa', occ: 'Estudiante de Periodismo', ig: 'isi.sepulveda', bio: 'Estudiante de Periodismo y locutora de la radio de su universidad. Cubre actividades culturales de la ciudad.', motive: 'Contar las historias que Temuco merece que se cuenten.', cause: 'Cultura y comunicación', status: 'OFFICIAL_CANDIDATE', photo: 8, height: 166, strength: 0.62 },
  { full: 'Camila Neculpán Rojas', stage: 'Camila Neculpán', body: 20645178, birth: '2001-10-05', rep: 'Campus Universitario', occ: 'Psicóloga', ig: 'cami.neculpan', bio: 'Psicóloga infanto-juvenil. Facilita talleres de autoestima en colegios municipales.', motive: 'Que ninguna joven sienta que no tiene un lugar.', cause: 'Salud mental adolescente', status: 'OFFICIAL_CANDIDATE', photo: 9, height: 167, strength: 0.58 },
  { full: 'Javiera Troncoso Belmar', stage: 'Javiera Troncoso', body: 21087623, birth: '2003-07-19', rep: 'Villa Alegre', occ: 'Estudiante de Arquitectura', ig: 'javi.troncoso', bio: 'Estudiante de Arquitectura. Participa en un colectivo que recupera plazas y espacios públicos de su población.', motive: 'Construir una ciudad más amable, empezando por mi barrio.', cause: 'Recuperación de espacios públicos', status: 'OFFICIAL_CANDIDATE', photo: 10, height: 173, strength: 0.54 },
  { full: 'Sofía Catrileo Fuentes', stage: 'Sofía Catrileo', body: 21265407, birth: '2004-05-11', rep: 'Centro', occ: 'Estudiante de Nutrición', ig: 'sofi.catrileo', bio: 'Estudiante de Nutrición con interés en alimentación escolar saludable.', motive: 'Llegar a más niños con alimentación sana.', cause: 'Alimentación saludable', status: 'UNDER_REVIEW', photo: 11, height: 165 },
  { full: 'Emilia Calfuqueo Moraga', stage: 'Emilia Calfuqueo', body: 20896345, birth: '2002-08-29', rep: 'Lautaro', occ: 'Profesora de Educación Física', ig: 'emi.calfuqueo', bio: 'Profesora de Educación Física.', motive: 'Quiero vivir la experiencia del certamen.', cause: 'Deporte inclusivo', status: 'UNDER_REVIEW', photo: 12, height: 170 },
  { full: 'Trinidad Alarcón Pino', stage: 'Trinidad Alarcón', body: 21198374, birth: '2004-01-16', rep: 'Cajón', occ: 'Estudiante', ig: 'trini.alarcon', bio: 'Estudiante de último año.', motive: 'Postulo por mi familia.', cause: 'Educación', status: 'WITHDRAWN', photo: 13, height: 164 },
  { full: 'Agustina Lefiqueo Sáez', stage: 'Agustina Lefiqueo', body: 20754812, birth: '2005-09-09', rep: 'Vilcún', occ: 'Estudiante', ig: 'agus.lefiqueo', bio: 'Estudiante.', motive: 'Me interesa participar.', cause: 'Cultura', status: 'REJECTED', photo: 14, height: 162 },
];

const VERANO_CANDS: CandSeed[] = [
  { full: 'Florencia Millapán Quezada', stage: 'Florencia Millapán', body: 21412056, birth: '2004-02-05', rep: 'Villarrica', occ: 'Guía de turismo', ig: 'flor.millapan', bio: 'Guía de turismo de aventura en el Lago Villarrica.', motive: 'Mostrar el sur al mundo.', cause: 'Turismo sustentable', status: 'OFFICIAL_CANDIDATE', photo: 15, height: 172 },
  { full: 'Renata Aburto Lagos', stage: 'Renata Aburto', body: 20987345, birth: '2002-05-21', rep: 'Pucón', occ: 'Instructora de kayak', ig: 'rena.aburto', bio: 'Instructora de kayak y rescatista voluntaria.', motive: 'Cuidar nuestros lagos.', cause: 'Cuidado del agua', status: 'OFFICIAL_CANDIDATE', photo: 16, height: 174 },
  { full: 'Maite Colipí Aravena', stage: 'Maite Colipí', body: 21309876, birth: '2003-10-02', rep: 'Curarrehue', occ: 'Chef de cocina', ig: 'maite.colipi', bio: 'Chef especializada en cocina de la precordillera.', motive: 'Rescatar la gastronomía local.', cause: 'Gastronomía de raíz', status: 'OFFICIAL_CANDIDATE', photo: 17, height: 168 },
  { full: 'Ignacia Paillalef Ortiz', stage: 'Ignacia Paillalef', body: 20812764, birth: '2001-12-17', rep: 'Loncoche', occ: 'Ingeniera Agrónoma', ig: 'igna.paillalef', bio: 'Ingeniera Agrónoma, apasionada por la agricultura familiar.', motive: 'Que el campo se valore.', cause: 'Agricultura familiar', status: 'OFFICIAL_CANDIDATE', photo: 18, height: 170 },
  { full: 'Amanda Huaiquil Torres', stage: 'Amanda Huaiquil', body: 21143765, birth: '2003-03-25', rep: 'Freire', occ: 'Estudiante de Turismo', ig: 'amanda.huaiquil', bio: 'Estudiante de Turismo.', motive: 'Quiero crecer.', cause: 'Turismo rural', status: 'CALLED_TO_CASTING', photo: 19, height: 169 },
  { full: 'Benjamina Cheuquepán Díaz', stage: 'Benjamina Cheuquepán', body: 21256098, birth: '2004-07-30', rep: 'Gorbea', occ: 'Estudiante', ig: 'benja.cheuquepan', bio: 'Estudiante.', motive: 'Postulo por la experiencia.', cause: 'Educación', status: 'CALLED_TO_CASTING', photo: 20, height: 166 },
  { full: 'Pascale Marín Rivas', stage: 'Pascale Marín', body: 20678135, birth: '2002-04-14', rep: 'Villarrica', occ: 'Diseñadora', ig: 'pascale.marin', bio: 'Diseñadora.', motive: 'Mostrar mi trabajo.', cause: 'Diseño local', status: 'UNDER_REVIEW', height: 171 },
  { full: 'Noemí Raín Gutiérrez', stage: 'Noemí Raín', body: 21387420, birth: '2005-01-09', rep: 'Pucón', occ: 'Estudiante', ig: 'noemi.rain', bio: 'Estudiante.', motive: 'Me gusta el escenario.', cause: 'Arte', status: 'APPLICANT', height: 165 },
  { full: 'Rocío Liencura Parra', stage: 'Rocío Liencura', body: 20923871, birth: '2003-06-18', rep: 'Villarrica', occ: 'Estudiante', ig: 'rocio.liencura', bio: 'Estudiante.', motive: 'Quiero participar.', cause: 'Deporte', status: 'APPLICANT', height: 168 },
];

const NIEVE_CANDS: CandSeed[] = [
  { full: 'Dominga Ancamilla Soto', stage: 'Dominga Ancamilla', body: 20716452, birth: '2000-08-09', rep: 'Lonquimay', occ: 'Técnica agrícola', ig: 'dominga.anca', bio: 'Técnica agrícola de Lonquimay.', motive: 'Orgullo de mi tierra.', cause: 'Raíces', status: 'WINNER', photo: 21, height: 171 },
  { full: 'Esperanza Collío Vera', stage: 'Esperanza Collío', body: 21035781, birth: '2002-02-11', rep: 'Curacautín', occ: 'Profesora', ig: 'espe.collio', bio: 'Profesora básica.', motive: 'Educar es mi vocación.', cause: 'Educación rural', status: 'FINALIST', photo: 22, height: 169 },
  { full: 'Almendra Rain Toro', stage: 'Almendra Rain', body: 20891347, birth: '2001-04-04', rep: 'Melipeuco', occ: 'Guardaparques', ig: 'almendra.rain', bio: 'Guardaparques.', motive: 'Cuidar la cordillera.', cause: 'Conservación', status: 'FINALIST', photo: 23, height: 173 },
  { full: 'Belén Marileo Cares', stage: 'Belén Marileo', body: 21178493, birth: '2003-09-27', rep: 'Victoria', occ: 'Estudiante', ig: 'belen.marileo', bio: 'Estudiante.', motive: 'Participar.', cause: 'Cultura', status: 'OFFICIAL_CANDIDATE', photo: 24, height: 168 },
];

const STAFF = [
  { name: 'Daniela Ortiz Vergara', email: DEMO_EMAIL, role: 'OWNER' as const, position: 'Dirección General', level: 'Gerencia', boss: null as string | null },
  { name: 'Matías Soto Parra', email: 'produccion@crproducciones.local', role: 'ADMIN' as const, position: 'Producción Ejecutiva', level: 'Jefatura', boss: DEMO_EMAIL },
  { name: 'Fernanda Lagos Muñoz', email: 'candidatas@crproducciones.local', role: 'ADMIN' as const, position: 'Coordinación de Candidatas', level: 'Jefatura', boss: 'produccion@crproducciones.local' },
  { name: 'Javier Henríquez Rojas', email: 'escenario@crproducciones.local', role: 'WAREHOUSE' as const, position: 'Jefatura de Escenario y Técnica', level: 'Jefatura', boss: 'produccion@crproducciones.local' },
  { name: 'Paula Navarrete Cid', email: 'auspicios@crproducciones.local', role: 'SALES' as const, position: 'Auspicios y Alianzas', level: 'Jefatura', boss: DEMO_EMAIL },
  { name: 'Rodrigo Fuentes Alarcón', email: 'finanzas@crproducciones.local', role: 'ACCOUNTANT' as const, position: 'Administración y Finanzas', level: 'Jefatura', boss: DEMO_EMAIL },
];

const SPONSORS = [
  { n: 'Clínica Dental Sonríe SpA', body: 76512340, giro: 'Servicios dentales', file: 'Clínica Dental Sonríe', email: 'marketing@sonrie.local' },
  { n: 'Inmobiliaria Cordillera Sur SpA', body: 76623451, giro: 'Inmobiliaria', file: 'Inmobiliaria Cordillera Sur', email: 'contacto@cordillerasur.local' },
  { n: 'Radio Pewma FM Limitada', body: 77734562, giro: 'Radiodifusión', file: 'Radio Pewma FM', email: 'comercial@pewmafm.local' },
  { n: 'Viña Los Aromos SpA', body: 76845673, giro: 'Viña', file: 'Viña Los Aromos', email: 'eventos@losaromos.local' },
  { n: 'Hotel Pillán Limitada', body: 78956784, giro: 'Hotelería', file: 'Hotel Pillán', email: 'gerencia@hotelpillan.local' },
  { n: 'Supermercados Del Sur S.A.', body: 96067895, giro: 'Supermercados', file: 'Supermercados Del Sur', email: 'rse@delsur.local' },
  { n: 'Ferretería El Roble Limitada', body: 77178906, giro: 'Ferretería', file: 'Ferretería El Roble', email: 'ventas@elroble.local' },
  { n: 'Pastelería Maitén SpA', body: 76289017, giro: 'Pastelería', file: 'Pastelería Maitén', email: 'hola@maiten.local' },
  { n: 'Taller Lafkén Joyas EIRL', body: 76390128, giro: 'Joyería artesanal', file: 'Taller Lafkén Joyas', email: 'taller@lafken.local' },
  { n: 'Transportes Araucanía Bus S.A.', body: 96401239, giro: 'Transporte de pasajeros', file: 'Transportes Araucanía Bus', email: 'comercial@araucaniabus.local' },
];

const PROVIDERS = [
  { n: 'Sonido e Iluminación Austral SpA', body: 76501234, giro: 'Producción técnica' },
  { n: 'Centro de Eventos Pewma Limitada', body: 77612345, giro: 'Arriendo de recintos' },
  { n: 'Escenografía y Floristería Boldo SpA', body: 76723456, giro: 'Escenografía' },
  { n: 'Catering Cordillera Limitada', body: 77834567, giro: 'Banquetería' },
  { n: 'Imprenta Gráfica Sur Limitada', body: 76945678, giro: 'Impresión' },
];
const FREELANCERS = [
  { n: 'Cristóbal Medina Aguilera', body: 15234567, giro: 'Animación y conducción', fee: 900_000, folio: '412', desc: 'Conducción de la gala y presentación de candidatas', paid: true },
  { n: 'Macarena Ibáñez Sandoval', body: 16345678, giro: 'Coreografía', fee: 650_000, folio: '88', desc: 'Dirección coreográfica de pasarela y apertura', paid: true },
  { n: 'Tamara Villagrán Concha', body: 17456789, giro: 'Maquillaje y peinado', fee: 480_000, folio: '203', desc: 'Maquillaje y peinado de candidatas en ensayo general', paid: false },
];

async function main() {
  const existing = await prisma.company.findFirst({ where: { businessName: { contains: 'CR Producciones' } }, select: { id: true } });
  if (existing) {
    console.log('«CR Producciones» ya existe en esta base: nada que hacer (reinicia la base para repetir).');
    return;
  }

  // ── Empresa, usuarios, módulos ───────────────────────────────────────────
  const company = await prisma.company.create({
    data: {
      rut: rut(76100200),
      businessName: 'CR Producciones SpA',
      giro: 'Producción de eventos, certámenes y espectáculos',
      address: 'Av. Alemania 0845, Of. 12',
      comuna: 'Temuco',
      ciudad: 'Temuco',
      phone: '+56 45 255 0000',
      email: 'contacto@crproducciones.local',
      planName: 'Eventos',
      maxUsers: 10,
      maxWarehouses: 1,
    },
  });
  const companyId = company.id;
  await prisma.companyFeatures.create({ data: { companyId, ...FLAGS_ON } });
  await prisma.companySettings.create({
    data: { companyId, bankTransferInfo: 'CR Producciones SpA · RUT ' + company.rut + ' · Banco Estado · Cuenta Corriente 000-1234567 · pagos@crproducciones.local' },
  });
  await prisma.warehouse.create({ data: { companyId, name: 'Bodega Principal', code: 'CENTRAL', isDefault: true, address: company.address } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userIds: Record<string, string> = {};
  for (const s of STAFF) {
    const u = await prisma.user.create({ data: { email: s.email, passwordHash, name: s.name, role: s.role, companyId } });
    userIds[s.email] = u.id;
  }
  const ownerId = userIds[DEMO_EMAIL]!;
  for (const s of STAFF.filter((x) => x.email !== DEMO_EMAIL)) {
    await prisma.invitation.create({ data: { companyId, email: s.email, role: s.role, token: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), expiresAt: daysAgo(-7), acceptedAt: daysAgo(80), createdAt: daysAgo(84) } });
  }
  const positions: Record<string, string> = {};
  for (const s of STAFF) {
    if (!positions[s.position]) positions[s.position] = (await createJobPosition(companyId, { name: s.position, level: s.level })).id;
  }
  for (const s of STAFF) {
    await assignJobPosition(companyId, userIds[s.email]!, positions[s.position]!);
    if (s.boss) await assignManager(companyId, userIds[s.email]!, userIds[s.boss]!);
  }
  console.log('Empresa y equipo listos:', company.businessName);

  // ── Contactos ────────────────────────────────────────────────────────────
  const sponsorIds: Record<string, string> = {};
  for (const s of SPONSORS) {
    const c = await createContact(companyId, contactCreateSchema.parse({ rut: rut(s.body), razonSocial: s.n, giro: s.giro, email: s.email, comuna: 'Temuco', isCustomer: true }));
    sponsorIds[s.file] = c.id;
  }
  const providerIds: string[] = [];
  for (const p of PROVIDERS) {
    const c = await createContact(companyId, contactCreateSchema.parse({ rut: rut(p.body), razonSocial: p.n, giro: p.giro, email: 'ventas@' + p.n.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.local', comuna: 'Temuco', isSupplier: true, bankCode: '012', bankAccountType: 'CUENTA_CORRIENTE', bankAccountNumber: '00-410-22334-55' }));
    providerIds.push(c.id);
  }
  const freelancerIds: string[] = [];
  for (const f of FREELANCERS) {
    const c = await createContact(companyId, contactCreateSchema.parse({ rut: rut(f.body), razonSocial: f.n, giro: f.giro, comuna: 'Temuco', isSupplier: true }));
    freelancerIds.push(c.id);
  }

  // ── Certámenes ───────────────────────────────────────────────────────────
  const fiesta = await createProject(
    companyId,
    projectCreateSchema.parse({
      code: FIESTA.code,
      name: FIESTA.name,
      budgetedIncome: 30_000_000,
      budgetedExpense: 22_000_000,
      startDate: isoDay(-85),
      endDate: '2026-12-20',
      status: 'IN_PROGRESS',
      galaDate: '2026-12-12T21:00:00-03:00',
      venueName: 'Centro de Eventos Pewma',
      venueAddress: 'Av. Alemania 1234, Temuco',
      publicWhatsapp: '56912345678',
      instagramHandle: 'fiestaprimaveratemuco',
      minCandidateAge: 18,
      requireCandidateInstagram: true,
      requireCandidatePhoto: true,
    })
  );
  const verano = await createProject(
    companyId,
    projectCreateSchema.parse({
      code: 'REINA-VERANO-VILLARRICA-2027',
      name: 'Reina del Verano Villarrica 2027',
      budgetedIncome: 24_000_000,
      budgetedExpense: 17_800_000,
      startDate: isoDay(-20),
      endDate: '2027-02-28',
      status: 'PLANNING',
      galaDate: '2027-02-20T21:30:00-03:00',
      venueName: 'Costanera de Villarrica',
      venueAddress: 'Av. Costanera Pedro de Valdivia, Villarrica',
      publicWhatsapp: '56987654321',
      instagramHandle: 'reinadelveranovillarrica',
      minCandidateAge: 18,
      requireCandidateInstagram: true,
      requireCandidatePhoto: true,
    })
  );
  const nieve = await createProject(
    companyId,
    projectCreateSchema.parse({
      code: 'REINA-NIEVE-LONQUIMAY-2025',
      name: 'Reina de la Nieve Lonquimay 2025',
      budgetedIncome: 16_500_000,
      budgetedExpense: 12_000_000,
      startDate: '2025-04-10',
      endDate: '2025-08-30',
      status: 'COMPLETED',
      galaDate: '2025-08-23T20:30:00-04:00',
      venueName: 'Gimnasio Municipal de Lonquimay',
      venueAddress: 'Lonquimay, La Araucanía',
      publicWhatsapp: '56955512345',
      instagramHandle: 'reinadelanievelonquimay',
    })
  );
  const A = fiesta.id;
  const B = verano.id;
  const C = nieve.id;

  // ── Candidatas ───────────────────────────────────────────────────────────
  async function loadCandidates(projectId: string, list: CandSeed[], numbered: boolean, createdFromDaysAgo: number) {
    const rows: { id: string; seed: CandSeed }[] = [];
    let n = 0;
    for (const c of list) {
      const created = await createCandidate(
        companyId,
        candidateCreateSchema.parse({
          projectId,
          rut: rut(c.body),
          fullName: c.full,
          stageName: c.stage,
          birthDate: c.birth,
          email: `${c.stage.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${c.stage.split(' ')[1]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@correo.local`,
          phone: '+56 9 ' + String(5000_0000 + Math.floor(rnd() * 4999_9999)),
          heightCm: c.height,
          dressSize: pick(['34', '36', '38']),
          shoeSize: pick(['36', '37', '38', '39']),
          comuna: 'Temuco',
          ocupacion: c.occ,
          instagram: c.ig,
          motivacion: c.motive,
          causaSocial: c.cause,
          status: c.status,
        })
      );
      const official = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'].includes(c.status);
      n += official ? 1 : 0;
      await prisma.candidate.updateMany({
        where: { id: created.id, companyId },
        data: {
          photoUrl: c.photo && c.status !== 'REJECTED' ? portrait(c.photo) : undefined,
          representing: c.rep,
          publicBio: official ? c.bio : undefined,
          candidateNumber: numbered && official ? n : undefined,
          createdAt: daysAgo(createdFromDaysAgo - Math.floor(rnd() * (createdFromDaysAgo * 0.6))),
          motivoDescarte: c.status === 'REJECTED' ? 'No cumple el requisito de edad mínima declarado en el formulario.' : undefined,
          privacyConsentAt: daysAgo(createdFromDaysAgo),
          privacyPolicyVersion: '2026-09',
        },
      });
      rows.push({ id: created.id, seed: c });
    }
    return rows;
  }
  const fiestaC = await loadCandidates(A, FIESTA_CANDS, true, 70);
  const veranoC = await loadCandidates(B, VERANO_CANDS, true, 18);
  const nieveC = await loadCandidates(C, NIEVE_CANDS, true, 150);

  // Convocatoria y enlaces públicos
  await prisma.project.updateMany({
    where: { id: A, companyId },
    data: { registrationStatus: 'CLOSED', registrationOpensAt: daysAgo(80), registrationClosesAt: daysAgo(30), maxCandidates: 12, registrationBenefits: ['Clases de pasarela y oratoria', 'Maquillaje y peinado profesional el día de la gala', 'Sesión de fotos oficial', 'Vestuario de gala y de fantasía', 'Entradas para tu familia'], registrationClassesNote: 'Martes y jueves, 19:00 h, en Centro de Eventos Pewma', candidateProgramFee: 600_000, franchiseCost: 120_000 },
  });
  await prisma.project.updateMany({
    where: { id: B, companyId },
    data: { registrationStatus: 'OPEN', registrationOpensAt: daysAgo(18), registrationClosesAt: new Date(Date.now() + 25 * 86_400_000), maxCandidates: 10, registrationBenefits: ['Clases de pasarela y oratoria', 'Maquillaje y peinado profesional', 'Sesión de fotos oficial', 'Entradas para tu familia'], registrationClassesNote: 'Sábados, 11:00 h, en Villarrica', candidateProgramFee: 550_000, franchiseCost: 110_000 },
  });
  await prisma.project.updateMany({ where: { id: C, companyId }, data: { registrationStatus: 'ARCHIVED' } });
  for (const pid of [A, B]) await getOrCreateRegistrationToken(companyId, pid);

  // Contratos de imagen firmados (centro de mando)
  for (const c of fiestaC.filter((x) => x.seed.status === 'OFFICIAL_CANDIDATE').slice(0, 8)) {
    await prisma.candidateDocument.create({
      data: { companyId, candidateId: c.id, title: 'Contrato de uso de imagen', documentType: 'CONTRACT_IMAGE', fileUrl: `r2private:///candidates/${companyId}/documents/${c.id}-contrato.pdf`, status: 'SIGNED', signedAt: daysAgo(40 - Math.floor(rnd() * 15)) },
    });
  }
  for (const c of fiestaC.filter((x) => x.seed.status === 'OFFICIAL_CANDIDATE').slice(8)) {
    await prisma.candidateDocument.create({
      data: { companyId, candidateId: c.id, title: 'Contrato de uso de imagen', documentType: 'CONTRACT_IMAGE', fileUrl: `r2private:///candidates/${companyId}/documents/${c.id}-contrato.pdf`, status: 'PENDING' },
    });
  }

  // Sesiones de preparación y asistencia
  const pasarela = await createSessionSeries(companyId, sessionSeriesCreateSchema.parse({ projectId: A, activityType: 'PASARELA', title: 'Clase de pasarela', location: 'Centro de Eventos Pewma', startDate: isoDay(-42), endDate: isoDay(-3), daysOfWeek: [2, 4], time: '19:00' }));
  const oratoria = await createSessionSeries(companyId, sessionSeriesCreateSchema.parse({ projectId: A, activityType: 'ORATORIA', title: 'Taller de oratoria', location: 'Sala Pewma 2', startDate: isoDay(-40), endDate: isoDay(-5), daysOfWeek: [3], time: '18:30' }));
  await createSessionSeries(companyId, sessionSeriesCreateSchema.parse({ projectId: A, activityType: 'ENSAYO', title: 'Ensayo general de gala', location: 'Centro de Eventos Pewma', startDate: isoDay(7), endDate: isoDay(10), daysOfWeek: [0, 1, 2, 3, 4, 5, 6], time: '16:00' }));
  const officialA = fiestaC.filter((x) => x.seed.status === 'OFFICIAL_CANDIDATE');
  for (const s of [...pasarela, ...oratoria]) {
    if (s.date.getTime() > Date.now()) continue;
    await saveSessionAttendance(companyId, s.id, { entries: officialA.map((c) => ({ candidateId: c.id, attended: rnd() > (c.seed.strength ?? 0.5) * 0.12 + 0.02 })) });
  }
  void getSession;
  void listSessions;

  // Cuotas del programa de preparación
  for (const [i, c] of officialA.entries()) {
    const plan = await createPaymentPlan(companyId, paymentPlanCreateSchema.parse({ clientType: 'CANDIDATE', candidateId: c.id, totalAmount: 600_000, installmentCount: 6, frequency: 'MONTHLY', startDate: isoDay(-65), penaltyBps: 200, notes: 'Programa de preparación del certamen' }));
    const paidCount = i < 4 ? 3 : i < 7 ? 2 : i < 9 ? 1 : 0;
    const installments = [...plan.installments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    for (let k = 0; k < paidCount; k++) await registerInstallmentPayment(companyId, installments[k]!.id, installments[k]!.amount, 'TRANSFERENCIA', daysAgo(60 - k * 28));
  }

  // ── Jurado: ronda en votación con puntajes enviados ─────────────────────
  const r1 = await createRound(companyId, competitionRoundCreateSchema.parse({ projectId: A, order: 1, name: 'Semifinal — presentación y pasarela', cutOffCount: 5, isFinalRound: false }));
  await createRound(companyId, competitionRoundCreateSchema.parse({ projectId: A, order: 2, name: 'Gran final', cutOffCount: null, isFinalRound: true }));
  const rounds = await prisma.competitionRound.findMany({ where: { companyId, projectId: A }, orderBy: { order: 'asc' } });
  const final = rounds[1]!;
  const crit = [
    ['Presencia escénica', 3000],
    ['Pasarela y elegancia', 2500],
    ['Oratoria y comunicación', 2500],
    ['Proyecto social', 2000],
  ] as const;
  const critIds: string[] = [];
  for (const [i, [name, w]] of crit.entries()) critIds.push((await createCategory(companyId, judgingCategoryCreateSchema.parse({ roundId: r1.id, name, weightBps: w, maxScore: 10, order: i }))).id);
  for (const [i, [name, w]] of [['Pasarela de gala', 3000], ['Ronda de preguntas', 3500], ['Proyecto social y trayectoria', 3500]].entries()) {
    await createCategory(companyId, judgingCategoryCreateSchema.parse({ roundId: final.id, name, weightBps: w as number, maxScore: 10, order: i }));
  }
  const judges = [
    ['Marcela Quintana Orellana', 'Directora de Casting y moda'],
    ['Alberto Cares Millar', 'Periodista cultural'],
    ['Dra. Soledad Parada Neira', 'Médica y académica universitaria'],
    ['Rodolfo Epulef Antipán', 'Coreógrafo y bailarín'],
    ['Gabriela Fuentealba Ríos', 'Reina Fiesta de la Primavera 2019'],
  ] as const;
  const judgeAssignments = [];
  for (const [name] of judges) judgeAssignments.push(await createJudgeAssignment(companyId, judgeAssignmentCreateSchema.parse({ projectId: A, judgeName: name, judgeEmail: name.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '') + '@jurado.local' })));
  await openRound(companyId, r1.id);
  for (const [ji, ja] of judgeAssignments.entries()) {
    const coverage = ji < 4 ? 1 : 0.6; // el 5.º jurado va a medias
    const list = officialA.slice(0, Math.ceil(officialA.length * coverage));
    for (const c of list) {
      for (const [ci, cid] of critIds.entries()) {
        const base = 5 + (c.seed.strength ?? 0.5) * 4.2;
        const score = Math.max(4, Math.min(10, Math.round(base + (rnd() - 0.5) * 1.8 + (ci === 3 ? 0.2 : 0))));
        await submitScore(ja.accessToken, { candidateId: c.id, categoryId: cid, score });
      }
    }
  }

  // ── Producción en vivo: escaleta, vestuario, acreditación ────────────────
  const gala = new Date('2026-12-12T21:00:00-03:00');
  const stage: Array<[string, string, number, string, string, string?, string?, string?]> = [
    ['OPENING', 'Apertura audiovisual y baile de apertura', 8, 'Javier Henríquez', 'Intro video "Primavera" + entrada de bailarines', 'Pista A: Apertura', 'Blackout → Cenital cálido'],
    ['PRESENTATION', 'Presentación de las 10 candidatas', 14, 'Cristóbal Medina (animador)', 'Música suave de fondo', 'Pista B: Presentación', 'Seguimiento a cada candidata'],
    ['SPONSOR', 'Mención de auspiciadores principales', 2, 'Cristóbal Medina (animador)', 'Locución de menciones', 'Cuña grabada auspicios', 'Pantalla con logos'],
    ['ARTISTIC', 'Número artístico: ballet folclórico', 6, 'Macarena Ibáñez', 'Cueca y música de raíz', 'Pista C: Ballet', 'Cálida lateral'],
    ['NATIONAL_COSTUME', 'Traje típico / fantasía de primavera', 12, 'Coordinación de escenario', 'Desfile con música instrumental', 'Pista D: Fantasía', 'Barridos de color'],
    ['BREAK', 'Pausa comercial', 5, 'Javier Henríquez', 'Música ambiente', 'Pista ambiente', 'Luz de sala'],
    ['EVENING_GOWN', 'Pasarela de gala', 15, 'Macarena Ibáñez', 'Orquesta en vivo', 'Pista E: Gala', 'Cenital + contraluz'],
    ['ARTISTIC', 'Show musical invitado', 8, 'Producción ejecutiva', 'Banda en vivo (2 temas)', 'Mix en vivo', 'Show de luces'],
    ['QUESTION', 'Ronda de preguntas (Top 5)', 15, 'Cristóbal Medina (animador)', 'Silencio de sala / micrófono inalámbrico', 'Micrófonos candidatas', 'Luz blanca fija'],
    ['SPONSOR', 'Mención de auspiciadores oficiales', 2, 'Cristóbal Medina (animador)', 'Locución', 'Cuña auspicios 2', 'Pantalla logos'],
    ['BREAK', 'Pausa — cambio de vestuario', 5, 'Fernanda Lagos', 'Música ambiente', 'Pista ambiente', 'Luz de sala'],
    ['ARTISTIC', 'Homenaje a la Fiesta de la Primavera histórica', 6, 'Matías Soto', 'Video archivo + música de época', 'Pista F: Homenaje', 'Sepia / cálida'],
    ['OTHER', 'Escrutinio: entrega de actas del jurado', 10, 'Notaria / Producción', 'Música tensa suave', 'Pista G: Suspenso', 'Luz tenue'],
    ['CROWNING', 'Coronación y entrega de premios', 12, 'Daniela Ortiz', 'Fanfarria + himno', 'Pista H: Coronación', 'Cenital dorada + confeti'],
    ['OTHER', 'Cierre, foto oficial y despedida', 6, 'Cristóbal Medina (animador)', 'Música de cierre', 'Pista I: Cierre', 'Luces de sala'],
  ];
  for (const [seg, title, mins, resp, desc, audio, light] of stage) {
    await createStageItem(companyId, stageTimelineItemCreateSchema.parse({ projectId: A, startTime: gala, durationMinutes: mins, title, segmentType: seg, responsible: resp, description: desc, audioCue: audio, lightingCue: light }));
  }
  await chainStageSchedule(companyId, A, gala);
  await generateWardrobePlan(companyId, A);
  const wardrobe = await prisma.wardrobeItem.findMany({ where: { companyId, projectId: A }, orderBy: { createdAt: 'asc' } });
  for (const [i, w] of wardrobe.entries()) {
    const status = i % 7 === 0 ? 'ISSUED' : i % 3 === 0 ? 'READY' : 'PENDING';
    await prisma.wardrobeItem.updateMany({ where: { id: w.id, companyId }, data: { status, source: pick(['PRODUCTION', 'DESIGNER', 'SPONSOR', 'RENTAL'] as const), designer: pick(['Atelier Boldo', 'Casa Moda Sur', 'Taller Lafkén', 'Diseños Aurora']), fittingAt: new Date(Date.now() + (i % 9) * 86_400_000), size: pick(['34', '36', '38']), color: pick(['Verde jade', 'Rosa palo', 'Dorado', 'Marfil', 'Esmeralda']) } });
  }
  void createWardrobeItem;
  void wardrobeItemCreateSchema;
  const tpl = await createBadgeTemplate(companyId, badgeTemplateCreateSchema.parse({ projectId: A, name: 'Credencial Primavera', backgroundMode: 'COLOR', backgroundColor: '#1f5a3c', accentColor: '#dbc076', textColor: '#ffffff', isDefault: true }));
  const accreds: Array<[string, string, string, 'GENERAL' | 'BACKSTAGE' | 'VIP' | 'STAFF']> = [
    ['Daniela Ortiz', 'Dirección general', 'CR Producciones', 'STAFF'],
    ['Matías Soto', 'Producción ejecutiva', 'CR Producciones', 'STAFF'],
    ['Javier Henríquez', 'Jefe de escenario', 'CR Producciones', 'STAFF'],
    ['Fernanda Lagos', 'Coordinación backstage', 'CR Producciones', 'BACKSTAGE'],
    ['Cristóbal Medina', 'Animador', 'Prestador externo', 'BACKSTAGE'],
    ['Macarena Ibáñez', 'Directora coreográfica', 'Prestador externo', 'BACKSTAGE'],
    ['Tamara Villagrán', 'Maquillaje y peinado', 'Prestador externo', 'BACKSTAGE'],
    ['Equipo Sonido Austral (4)', 'Sonido e iluminación', 'Sonido e Iluminación Austral SpA', 'STAFF'],
    ['Alcalde(sa) invitado(a)', 'Autoridad', 'Municipalidad', 'VIP'],
    ['Paula Navarrete', 'Atención a auspiciadores', 'CR Producciones', 'VIP'],
    ['Prensa regional (3)', 'Prensa acreditada', 'Medios locales', 'GENERAL'],
    ['Seguridad (6)', 'Control de acceso', 'Seguridad Cordillera', 'STAFF'],
  ];
  for (const [i, [fullName, role, organization, accessLevel]] of accreds.entries()) {
    await createStaffAccreditation(companyId, staffAccreditationCreateSchema.parse({ projectId: A, fullName, role, organization, accessLevel, badgeCode: `FPT-${String(i + 1).padStart(3, '0')}`, templateId: tpl.id }));
  }

  // ── Auspicios: tarifario, contratos y entregables ────────────────────────
  for (const [tier, name, price, slots, order, benefits] of [
    ['TITULAR_MAIN_SPONSOR', 'Auspiciador Principal', 6_000_000, 1, 1, ['Naming del certamen en toda la comunicación', 'Logo en backdrop, pantallas y afiches', '10 entradas VIP', 'Espacio de marca en el hall']],
    ['GOLD', 'Auspiciador Gold', 3_500_000, 3, 2, ['Logo en backdrop y pantallas', 'Mención en la animación', '6 entradas VIP']],
    ['SILVER', 'Auspiciador Silver', 2_000_000, 5, 3, ['Logo en pantallas', 'Mención en redes sociales', '4 entradas']],
    ['BRONZE', 'Auspiciador Bronce', 800_000, 8, 4, ['Logo en el sitio web', '2 entradas']],
  ] as const) {
    await createPackage(companyId, sponsorshipPackageSchema.parse({ projectId: A, tier, name, price, maxSlots: slots, order, isPublic: true, benefits: [...benefits] }));
  }
  const contracts: Array<{ brand: string; tier: 'TITULAR_MAIN_SPONSOR' | 'GOLD' | 'SILVER' | 'BRONZE' | 'MEDIA_PARTNER' | 'CANJE_BARTER' | 'OFFICIAL_SPONSOR'; cash: number; paid: number; barter?: number; barterDesc?: string; status: 'PROPOSAL' | 'CONFIRMED'; del: Array<[string, 'MENCION' | 'BACKSTAGE' | 'PAUTA' | 'OTRO', number, boolean]> }> = [
    { brand: 'Clínica Dental Sonríe', tier: 'TITULAR_MAIN_SPONSOR', cash: 6_000_000, paid: 6_000_000, status: 'CONFIRMED', del: [['Naming en afiches y redes', 'OTRO', -20, true], ['Logo en backdrop de gala', 'OTRO', 5, false], ['Mención en la animación (3 veces)', 'MENCION', 9, false], ['Espacio de marca en el hall', 'BACKSTAGE', 10, false], ['Pauta en Instagram (4 posts)', 'PAUTA', -4, true]] },
    { brand: 'Inmobiliaria Cordillera Sur', tier: 'GOLD', cash: 3_500_000, paid: 3_500_000, status: 'CONFIRMED', del: [['Logo en pantallas', 'OTRO', 8, false], ['Mención en la animación', 'MENCION', 9, false], ['Entradas VIP (6)', 'OTRO', -3, true]] },
    { brand: 'Radio Pewma FM', tier: 'MEDIA_PARTNER', cash: 0, paid: 0, barter: 2_800_000, barterDesc: 'Difusión en radio (60 cuñas) y transmisión de la gala', status: 'CONFIRMED', del: [['60 cuñas de difusión', 'PAUTA', 8, false], ['Transmisión en vivo de la gala', 'OTRO', 11, false]] },
    { brand: 'Viña Los Aromos', tier: 'CANJE_BARTER', cash: 500_000, paid: 500_000, barter: 1_500_000, barterDesc: 'Vinos y espumante para la gala y el cóctel de auspiciadores', status: 'CONFIRMED', del: [['Logo en carta del cóctel', 'OTRO', 8, false], ['Brindis oficial en la coronación', 'MENCION', 11, false]] },
    { brand: 'Hotel Pillán', tier: 'SILVER', cash: 2_000_000, paid: 1_000_000, status: 'CONFIRMED', del: [['Logo en pantallas', 'OTRO', 8, false], ['Alojamiento del jurado (canje)', 'OTRO', -1, false]] },
    { brand: 'Supermercados Del Sur', tier: 'SILVER', cash: 2_000_000, paid: 0, status: 'PROPOSAL', del: [] },
    { brand: 'Ferretería El Roble', tier: 'BRONZE', cash: 800_000, paid: 800_000, status: 'CONFIRMED', del: [['Logo en el sitio web', 'OTRO', -10, true]] },
    { brand: 'Pastelería Maitén', tier: 'OFFICIAL_SPONSOR', cash: 0, paid: 0, barter: 600_000, barterDesc: 'Cóctel de bienvenida y torta de coronación', status: 'CONFIRMED', del: [['Menciones en redes (2)', 'MENCION', 7, false]] },
  ];
  for (const c of contracts) {
    const contract = await createSponsorshipContract(
      companyId,
      sponsorshipContractCreateSchema.parse({ projectId: A, contactId: sponsorIds[c.brand], tier: c.tier, cashAmount: c.cash, isBarter: c.barter !== undefined, barterValuation: c.barter, barterDescription: c.barterDesc, status: c.status })
    );
    if (c.paid > 0) await updateSponsorshipPayment(companyId, contract.id, { paidAmount: c.paid, method: 'TRANSFERENCIA' });
    for (const [title, type, due, done] of c.del) {
      const d = await addDeliverable(companyId, contract.id, deliverableCreateSchema.parse({ title, type, dueDate: isoDay(due) }));
      if (done) await toggleDeliverable(companyId, d.id);
    }
  }
  // Certamen anterior: auspicios ya cumplidos
  for (const [brand, tier, cash] of [['Transportes Araucanía Bus', 'GOLD', 2_500_000], ['Taller Lafkén Joyas', 'SILVER', 1_200_000]] as const) {
    const k = await createSponsorshipContract(companyId, sponsorshipContractCreateSchema.parse({ projectId: C, contactId: sponsorIds[brand], tier, cashAmount: cash, status: 'CONFIRMED' }));
    await updateSponsorshipPayment(companyId, k.id, { paidAmount: cash, method: 'TRANSFERENCIA' });
    await prisma.sponsorshipContract.updateMany({ where: { id: k.id, companyId }, data: { status: 'COMPLETED' } });
  }

  // ── CRM: embudo de auspicios ─────────────────────────────────────────────
  const opps: Array<[string, string | undefined, string | undefined, number, 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON', 'SPONSORSHIP' | 'CORPORATE_TICKETS' | 'MEDIA' | 'EVENT_PRODUCTION', number, string]> = [
    ['Auspicio Silver — Supermercados Del Sur', 'Supermercados Del Sur', undefined, 2_000_000, 'NEGOTIATION', 'SPONSORSHIP', 9, A],
    ['Auspicio Gold — Taller Lafkén Joyas', 'Taller Lafkén Joyas', undefined, 3_500_000, 'PROPOSAL', 'SPONSORSHIP', 14, A],
    ['Mesas corporativas — Transportes Araucanía Bus', 'Transportes Araucanía Bus', undefined, 1_800_000, 'QUALIFIED', 'CORPORATE_TICKETS', 20, A],
    ['Auspicio principal Villarrica 2027', undefined, 'Hotel Lago Calafquén', 6_000_000, 'LEAD', 'SPONSORSHIP', 45, B],
    ['Cobertura de transmisión en vivo', undefined, 'TV Región Sur', 2_400_000, 'PROPOSAL', 'MEDIA', 30, B],
    ['Gala de aniversario — Inmobiliaria Cordillera Sur', 'Inmobiliaria Cordillera Sur', undefined, 5_200_000, 'LEAD', 'EVENT_PRODUCTION', 60, A],
    ['Auspicio Gold — Clínica Dental Sonríe', 'Clínica Dental Sonríe', undefined, 6_000_000, 'WON', 'SPONSORSHIP', -40, A],
    ['Canje Radio Pewma FM', 'Radio Pewma FM', undefined, 2_800_000, 'WON', 'MEDIA', -25, A],
  ];
  for (const [title, brand, prospect, amount, stage2, dealType, close, projectId] of opps) {
    await createOpportunity(companyId, opportunityCreateSchema.parse({ title, contactId: brand ? sponsorIds[brand] : undefined, prospectName: prospect, amount, stage: stage2, dealType, expectedCloseDate: isoDay(close), ownerUserId: userIds['auspicios@crproducciones.local'], projectId }));
  }

  // ── Entradas y votación del público ──────────────────────────────────────
  const types = [
    ['Entrada General', 8_000, 600],
    ['Entrada VIP (zona preferente)', 25_000, 80],
    ['Palco empresa (10 personas)', 180_000, 8],
  ] as const;
  const ticketTypeIds: Record<string, { id: string; price: number }> = {};
  for (const [name, price, qty] of types) {
    const t = await createTicketType(companyId, ticketTypeCreateSchema.parse({ projectId: A, name, price, quantityAvailable: qty, salesOpen: true }));
    ticketTypeIds[name] = { id: t.id, price };
  }
  const ticketToken = await getOrCreateTicketSalesToken(companyId, A);
  const buyers = ['Constanza Vera', 'Felipe Araya', 'Marcela Ríos', 'Tomás Becerra', 'Daniela Zúñiga', 'Cristian Palma', 'Lorena Oyarzún', 'Esteban Cares', 'Paulina Mena', 'Joaquín Sanhueza', 'Karen Figueroa', 'Gonzalo Lizama', 'Alejandra Pinto', 'Sergio Barría', 'Natalia Cuevas', 'Mauricio Toro', 'Carolina Espinoza', 'Hernán Mora', 'Verónica Silva', 'Patricio Leal', 'Andrea Jara', 'Ricardo Opazo', 'Pamela Soto', 'Claudio Vidal', 'Ximena Gallardo', 'Raúl Contreras', 'Beatriz Yáñez', 'Óscar Ulloa', 'Marisol Peña', 'Iván Carrasco', 'Fabiola Rojas', 'Leonardo Bravo', 'Teresa Aguilar', 'Nelson Campos', 'Jocelyn Maldonado', 'Rodrigo Pizarro', 'Yasna Hidalgo', 'Bastián Ñanco', 'Francisca Lemus', 'Eduardo Trigo', 'Macarena Burgos', 'Samuel Anguita', 'Ignacio Sáez', 'Loreto Aburto', 'Víctor Lepe', 'Daniela Mansilla', 'Cecilia Jofré', 'Marcos Painecura', 'Paola Henríquez', 'Alonso Curín'];
  const orderIds: Array<{ id: string; total: number }> = [];
  for (const [i, b] of buyers.entries()) {
    const typeName = i % 11 === 0 ? 'Palco empresa (10 personas)' : i % 4 === 0 ? 'Entrada VIP (zona preferente)' : 'Entrada General';
    const t = ticketTypeIds[typeName]!;
    const qty = typeName.startsWith('Palco') ? 1 : typeName.startsWith('Entrada VIP') ? 2 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 5);
    const { sale } = await createPublicTicketOrder(ticketToken, { ticketTypeId: t.id, buyerName: b, buyerEmail: `${b.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, '.')}.${i}@correo.local`, buyerPhone: '+56 9 ' + String(4000_0000 + i * 137_911), quantity: qty });
    orderIds.push({ id: sale.id, total: sale.totalAmount });
  }
  for (const [i, o] of orderIds.entries()) {
    if (i % 7 === 6) continue; // sin pagar (reservada)
    const paid = i % 9 === 4 ? Math.floor(o.total / 2) : o.total;
    await confirmTicketPayment(companyId, o.id, { paidAmount: paid });
  }
  for (const [i, o] of orderIds.entries()) await prisma.ticketSale.updateMany({ where: { id: o.id, companyId }, data: { createdAt: daysAgo(32 - Math.floor((i / orderIds.length) * 30)) } });

  const voteToken = await getOrCreateVoteSalesToken(companyId, A, 1000);
  const voters = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'];
  let voteIndex = 0;
  const voteOrderIds: string[] = [];
  for (const c of officialA) {
    const strength = c.seed.strength ?? 0.5;
    const orders = 3 + Math.floor(strength * 6);
    for (let k = 0; k < orders; k++) {
      const count = pick([5, 10, 10, 20, 20, 50, 50, 100]);
      const { order } = await createPublicVoteOrder(voteToken, { candidateId: c.id, buyerEmail: `votante${voteIndex}.${pick(voters)}@correo.local`, voteCount: count });
      voteIndex++;
      voteOrderIds.push(order.id);
      if (rnd() > 0.12) await confirmVotePayment(companyId, order.id, { paidAmount: order.totalAmount });
    }
  }
  for (const id of voteOrderIds) await prisma.voteOrder.updateMany({ where: { id, companyId }, data: { createdAt: daysAgo(Math.floor(rnd() * 28)) } });

  // ── Finanzas del certamen: gastos con proveedores y honorarios ───────────
  const expenses: Array<[number, string, number, number, string]> = [
    [1, 'Arriendo Centro de Eventos Pewma — gala y 3 ensayos', 1, 2_400_000, 'F-2231'],
    [0, 'Sonido, iluminación y pantalla LED — gala', 1, 3_900_000, 'F-8814'],
    [2, 'Escenografía y ambientación floral primavera', 1, 1_900_000, 'F-0457'],
    [3, 'Cóctel de auspiciadores y catering backstage', 1, 900_000, 'F-3320'],
    [4, 'Afiches, credenciales y programa impreso', 1, 550_000, 'F-1177'],
  ];
  for (const [pi, description, quantity, unitCost, folio] of expenses) {
    const doc = await createPurchaseDocument(
      companyId,
      purchaseDocumentCreateSchema.parse({ contactId: providerIds[pi], documentType: 'FACTURA', folio, issueDate: isoDay(-Math.floor(rnd() * 40) - 3), dueDate: isoDay(Math.floor(rnd() * 25)), paymentMethod: 'TRANSFERENCIA', items: [{ description, quantity, unitCost, isExempt: false }] }),
      'ISSUED'
    );
    await prisma.purchaseDocument.updateMany({ where: { id: doc.id, companyId }, data: { projectId: A } });
  }
  for (const [i, f] of FREELANCERS.entries()) {
    const fee = await createFeeDocument(companyId, feeDocumentCreateSchema.parse({ contactId: freelancerIds[i], projectId: A, folioNumber: f.folio, issueDate: isoDay(-18 - i * 3), serviceDescription: f.desc, grossAmount: f.fee }));
    if (f.paid) await markFeeDocumentPaid(companyId, fee.id, daysAgo(10 - i));
  }

  // ── Tareas del equipo ────────────────────────────────────────────────────
  const actor = { companyId, userId: ownerId, canManage: true };
  for (const [title, due, who, prio] of [
    ['Confirmar sonido e iluminación para la gala', 3, 'escenario@crproducciones.local', 'HIGH'],
    ['Enviar contratos de imagen pendientes a 2 candidatas', 1, 'candidatas@crproducciones.local', 'HIGH'],
    ['Cobrar saldo de Hotel Pillán ($1.000.000)', 5, 'auspicios@crproducciones.local', 'NORMAL'],
    ['Cuadrar pagos de cuotas de candidatas de noviembre', 2, 'finanzas@crproducciones.local', 'NORMAL'],
    ['Imprimir credenciales de staff y prensa', 6, 'produccion@crproducciones.local', 'NORMAL'],
    ['Reunión con el jurado: criterios de la final', 4, 'produccion@crproducciones.local', 'HIGH'],
    ['Publicar cuenta regresiva en Instagram', 0, 'auspicios@crproducciones.local', 'LOW'],
    ['Cerrar convocatoria Villarrica: revisar postulaciones', 7, 'candidatas@crproducciones.local', 'NORMAL'],
  ] as const) {
    await createTask(actor, taskSchema.parse({ title, dueDate: isoDay(due), assigneeId: userIds[who], priority: prio }));
  }

  // ── Micrositios públicos ─────────────────────────────────────────────────
  const logoPool = SPONSORS.slice(0, 8).map((s) => ({ name: s.file, url: asset(`logos/${s.file}.png`) }));
  const fiestaDesign = buildFiestaDesign(logoPool);
  await prisma.project.updateMany({
    where: { id: A, companyId },
    data: {
      publicSlug: FIESTA.slug,
      publicSiteEnabled: true,
      publicTagline: FIESTA.tagline,
      publicDescription: FIESTA.description,
      publicAccent: FIESTA.accent,
      publicSiteDesign: fiestaDesign,
      coverImageUrl: asset('covers/primavera.jpg'),
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      showVoteRankingPublic: true,
      sponsorLeadFormEnabled: true,
      publicContactEmail: 'contacto@fiestaprimaveratemuco.local',
      directorName: 'Daniela Ortiz',
      directorTitle: 'Directora',
      directorRole: 'Directora general · CR Producciones',
      directorBio: 'Productora de eventos con más de diez años organizando certámenes y galas en la Araucanía. Lidera a un equipo que acompaña a cada candidata desde la postulación hasta la coronación.',
      directorPhotoUrl: asset('portraits/director.jpg'),
      directorHighlights: ['Más de 10 certámenes producidos en La Araucanía', 'Galas con más de 1.500 asistentes', 'Programa de preparación integral para candidatas'],
      sponsorExclusivityNote: 'Un auspiciador principal por rubro: consulta disponibilidad.',
      faviconUrl: null,
      footerPartners: { title: 'Con el apoyo de', items: SPONSORS.slice(0, 4).map((s, i) => ({ id: `p${i + 1}`, name: s.file, logoUrl: asset(`logos/${s.file}.png`), href: null })) },
    },
  });
  await prisma.project.updateMany({
    where: { id: B, companyId },
    data: {
      publicSlug: 'reina-del-verano-villarrica-2027',
      publicSiteEnabled: true,
      publicTagline: 'El verano de Villarrica elige a su reina: postula, vota y vive la gran noche frente al lago.',
      publicDescription: 'Una noche de costanera, música y cultura del sur para elegir a la Reina del Verano Villarrica 2027. Postula, conoce a las candidatas y acompáñanos el 20 de febrero.',
      publicAccent: 'cyan',
      coverImageUrl: asset('covers/verano.jpg'),
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      sponsorLeadFormEnabled: true,
      publicContactEmail: 'contacto@reinaveranovillarrica.local',
    },
  });
  await prisma.project.updateMany({
    where: { id: C, companyId },
    data: {
      publicSlug: 'reina-de-la-nieve-lonquimay-2025',
      publicSiteEnabled: true,
      publicTagline: 'Lonquimay ya tiene reina: revive la gala de la Reina de la Nieve 2025.',
      publicDescription: 'Edición 2025 del certamen que celebra la cordillera, la nieve y las raíces de Lonquimay.',
      publicAccent: 'violet',
      coverImageUrl: asset('covers/otono.jpg'),
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      showResultsPublic: true,
      showVoteRankingPublic: true,
    },
  });
  const winners: Array<[string, string, number, number, string, boolean]> = [
    ['Gabriela Fuentealba', 'Reina Fiesta de la Primavera', 2025, 1, 'Representó a Pueblo Nuevo', true],
    ['Alejandra Quintrel', 'Virreina', 2025, 2, 'Representó a Labranza', true],
    ['Nicole Hueche', 'Reina de la Simpatía', 2025, 3, 'Representó a Padre Las Casas', true],
    ['Rocío Cañulef', 'Reina Fiesta de la Primavera', 2024, 4, 'Representó a Barrio Inglés', false],
  ];
  for (const [name, title, year, photo, note, featured] of winners) {
    await prisma.pastWinner.create({ data: { companyId, projectId: A, name, title, year, note, photoUrl: asset(`portraits/winner-${photo}.jpg`), featured } });
  }

  // Fechas de creación de los certámenes (orden natural en listados)
  await prisma.project.updateMany({ where: { id: A, companyId }, data: { createdAt: daysAgo(85) } });
  await prisma.project.updateMany({ where: { id: B, companyId }, data: { createdAt: daysAgo(20) } });
  await prisma.project.updateMany({ where: { id: C, companyId }, data: { createdAt: new Date('2025-04-10') } });
  void nieveC;
  void veranoC;

  console.log('\nListo. Empresa:', companyId);
  console.log('Login:', DEMO_EMAIL, '/', DEMO_PASSWORD);
  console.log('Certámenes:', { fiesta: A, verano: B, nieve: C });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
