import 'server-only';

import { prisma } from '@/lib/prisma';
import { cleanRut } from '@/lib/chile/rut';

/**
 * Búsqueda de TODO lo que la empresa guarda de una persona (derecho de acceso
 * y portabilidad). Solo lectura y siempre dentro de la empresa de la sesión.
 *
 * Cada fuente selecciona campos explícitos: nunca `include` completo ni
 * credenciales. No suprime nada: para eliminar o corregir, el equipo usa las
 * pantallas de cada módulo (auditadas), a las que esta búsqueda enlaza. Los
 * documentos tributarios y contables no se pueden eliminar mientras dure el
 * plazo legal de conservación.
 */

export interface PersonQuery {
  email?: string;
  rut?: string;
}

/**
 * Qué puede ver quien consulta. La búsqueda NO se salta la separación de
 * permisos del resto del sistema: sin `candidates:sensitive` no se ven salud,
 * apoderado ni fecha de nacimiento de candidatas, y sin `payroll:read` no se
 * ven los trabajadores.
 */
export interface PersonalDataAccess {
  candidatesSensitive: boolean;
  payroll: boolean;
}

export type MatchedBy = 'correo' | 'RUT';

export interface PersonalDataSection {
  key: string;
  label: string;
  /** Pantalla del panel donde se ve o corrige el registro (por registro: `{id}` se reemplaza). */
  hrefTemplate: string | null;
  /** Si el registro puede eliminarse a pedido o está sujeto a conservación legal. */
  retention: 'ERASABLE' | 'LEGAL_RETENTION' | 'ACCOUNT';
  /** `matchedBy` dice por qué identificador apareció cada registro: uno que coincide solo por RUT (o solo por correo) merece verificarse. */
  records: Array<Record<string, unknown> & { id: string; matchedBy: MatchedBy[] }>;
}

export interface PersonalDataResult {
  query: { email: string | null; rutClean: string | null };
  sections: PersonalDataSection[];
  totalRecords: number;
  /** Secciones que existen pero no se muestran por los permisos de quien consulta. */
  omitted: string[];
}

const normalizeEmail = (email?: string): string | null => {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
};

const normalizeRut = (rut?: string): string | null => {
  const value = rut ? cleanRut(rut) : '';
  return value ? value : null;
};

const SENSITIVE_CANDIDATE_FIELDS = ['condicionesMedicas', 'guardianName', 'guardianRut', 'birthDate'] as const;

export async function findPersonalData(
  companyId: string,
  query: PersonQuery,
  access: PersonalDataAccess = { candidatesSensitive: false, payroll: false }
): Promise<PersonalDataResult> {
  const email = normalizeEmail(query.email);
  const rutClean = normalizeRut(query.rut);
  if (!email && !rutClean) {
    return { query: { email, rutClean }, sections: [], totalRecords: 0, omitted: [] };
  }

  // `OR` entre los identificadores que vengan: el RUT ubica fichas con otro correo y viceversa.
  const byEmailOrRut = <T extends string>(emailField: T, rutField?: string) => {
    const or: Array<Record<string, unknown>> = [];
    if (email) or.push({ [emailField]: { equals: email, mode: 'insensitive' } });
    if (rutClean && rutField) or.push({ [rutField]: rutClean });
    return or;
  };

  const candidateOr = byEmailOrRut('email', 'rutClean');
  const contactOr = byEmailOrRut('email', 'rutClean');
  const employeeOr = byEmailOrRut('email', 'rutClean');
  const ticketOr = byEmailOrRut('buyerEmail');
  const voteOr = byEmailOrRut('buyerEmail');
  const orderOr = byEmailOrRut('payerEmail');
  const userOr = byEmailOrRut('email');

  const [candidates, contacts, employees, ticketSales, voteOrders, paymentOrders, users] = await Promise.all([
    candidateOr.length
      ? prisma.candidate.findMany({
          where: { companyId, OR: candidateOr },
          select: {
            id: true, folio: true, fullName: true, rut: true, email: true, phone: true, comuna: true, instagram: true,
            declaredAge: true, birthDate: true, guardianName: true, guardianRut: true, status: true, aceptaMarketing: true,
            condicionesMedicas: true, privacyConsentAt: true, privacyPolicyVersion: true, createdAt: true,
          },
          take: 50,
        })
      : [],
    contactOr.length
      ? prisma.contact.findMany({
          where: { companyId, OR: contactOr },
          select: { id: true, razonSocial: true, nombreFantasia: true, rut: true, email: true, phone: true, address: true, comuna: true, createdAt: true },
          take: 50,
        })
      : [],
    employeeOr.length && access.payroll
      ? prisma.employee.findMany({
          where: { companyId, OR: employeeOr },
          select: { id: true, fullName: true, rut: true, email: true, phone: true, address: true, birthDate: true, nationality: true, afp: true, healthInsurance: true, createdAt: true },
          take: 50,
        })
      : [],
    ticketOr.length
      ? prisma.ticketSale.findMany({
          where: { companyId, OR: ticketOr },
          select: { id: true, buyerName: true, buyerEmail: true, buyerPhone: true, quantity: true, totalAmount: true, paymentStatus: true, createdAt: true },
          take: 50,
        })
      : [],
    voteOr.length
      ? prisma.voteOrder.findMany({
          where: { companyId, OR: voteOr },
          select: { id: true, buyerEmail: true, buyerPhone: true, voteCount: true, totalAmount: true, paymentStatus: true, createdAt: true },
          take: 50,
        })
      : [],
    orderOr.length
      ? prisma.installmentPaymentOrder.findMany({
          where: { companyId, OR: orderOr },
          select: { id: true, payerName: true, payerEmail: true, payerBank: true, amount: true, status: true, createdAt: true },
          take: 50,
        })
      : [],
    userOr.length
      ? prisma.user.findMany({
          where: { companyId, OR: userOr },
          select: { id: true, name: true, email: true, phone: true, createdAt: true },
          take: 50,
        })
      : [],
  ]);

  // Cuántos trabajadores habría, para avisar que no se muestran (sin traer sus datos).
  const hiddenEmployees = !access.payroll && employeeOr.length ? await prisma.employee.count({ where: { companyId, OR: employeeOr } }) : 0;

  const matches = (record: Record<string, unknown>, emailFields: string[], rutField?: string): MatchedBy[] => {
    const found: MatchedBy[] = [];
    if (email && emailFields.some((f) => String(record[f] ?? '').trim().toLowerCase() === email)) found.push('correo');
    if (rutClean && rutField && cleanRut(String(record[rutField] ?? '')) === rutClean) found.push('RUT');
    return found;
  };
  const tag = <T extends { id: string }>(rows: T[], emailFields: string[], rutField?: string) =>
    rows.map((row) => ({ ...row, matchedBy: matches(row as Record<string, unknown>, emailFields, rutField) }));

  const visibleCandidates = candidates.map((candidate) => {
    if (access.candidatesSensitive) return candidate;
    const copy: Record<string, unknown> = { ...candidate };
    for (const field of SENSITIVE_CANDIDATE_FIELDS) delete copy[field];
    return copy as typeof candidate;
  });

  const sections: PersonalDataSection[] = [
    { key: 'candidates', label: 'Postulaciones y candidatas', hrefTemplate: '/dashboard/candidates/{id}', retention: 'ERASABLE', records: tag(visibleCandidates, ['email'], 'rut') },
    { key: 'contacts', label: 'Clientes y proveedores', hrefTemplate: '/dashboard/contacts/{id}', retention: 'LEGAL_RETENTION', records: tag(contacts, ['email'], 'rut') },
    { key: 'employees', label: 'Trabajadores', hrefTemplate: '/dashboard/hr/employees/{id}', retention: 'LEGAL_RETENTION', records: tag(employees, ['email'], 'rut') },
    { key: 'ticketSales', label: 'Compras de entradas', hrefTemplate: null, retention: 'LEGAL_RETENTION', records: tag(ticketSales, ['buyerEmail']) },
    { key: 'voteOrders', label: 'Compras de votos', hrefTemplate: null, retention: 'LEGAL_RETENTION', records: tag(voteOrders, ['buyerEmail']) },
    { key: 'paymentOrders', label: 'Pagos de cuotas en línea', hrefTemplate: null, retention: 'LEGAL_RETENTION', records: tag(paymentOrders, ['payerEmail']) },
    { key: 'users', label: 'Cuenta de usuario del sistema', hrefTemplate: '/dashboard/settings/users', retention: 'ACCOUNT', records: tag(users, ['email']) },
  ].filter((section) => section.records.length > 0) as PersonalDataSection[];

  return {
    query: { email, rutClean },
    sections,
    totalRecords: sections.reduce((sum, s) => sum + s.records.length, 0),
    omitted: hiddenEmployees > 0 ? ['Trabajadores (requiere permiso de remuneraciones)'] : [],
  };
}

/** Copia legible por máquina para entregar al titular (acceso y portabilidad). */
export function buildPersonalDataExport(result: PersonalDataResult, meta: { companyName: string; generatedAt: Date }) {
  return {
    generadoPor: meta.companyName,
    generadoEl: meta.generatedAt.toISOString(),
    titular: { correo: result.query.email, rut: result.query.rutClean },
    nota: 'Copia de los datos personales que la organización guarda sobre la persona indicada. Los documentos tributarios y contables se conservan por el plazo legal.',
    // `matchedBy` es una ayuda interna para quien verifica; no es un dato de la persona.
    datos: Object.fromEntries(
      result.sections.map((section) => [section.key, section.records.map(({ matchedBy: _matchedBy, ...record }) => record)])
    ),
  };
}


