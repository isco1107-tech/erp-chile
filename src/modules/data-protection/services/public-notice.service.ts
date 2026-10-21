import { prisma } from '@/lib/prisma';
import { cleanRut } from '@/lib/chile/rut';
import { isLegalEntityRut } from '@/lib/privacy/constants';

/**
 * Aviso de privacidad de los formularios públicos que NO son la postulación
 * (esa tiene su política propia en `/politica-privacidad`): venta de entradas,
 * compra de votos, pago de cuotas, portal del auspiciador y encuesta.
 *
 * La Ley 21.719 exige informar ANTES de recopilar quién es el responsable,
 * para qué se usan los datos y cómo ejercer los derechos. El responsable sale
 * SIEMPRE del token del enlace público que la persona ya tiene (el mismo que
 * abre el formulario), nunca de un parámetro libre: así el aviso no se puede
 * usar para enumerar empresas ni para mostrar datos de otra.
 */

export const PUBLIC_NOTICE_FLOWS = ['entradas', 'votos', 'cuotas', 'auspicio', 'encuesta', 'sitio', 'academia'] as const;
export type PublicNoticeFlow = (typeof PUBLIC_NOTICE_FLOWS)[number];

/** Flujo → id de `PROCESSING_ACTIVITIES` que describe sus datos. */
export const FLOW_ACTIVITY: Record<PublicNoticeFlow, string> = {
  entradas: 'ticketing',
  votos: 'public-voting',
  cuotas: 'payment-plans',
  auspicio: 'sponsorships',
  encuesta: 'customer-care',
  sitio: 'web-contact',
  academia: 'academy-enrollment',
};

export const FLOW_LABELS: Record<PublicNoticeFlow, string> = {
  entradas: 'Compra de entradas',
  votos: 'Votación del público',
  cuotas: 'Pago de cuotas en línea',
  auspicio: 'Portal del auspiciador',
  encuesta: 'Encuesta de satisfacción',
  sitio: 'Formulario de contacto',
  academia: 'Inscripción a la academia',
};

export interface PublicNoticeInfo {
  flow: PublicNoticeFlow;
  companyName: string;
  /** Solo si es persona jurídica: el RUT y el domicilio de una persona natural son datos personales suyos. */
  companyRut: string | null;
  companyAddress: string | null;
  contactEmail: string | null;
  /** Nombre del certamen/evento, cuando el flujo pertenece a uno. */
  projectName: string | null;
  privacyPortalToken: string | null;
}

export function isPublicNoticeFlow(value: unknown): value is PublicNoticeFlow {
  return typeof value === 'string' && (PUBLIC_NOTICE_FLOWS as readonly string[]).includes(value);
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
/** El slug de un sitio es público (está en su URL), así que es más corto que un token. */
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

const companySelect = {
  businessName: true,
  rut: true,
  status: true,
  address: true,
  comuna: true,
  ciudad: true,
  email: true,
  settings: { select: { privacyPortalToken: true } },
} as const;

type CompanyRow = {
  businessName: string;
  rut: string;
  status: string;
  address: string | null;
  comuna: string | null;
  ciudad: string | null;
  email: string | null;
  settings: { privacyPortalToken: string | null } | null;
};

async function resolveSource(
  flow: PublicNoticeFlow,
  token: string
): Promise<{ company: CompanyRow; projectName: string | null; contactEmail: string | null } | null> {
  switch (flow) {
    case 'entradas':
    case 'votos': {
      const project = await prisma.project.findFirst({
        where: flow === 'entradas' ? { ticketSalesToken: token } : { voteSalesToken: token },
        select: { name: true, publicContactEmail: true, company: { select: companySelect } },
      });
      return project ? { company: project.company, projectName: project.name, contactEmail: project.publicContactEmail } : null;
    }
    case 'auspicio': {
      const contract = await prisma.sponsorshipContract.findFirst({
        where: { portalToken: token },
        select: { project: { select: { name: true, publicContactEmail: true } }, company: { select: companySelect } },
      });
      return contract
        ? { company: contract.company, projectName: contract.project.name, contactEmail: contract.project.publicContactEmail }
        : null;
    }
    case 'cuotas': {
      const settings = await prisma.companySettings.findFirst({
        where: { installmentPortalToken: token },
        select: { company: { select: companySelect } },
      });
      return settings ? { company: settings.company, projectName: null, contactEmail: null } : null;
    }
    case 'sitio': {
      // Solo sitios publicados: un borrador no debe revelar a qué empresa pertenece.
      const site = await prisma.webSite.findFirst({ where: { slug: token, status: 'PUBLISHED' }, select: { company: { select: companySelect } } });
      return site ? { company: site.company, projectName: null, contactEmail: null } : null;
    }
    case 'academia': {
      const settings = await prisma.companySettings.findFirst({
        where: { academyEnrollmentToken: token },
        select: { company: { select: companySelect } },
      });
      return settings ? { company: settings.company, projectName: null, contactEmail: null } : null;
    }
    case 'encuesta': {
      const survey = await prisma.customerSurvey.findFirst({ where: { token }, select: { company: { select: companySelect } } });
      return survey ? { company: survey.company, projectName: null, contactEmail: null } : null;
    }
  }
}

export async function getPublicNoticeInfo(flow: PublicNoticeFlow, rawToken: string | undefined): Promise<PublicNoticeInfo | null> {
  if (!rawToken || !(flow === 'sitio' ? SLUG_PATTERN : TOKEN_PATTERN).test(rawToken)) return null;
  const source = await resolveSource(flow, rawToken);
  if (!source) return null;
  const { company } = source;
  // Una empresa suspendida o cancelada no publica más que su nombre.
  const operational = company.status === 'ACTIVE' || company.status === 'TRIAL';
  const publishIdentity = operational && isLegalEntityRut(cleanRut(company.rut));
  const address = [company.address, company.comuna, company.ciudad].filter(Boolean).join(', ');
  return {
    flow,
    companyName: company.businessName,
    companyRut: publishIdentity ? company.rut : null,
    companyAddress: publishIdentity ? address || null : null,
    contactEmail: operational ? (source.contactEmail ?? (publishIdentity ? company.email : null)) : null,
    projectName: source.projectName,
    privacyPortalToken: operational ? (company.settings?.privacyPortalToken ?? null) : null,
  };
}
