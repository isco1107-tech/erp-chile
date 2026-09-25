import { formatWhatsappNumber, pageantContact, type PageantContact } from '@/lib/events/pageant-contact';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma, type Candidate, type CandidateStatus, type PaymentPlanStatus, type PaymentStatus, type PromissoryNoteStatus } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { captureException } from '@/lib/observability';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { constraintInvolves } from '@/lib/prisma-errors';
import type {
  CandidateCreateInput,
  CandidateSelfRegistrationInput,
  CandidateStatusChangeInput,
  CandidateUpdateInput,
  RegistrationSettingsInput,
} from '../schema';

/**
 * NOTA DE ARQUITECTURA (módulo "Postulaciones de candidatas"):
 *
 * El prompt original de este módulo pedía tablas nuevas `convocatorias` /
 * `postulaciones` / `postulacion_archivos` / `postulacion_historial`. Ese
 * dominio YA existía en este ERP antes de este cambio: `Project` cumple el
 * rol de "convocatoria" (una edición de un certamen, con
 * `candidateRegistrationToken` para el link público) y `Candidate` cumple el
 * rol de "postulación" (con `status` empezando en `APPLICANT`). En vez de
 * duplicar el dominio se extendieron ambos modelos:
 * - `Project`: se agregaron `registrationStatus`/`registrationOpensAt`/
 *   `registrationClosesAt`/`minCandidateAge`/`maxCandidates` (ventana y
 *   reglas de la convocatoria).
 * - `Candidate`: se agregaron los campos propios del formulario público
 *   (comuna, dirección, motivación, causa social, etc.), `folio`,
 *   `motivoDescarte` y los metadatos de origen (`ipOrigen`/`userAgent`).
 * - `CandidateDocument`: cubre `postulacion_archivos` vía los tipos
 *   `PHOTO_FACE`/`PHOTO_FULL_BODY` + metadatos de archivo (mime/tamaño/hash).
 * - `postulacion_historial` se resolvió reutilizando el `AuditLog` genérico
 *   ya usado por el resto del sistema (`src/lib/auth/audit.ts`), filtrando
 *   por `entity = 'Candidate'` — no se creó una bitácora paralela.
 */

export type CandidateWithProject = Candidate & {
  project: { id: string; name: string; code: string };
  /**
   * Solo poblado por `getCandidate` (ficha de detalle) — el resto de las
   * consultas de este servicio (`listCandidates`, `createCandidate`, etc.) no
   * lo traen. Opcional a propósito para que sigan siendo estructuralmente
   * compatibles con este mismo tipo sin forzar un `include` que no
   * necesitan; la ficha de candidata debe chequear presencia antes de leerlo.
   */
  promissoryNotes?: {
    id: string;
    amount: number;
    dueDate: Date;
    paymentStatus: PaymentStatus;
    status: PromissoryNoteStatus;
    paidAmount: number;
  }[];
  /**
   * Solo poblado por `getCandidate` (ficha de detalle), mismo criterio que
   * `promissoryNotes` arriba — opcional para no forzar el `include` en el
   * resto de las consultas de este servicio.
   */
  paymentPlans?: {
    id: string;
    installmentCount: number;
    totalAmount: number;
    status: PaymentPlanStatus;
    installments: {
      id: string;
      installmentNumber: number;
      dueDate: Date;
      amount: number;
      paidAmount: number;
      paymentStatus: PaymentStatus;
      penaltyApplied: number;
    }[];
  }[];
};

const PROJECT_SELECT = { id: true, name: true, code: true } as const;

// ---------------------------------------------------------------------------
// Errores tipados de la auto-inscripción pública — permiten que el Route
// Handler (`/api/public/candidates/[token]/apply`) devuelva el código HTTP
// correcto (403/409/400) en vez de un 500 genérico o un 200 con error en el
// body, como sí es aceptable en las Server Actions internas.
// ---------------------------------------------------------------------------

export class RegistrationNotFoundError extends Error {}
export class RegistrationNotOpenError extends Error {}
/** Cupo lleno — distinta de `RegistrationNotOpenError` porque el chequeo
 * real y definitivo ocurre DENTRO de la transacción de escritura, con lock
 * de fila (ver `submitCandidateRegistration`), a diferencia del resto de las
 * condiciones de "no abierta" que solo dependen de fecha/estado. */
export class RegistrationFullError extends Error {}
export class BelowMinimumAgeError extends Error {}
export class DuplicateApplicationError extends Error {}

async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error('El proyecto/certamen no existe o no pertenece a esta empresa');
}

/** Igual que en `contacts.service.ts`: cadena vacía en un campo opcional de
 * texto se interpreta como "borrar el valor", no como "no lo toques". */
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/**
 * Formato "suave" para un RUT opcional/informativo (ej. `employerRut`): a
 * diferencia del RUT propio de la candidata (`rutField` en el schema, que
 * exige dígito verificador válido), este dato puede venir de una búsqueda
 * web imperfecta o completarse a mano sin certeza total — se normaliza el
 * formato visual (`12.345.678-K`) para que no quede desparejo con el resto
 * de la ficha, pero nunca bloquea el guardado si el dígito verificador no
 * calza.
 */
function formatOptionalRut(value: string | undefined): string | undefined {
  if (!value) return value;
  return formatRut(cleanRut(value));
}

export async function createCandidate(companyId: string, data: CandidateCreateInput): Promise<CandidateWithProject> {
  await assertProjectOwnership(companyId, data.projectId);

  const rutClean = cleanRut(data.rut);
  if (!validateRut(rutClean)) throw new Error('RUT inválido');

  return prisma.candidate.create({
    data: {
      companyId,
      projectId: data.projectId,
      rut: formatRut(rutClean),
      rutClean,
      fullName: data.fullName,
      stageName: data.stageName || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      birthDate: data.birthDate,
      dressSize: data.dressSize || undefined,
      shoeSize: data.shoeSize || undefined,
      heightCm: data.heightCm ?? undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      guardianName: data.guardianName || undefined,
      guardianRut: data.guardianRut || undefined,
      status: data.status,
      notes: data.notes || undefined,
      comuna: data.comuna || undefined,
      direccion: data.direccion || undefined,
      ocupacion: data.ocupacion || undefined,
      instagram: data.instagram || undefined,
      idiomas: data.idiomas || undefined,
      experiencia: data.experiencia || undefined,
      motivacion: data.motivacion || undefined,
      causaSocial: data.causaSocial || undefined,
      condicionesMedicas: data.condicionesMedicas || undefined,
      employerName: data.employerName || undefined,
      employerRut: formatOptionalRut(data.employerRut) || undefined,
      employerAddress: data.employerAddress || undefined,
    },
    include: { project: { select: PROJECT_SELECT } },
  });
}

export async function updateCandidate(
  companyId: string,
  id: string,
  data: CandidateUpdateInput
): Promise<CandidateWithProject> {
  // El formulario general de edición no pide motivo — `REJECTED` solo se
  // puede asignar por `updateCandidateStatus` (Sección 6: "motivo
  // obligatorio al descartar"), nunca colándose por esta vía más genérica.
  if (data.status === 'REJECTED') {
    throw new Error('Para descartar una postulación, usa el cambio de estado en la ficha — exige indicar el motivo.');
  }

  const updateData: Prisma.CandidateUpdateManyMutationInput = {
    fullName: data.fullName,
    stageName: emptyToNull(data.stageName),
    email: emptyToNull(data.email),
    phone: emptyToNull(data.phone),
    birthDate: data.birthDate,
    dressSize: emptyToNull(data.dressSize),
    shoeSize: emptyToNull(data.shoeSize),
    heightCm: data.heightCm,
    emergencyContactName: emptyToNull(data.emergencyContactName),
    emergencyContactPhone: emptyToNull(data.emergencyContactPhone),
    guardianName: emptyToNull(data.guardianName),
    guardianRut: emptyToNull(data.guardianRut),
    status: data.status,
    notes: emptyToNull(data.notes),
    comuna: emptyToNull(data.comuna),
    direccion: emptyToNull(data.direccion),
    ocupacion: emptyToNull(data.ocupacion),
    instagram: emptyToNull(data.instagram),
    idiomas: emptyToNull(data.idiomas),
    experiencia: emptyToNull(data.experiencia),
    motivacion: emptyToNull(data.motivacion),
    causaSocial: emptyToNull(data.causaSocial),
    condicionesMedicas: emptyToNull(data.condicionesMedicas),
    employerName: emptyToNull(data.employerName),
    employerRut: emptyToNull(formatOptionalRut(data.employerRut)),
    employerAddress: emptyToNull(data.employerAddress),
  };

  // El RUT es editable (ej. corregir un dígito mal tipeado al ingresar), pero
  // `rutClean` -que es la columna del índice único- solo se recalcula si vino
  // un `rut` nuevo, nunca por accidente.
  if (data.rut !== undefined) {
    const rutClean = cleanRut(data.rut);
    if (!validateRut(rutClean)) throw new Error('RUT inválido');
    updateData.rut = formatRut(rutClean);
    updateData.rutClean = rutClean;
  }

  // `updateMany` + relectura en vez de `update({ where: { id } })`: así el
  // filtro de tenant es imposible de omitir por accidente (ver CLAUDE.md
  // sección 2.3).
  const result = await prisma.candidate.updateMany({
    where: { id, companyId },
    data: updateData,
  });
  if (result.count === 0) throw new Error('Candidata no encontrada');

  const candidate = await prisma.candidate.findFirst({
    where: { id, companyId },
    include: { project: { select: PROJECT_SELECT } },
  });
  if (!candidate) throw new Error('Candidata no encontrada');
  return candidate;
}

export interface CandidateListFilters {
  projectId?: string;
  status?: CandidateStatus;
  comuna?: string;
  /** Edad calculada desde `birthDate` (o la declarada, si no hay fecha). */
  minAge?: number;
  maxAge?: number;
  /** Coincidencia parcial contra nombre completo, RUT (con o sin formato) o folio. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CandidateListResult {
  items: CandidateWithProject[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Convierte un rango de edad a un rango de fechas de nacimiento — la
 * columna indexada es `birthDate`, no una edad calculada, así que el filtro
 * de edad se resuelve como un `birthDate` entre dos fechas. */
function ageRangeToBirthDateRange(minAge?: number, maxAge?: number): { gte?: Date; lte?: Date } {
  const now = new Date();
  const range: { gte?: Date; lte?: Date } = {};
  // Edad máxima N -> nacida como muy pronto hace (N+1) años + 1 día.
  if (maxAge !== undefined) {
    const gte = new Date(now);
    gte.setFullYear(gte.getFullYear() - maxAge - 1);
    gte.setDate(gte.getDate() + 1);
    range.gte = gte;
  }
  // Edad mínima N -> nacida como muy tarde hace N años.
  if (minAge !== undefined) {
    const lte = new Date(now);
    lte.setFullYear(lte.getFullYear() - minAge);
    range.lte = lte;
  }
  return range;
}

/**
 * Listado paginado del lado del servidor (Sección 6: "no traigas todo a
 * memoria"). Antes de este cambio `listCandidates` traía todas las filas de
 * la empresa sin paginar — aceptable cuando el módulo solo alimentaba fichas
 * internas creadas a mano, no cuando cualquier persona de internet puede
 * generar filas nuevas sin límite práctico.
 */
export async function listCandidates(
  companyId: string,
  filters: CandidateListFilters = {},
  // Solo para usos internos del servidor (exportación): el listado de pantalla queda en 100.
  options: { maxPageSize?: number } = {}
): Promise<CandidateListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(options.maxPageSize ?? MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Prisma.CandidateWhereInput = {
    companyId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.comuna?.trim() ? { comuna: { contains: filters.comuna.trim(), mode: 'insensitive' } } : {}),
  };

  // Edad: por fecha de nacimiento o, en postulaciones públicas sin ella, por la edad declarada.
  const birthDateRange = ageRangeToBirthDateRange(filters.minAge, filters.maxAge);
  if (birthDateRange.gte || birthDateRange.lte) {
    where.AND = [
      {
        OR: [
          { birthDate: birthDateRange },
          {
            birthDate: null,
            declaredAge: {
              ...(filters.minAge !== undefined ? { gte: filters.minAge } : {}),
              ...(filters.maxAge !== undefined ? { lte: filters.maxAge } : {}),
            },
          },
        ],
      },
    ];
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    const rutClean = cleanRut(term);
    where.OR = [
      { fullName: { contains: term, mode: 'insensitive' } },
      { stageName: { contains: term, mode: 'insensitive' } },
      { folio: { contains: term, mode: 'insensitive' } },
      ...(rutClean ? [{ rutClean: { contains: rutClean } }] : []),
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.candidate.findMany({
      where,
      include: { project: { select: PROJECT_SELECT } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.candidate.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

/** Misma consulta que `listCandidates` pero sin paginar, para exportación
 * (Sección 6: "Excel o CSV de las postulaciones filtradas, sin fotografías").
 * Tope duro de 5000 filas: una exportación más grande que eso necesita
 * filtrar primero, no es un caso de uso real de este módulo. */
const EXPORT_MAX_ROWS = 5000;

export async function listCandidatesForExport(companyId: string, filters: Omit<CandidateListFilters, 'page' | 'pageSize'> = {}): Promise<CandidateWithProject[]> {
  const { items } = await listCandidates(companyId, { ...filters, page: 1, pageSize: EXPORT_MAX_ROWS }, { maxPageSize: EXPORT_MAX_ROWS });
  return items;
}

export async function getCandidate(companyId: string, id: string): Promise<CandidateWithProject | null> {
  return prisma.candidate.findFirst({
    where: { id, companyId },
    include: {
      project: { select: PROJECT_SELECT },
      // Ficha de candidata (Sección "Pagarés" del módulo hasPromissoryNotes):
      // select mínimo, la lista completa con contacto vive en el propio
      // módulo `src/modules/promissory-notes`.
      promissoryNotes: {
        select: { id: true, amount: true, dueDate: true, paymentStatus: true, status: true, paidAmount: true },
        orderBy: { dueDate: 'asc' },
      },
      // Ficha de candidata (Sección "Plan de pago" del módulo hasInstallmentPlans):
      // select mínimo, el CRUD completo vive en `src/modules/payment-plans`.
      paymentPlans: {
        select: {
          id: true,
          installmentCount: true,
          totalAmount: true,
          status: true,
          installments: {
            select: {
              id: true,
              installmentNumber: true,
              dueDate: true,
              amount: true,
              paidAmount: true,
              paymentStatus: true,
              penaltyApplied: true,
            },
            orderBy: { installmentNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

/**
 * Cambio de estado desde el panel interno (Sección 6: "motivo obligatorio al
 * descartar"). Separado de `updateCandidate` porque tiene su propia regla de
 * validación (motivo obligatorio solo para `REJECTED`) y porque un cambio de
 * estado es semánticamente distinto de una edición de ficha para efectos de
 * la bitácora.
 */
export async function updateCandidateStatus(
  companyId: string,
  id: string,
  data: CandidateStatusChangeInput
): Promise<CandidateWithProject> {
  if (data.status === 'REJECTED' && !data.motivoDescarte?.trim()) {
    throw new Error('Debes indicar el motivo del descarte');
  }

  const result = await prisma.candidate.updateMany({
    where: { id, companyId },
    data: {
      status: data.status,
      motivoDescarte: data.status === 'REJECTED' ? data.motivoDescarte : null,
    },
  });
  if (result.count === 0) throw new Error('Candidata no encontrada');

  const candidate = await prisma.candidate.findFirst({
    where: { id, companyId },
    include: { project: { select: PROJECT_SELECT } },
  });
  if (!candidate) throw new Error('Candidata no encontrada');
  return candidate;
}

/**
 * Elimina la postulación y sus archivos físicos (Sección 7: "acción de
 * eliminación... para responder a una solicitud de la titular"). Los blobs
 * se borran DESPUÉS de confirmar el borrado en base — si el borrado de un
 * blob falla, la fila ya no existe pero puede quedar un archivo huérfano en
 * el storage; lo inverso (blob borrado, fila viva apuntando a una URL muerta)
 * es peor porque deja una referencia rota visible en el panel.
 */
export async function deleteCandidate(companyId: string, id: string): Promise<void> {
  const candidate = await prisma.candidate.findFirst({
    where: { id, companyId },
    include: { documents: { select: { fileUrl: true } } },
  });
  if (!candidate) throw new Error('Candidata no encontrada');

  const result = await prisma.candidate.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Candidata no encontrada');

  const fileUrls = [...candidate.documents.map((d) => d.fileUrl), ...(candidate.photoUrl ? [candidate.photoUrl] : [])];
  if (fileUrls.length > 0) {
    try {
      const { del } = await import('@/lib/storage/blob');
      await del(fileUrls);
    } catch (error) {
      // No revierte el borrado en base: la solicitud de la titular ya se
      // cumplió sobre el dato estructurado, que es lo que un reintento
      // manual no puede recuperar. Un blob huérfano se puede limpiar aparte.
      captureException(error, { module: 'candidates', companyId, extra: { candidateId: id, reason: 'no se pudieron borrar todos los archivos en Blob' } });
    }
  }
}

/** Nombre de fantasía de la empresa, para el encabezado de los correos
 * disparados por un cambio de estado (`updateCandidateStatusAction`) — la
 * misma pieza de dato que ya trae `getRegistrationProjectByToken` vía
 * `project.company`, pero acá no siempre se tiene el `Project` a mano. */
export async function getCompanyBusinessName(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true } });
  return company?.businessName ?? '';
}

/** Remitente visible y correo de respuesta de los avisos a una candidata: el contacto público del certamen, nunca uno fijo. */
export async function getCandidateNoticeContext(
  companyId: string,
  projectId: string
): Promise<{ companyName: string; replyTo: string | null }> {
  const [companyName, project] = await Promise.all([
    getCompanyBusinessName(companyId),
    prisma.project.findFirst({ where: { id: projectId, companyId }, select: { publicContactEmail: true } }),
  ]);
  return { companyName, replyTo: project?.publicContactEmail?.trim() || null };
}

export interface CandidateProjectOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Selector mínimo de proyectos para el formulario de candidatas. Vive aquí
 * (no en `src/modules/projects`) a propósito: los 4 módulos de producción de
 * eventos son independientes entre sí (ver `src/lib/auth/modules.ts`), así
 * que Candidatas no debe acoplar su disponibilidad a que el módulo Eventos &
 * Proyectos también esté contratado.
 */
export async function listProjectOptions(companyId: string): Promise<CandidateProjectOption[]> {
  return prisma.project.findMany({
    where: { companyId },
    select: PROJECT_SELECT,
    orderBy: { startDate: 'desc' },
  });
}

export interface CandidateHistoryEntry {
  id: string;
  action: string;
  entity: string;
  userEmail: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * "postulacion_historial" (Sección 1/7 del prompt del módulo) resuelto sobre
 * el `AuditLog` genérico ya usado por todo el sistema, en vez de una tabla
 * paralela — ver nota de arquitectura al inicio de este archivo. Incluye
 * tanto los eventos de `Candidate` (creación, ediciones, cambios de estado)
 * como los de `CandidateDocument` con el mismo `candidateId` en su metadata
 * (descargas de fotografías), para que la ficha muestre una sola línea de
 * tiempo.
 */
export interface PurgeRejectedResult {
  eligible: number;
  deleted: number;
}

/**
 * Purga por retención (Sección 7 del módulo): elimina postulaciones
 * `REJECTED` con más de `months` desde su última actualización, junto con
 * sus archivos físicos en Blob. Vive acá (no solo en el script CLI) para que
 * tanto `scripts/purge-rejected-candidates.ts` como un cron real
 * (`app/api/candidates/purge-retention/cron/route.ts`) compartan la misma
 * lógica en vez de duplicarla.
 *
 * `companyId` es opcional (purga todas las empresas si se omite) — mismo
 * motivo que `backfill-accounting.ts --company`: permite probar la purga
 * acotada a una sola empresa antes de correrla en firme contra todo el SaaS.
 */
export async function purgeRejectedCandidates(months: number, companyId?: string): Promise<PurgeRejectedResult> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const candidates = await prisma.candidate.findMany({
    where: { status: 'REJECTED', updatedAt: { lt: cutoff }, ...(companyId ? { companyId } : {}) },
    include: { documents: { select: { fileUrl: true } } },
  });

  let deleted = 0;
  for (const candidate of candidates) {
    const fileUrls = [...candidate.documents.map((d) => d.fileUrl), ...(candidate.photoUrl ? [candidate.photoUrl] : [])];
    try {
      await prisma.candidate.deleteMany({ where: { id: candidate.id, companyId: candidate.companyId } });
      if (fileUrls.length > 0) {
        const { del } = await import('@/lib/storage/blob');
        await del(fileUrls).catch((error) =>
          captureException(error, { module: 'candidates', companyId: candidate.companyId, extra: { candidateId: candidate.id, reason: 'purgeRejectedCandidates: fallo al borrar blobs' } })
        );
      }
      deleted += 1;
    } catch (error) {
      captureException(error, { module: 'candidates', companyId: candidate.companyId, extra: { candidateId: candidate.id, reason: 'purgeRejectedCandidates: fallo al purgar candidata' } });
    }
  }

  return { eligible: candidates.length, deleted };
}

export async function getCandidateHistory(companyId: string, candidateId: string): Promise<CandidateHistoryEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId,
      OR: [
        { entity: 'Candidate', entityId: candidateId },
        { entity: 'CandidateDocument', metadata: { path: ['candidateId'], equals: candidateId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return logs;
}

export type CandidateContractStatus = 'NOT_GENERATED' | 'PENDING_SIGNATURE' | 'SIGNED';

export interface CandidateComplianceRow {
  candidateId: string;
  fullName: string;
  stageName: string | null;
  contractStatus: CandidateContractStatus;
  pendingDocuments: number;
  expiredDocuments: number;
  attendanceRate: number | null;
}

/**
 * Tablero de trazabilidad por candidata: estado del contrato generado
 * (`CandidateDocument` con `documentType = CONTRACT_IMAGE`), documentos
 * pendientes/vencidos (cualquier tipo) y % de asistencia registrada. Mismo
 * patrón que `getSponsorshipComplianceBoard` — agregado en memoria porque
 * necesita nombre/asistencia junto al conteo de documentos.
 */
export async function getCandidateComplianceBoard(companyId: string, projectId?: string): Promise<CandidateComplianceRow[]> {
  const candidates = await prisma.candidate.findMany({
    where: { companyId, ...(projectId ? { projectId } : {}), status: { not: 'WITHDRAWN' } },
    include: { documents: true, attendances: { select: { attended: true } } },
    orderBy: { fullName: 'asc' },
  });

  const now = Date.now();

  return candidates.map((candidate) => {
    const contractDoc = candidate.documents.find((d) => d.documentType === 'CONTRACT_IMAGE');
    let contractStatus: CandidateContractStatus = 'NOT_GENERATED';
    if (contractDoc) {
      contractStatus = contractDoc.signedAt ? 'SIGNED' : 'PENDING_SIGNATURE';
    }

    const expiredDocuments = candidate.documents.filter((d) => d.expiresAt && d.expiresAt.getTime() < now).length;
    const pendingDocuments = candidate.documents.filter((d) => !d.signedAt && !(d.expiresAt && d.expiresAt.getTime() < now)).length;

    const attendanceRate =
      candidate.attendances.length === 0
        ? null
        : Math.round((candidate.attendances.filter((a) => a.attended).length / candidate.attendances.length) * 100);

    return {
      candidateId: candidate.id,
      fullName: candidate.fullName,
      stageName: candidate.stageName,
      contractStatus,
      pendingDocuments,
      expiredDocuments,
      attendanceRate,
    };
  });
}

// ---------------------------------------------------------------------------
// Auto-inscripción pública (acceso por token, sin cuenta ERP)
// ---------------------------------------------------------------------------

/**
 * Devuelve el `candidateRegistrationToken` vigente del proyecto, generándolo
 * si todavía no existe. Idempotente a propósito: compartir el link varias
 * veces desde el panel interno no debe invalidar uno que ya esté circulando
 * entre postulantes (mismo criterio que `getOrCreatePortalToken`).
 */
export async function getOrCreateRegistrationToken(companyId: string, projectId: string): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { candidateRegistrationToken: true },
  });
  if (!project) throw new Error('Proyecto no encontrado');
  if (project.candidateRegistrationToken) return project.candidateRegistrationToken;

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { candidateRegistrationToken: token } });
  return token;
}

/** Invalida el link anterior y emite uno nuevo — mismo criterio que `regeneratePortalToken`. */
export async function regenerateRegistrationToken(companyId: string, projectId: string): Promise<string> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('Proyecto no encontrado');

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { candidateRegistrationToken: token } });
  return token;
}

export interface RegistrationSettings {
  registrationStatus: RegistrationSettingsInput['registrationStatus'];
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  minCandidateAge: number;
  maxCandidates: number | null;
  /** Contacto del certamen que ven las postulantes (vacío = no se muestra). */
  contactEmail: string | null;
  contactWhatsapp: string | null;
  instagramHandle: string | null;
  /** "Qué incluye tu inscripción", un ítem por beneficio. */
  benefits: string[];
  classesNote: string | null;
  /** Postulaciones ya recibidas — para mostrar "37/50" en el panel. */
  applicationsReceived: number;
}

/** Cuenta postulaciones "vivas" contra el cupo: una retirada o descartada
 * libera el cupo que ocupaba, mismo criterio que un carrito abandonado no
 * cuenta contra un stock reservado. */
async function countActiveApplications(companyId: string, projectId: string): Promise<number> {
  return prisma.candidate.count({
    where: { companyId, projectId, status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
  });
}

export async function getRegistrationSettings(companyId: string, projectId: string): Promise<RegistrationSettings> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: {
      registrationStatus: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      minCandidateAge: true,
      maxCandidates: true,
      publicContactEmail: true,
      publicWhatsapp: true,
      instagramHandle: true,
      registrationBenefits: true,
      registrationClassesNote: true,
    },
  });
  if (!project) throw new Error('Proyecto no encontrado');
  const applicationsReceived = await countActiveApplications(companyId, projectId);
  const { publicContactEmail, publicWhatsapp, instagramHandle, registrationBenefits, registrationClassesNote, ...window } = project;
  return {
    ...window,
    benefits: registrationBenefits,
    classesNote: registrationClassesNote,
    contactEmail: publicContactEmail,
    contactWhatsapp: publicWhatsapp ? formatWhatsappNumber(publicWhatsapp) : null,
    instagramHandle: instagramHandle ? `@${instagramHandle.replace(/^@/, '')}` : null,
    applicationsReceived,
  };
}

export async function updateRegistrationSettings(
  companyId: string,
  projectId: string,
  data: RegistrationSettingsInput
): Promise<RegistrationSettings> {
  const result = await prisma.project.updateMany({
    where: { id: projectId, companyId },
    data: {
      registrationStatus: data.registrationStatus,
      registrationOpensAt: data.registrationOpensAt ?? null,
      registrationClosesAt: data.registrationClosesAt ?? null,
      minCandidateAge: data.minCandidateAge,
      maxCandidates: data.maxCandidates ?? null,
      publicContactEmail: data.contactEmail,
      publicWhatsapp: data.contactWhatsapp,
      instagramHandle: data.instagramHandle,
      registrationBenefits: data.benefits,
      registrationClassesNote: data.classesNote,
    },
  });
  if (result.count === 0) throw new Error('Proyecto no encontrado');
  return getRegistrationSettings(companyId, projectId);
}

export interface RegistrationProjectInfo {
  projectId: string;
  projectName: string;
  companyName: string;
  isOpen: boolean;
  /** Motivo legible de por qué no está abierta, si `isOpen` es `false`. */
  closedReason: string | null;
  registrationClosesAt: Date | null;
  minCandidateAge: number;
  /** Fecha y hora de la gala (`Project.galaDate`), no el inicio del proyecto. */
  galaDate: Date | null;
  venueName: string | null;
  /** Acento visual del certamen (el mismo del micrositio). */
  accent: string;
  /** Bajada del certamen (la misma del micrositio), si la organización la escribió. */
  tagline: string | null;
  /** Contacto del certamen para las postulantes: nunca datos fijos de la plataforma. */
  contact: PageantContact;
  /** Cupo de preseleccionadas ("solo 20 candidatas"), si la convocatoria lo definió. */
  maxCandidates: number | null;
  /** "Qué incluye tu inscripción" (vacío = no se muestra). */
  benefits: string[];
  /** Lugar y horario de las clases, si la organización lo escribió. */
  classesNote: string | null;
}

/**
 * Resuelve el proyecto a partir del token — nunca de un `companyId`/`projectId`
 * que mande el cliente (mismo criterio que `getSponsorshipPortalByToken`). Un
 * token que no matchea a ningún proyecto no revela nada distinto de "link
 * inválido". A diferencia de la versión anterior, ahora también evalúa si la
 * convocatoria está realmente abierta — la página pública debe poder mostrar
 * "cerrada" de inmediato en vez de solo fallar recién al enviar.
 */
export async function getRegistrationProjectByToken(token: string): Promise<RegistrationProjectInfo | null> {
  const project = await prisma.project.findUnique({
    where: { candidateRegistrationToken: token },
    include: { company: { select: { businessName: true } } },
  });
  if (!project) return null;

  const { isOpen, reason } = await evaluateRegistrationWindow(project);

  return {
    projectId: project.id,
    projectName: project.name,
    companyName: project.company.businessName,
    isOpen,
    closedReason: reason,
    registrationClosesAt: project.registrationClosesAt,
    minCandidateAge: project.minCandidateAge,
    galaDate: project.galaDate,
    venueName: project.venueName,
    accent: project.publicAccent,
    tagline: project.publicTagline,
    contact: pageantContact(project),
    maxCandidates: project.maxCandidates,
    benefits: project.registrationBenefits,
    classesNote: project.registrationClassesNote,
  };
}

/**
 * Lo mínimo para la política de privacidad de un certamen (nombre,
 * organización y correo de contacto), a partir del mismo token del link de
 * postulación. No evalúa la ventana: la política se puede leer siempre.
 */
export async function getRegistrationPrivacyInfo(token: string): Promise<{ projectName: string; companyName: string; contactEmail: string | null } | null> {
  const project = await prisma.project.findUnique({
    where: { candidateRegistrationToken: token },
    select: { name: true, publicContactEmail: true, company: { select: { businessName: true } } },
  });
  return project ? { projectName: project.name, companyName: project.company.businessName, contactEmail: project.publicContactEmail } : null;
}

type ProjectRegistrationFields = {
  id: string;
  companyId: string;
  registrationStatus: RegistrationSettingsInput['registrationStatus'];
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  maxCandidates: number | null;
};

async function evaluateRegistrationWindow(project: ProjectRegistrationFields): Promise<{ isOpen: boolean; reason: string | null }> {
  if (project.registrationStatus !== 'OPEN') {
    return { isOpen: false, reason: 'Esta convocatoria no está recibiendo postulaciones por el momento.' };
  }
  const now = new Date();
  if (project.registrationOpensAt && now < project.registrationOpensAt) {
    return { isOpen: false, reason: 'Esta convocatoria todavía no abre sus postulaciones.' };
  }
  if (project.registrationClosesAt && now > project.registrationClosesAt) {
    return { isOpen: false, reason: 'El plazo de postulación para esta convocatoria ya cerró.' };
  }
  if (project.maxCandidates !== null) {
    const received = await countActiveApplications(project.companyId, project.id);
    if (received >= project.maxCandidates) {
      return { isOpen: false, reason: 'Esta convocatoria ya alcanzó su cupo máximo de postulaciones.' };
    }
  }
  return { isOpen: true, reason: null };
}

/** `TMC-2027-0043`: prefijo = `Project.code` (ya único por empresa, mismo rol
 * que cumpliría un `folioPrefix` dedicado — se reutiliza en vez de agregar un
 * campo nuevo solo para esto). Año = año calendario del envío. Correlativo =
 * `InternalDocumentSequence` con `kind = CANDIDATE_APPLICATION`, mismo patrón
 * atómico (`upsert` + `increment`) que ya usan Órdenes de Compra y
 * Recepciones — nunca `SELECT MAX(folio)+1`. */
function buildFolio(projectCode: string, year: number, correlativo: number): string {
  return `${projectCode.toUpperCase()}-${year}-${String(correlativo).padStart(4, '0')}`;
}

export interface SubmitRegistrationMeta {
  ipOrigen?: string;
  userAgent?: string;
}

/**
 * Crea la ficha de la propia candidata desde el formulario público (los 8
 * datos de la inscripción) y su folio, en una sola transacción.
 *
 * El `companyId`/`projectId` se resuelven SIEMPRE del token, nunca de un
 * campo del formulario — así ninguna postulante puede inscribirse en un
 * certamen o empresa distinta a la del link que recibió. `status` siempre
 * entra como `APPLICANT`.
 */
export async function submitCandidateRegistration(
  token: string,
  data: CandidateSelfRegistrationInput,
  meta: SubmitRegistrationMeta
): Promise<{ candidate: Candidate; folio: string }> {
  const project = await prisma.project.findUnique({
    where: { candidateRegistrationToken: token },
    select: { id: true, companyId: true, code: true, registrationStatus: true, registrationOpensAt: true, registrationClosesAt: true, minCandidateAge: true, maxCandidates: true },
  });
  if (!project) throw new RegistrationNotFoundError('Link de inscripción inválido o expirado');

  const { isOpen, reason } = await evaluateRegistrationWindow(project);
  if (!isOpen) throw new RegistrationNotOpenError(reason ?? 'Esta convocatoria no está recibiendo postulaciones');

  const rutClean = cleanRut(data.rut);
  if (!validateRut(rutClean)) throw new Error('RUT inválido');

  if (data.age < project.minCandidateAge) {
    throw new BelowMinimumAgeError(`Debes tener al menos ${project.minCandidateAge} años cumplidos para postular.`);
  }

  // Chequeo temprano fuera de la transacción: da un 409 rápido en el caso
  // común (RUT repetido) sin gastar una transacción completa. La garantía
  // real sigue siendo el `@@unique([companyId, projectId, rutClean])` de la
  // base de datos, comprobado más abajo vía el código de error P2002 — dos
  // envíos simultáneos con el mismo RUT igual son rechazados correctamente.
  const existing = await prisma.candidate.findFirst({
    where: { companyId: project.companyId, projectId: project.id, rutClean },
    select: { id: true },
  });
  if (existing) {
    throw new DuplicateApplicationError('Ya existe una inscripción con este RUT para este certamen. Si crees que es un error, contacta a la organización.');
  }

  try {
    const { candidate, folio } = await prisma.$transaction(async (tx) => {
      // Chequeo DEFINITIVO de cupo, con lock de fila — el de
      // `evaluateRegistrationWindow` de más arriba es solo un `count()` de
      // camino feliz (rápido, sin lock) para dar un 403 temprano en el caso
      // común. Sin este segundo chequeo con `FOR UPDATE`, dos envíos
      // simultáneos con exactamente 1 cupo libre podrían leer el mismo
      // conteo antes de que cualquiera confirme su `INSERT` y ambos pasar,
      // superando `maxCandidates` en 1 — mismo tipo de condición de carrera
      // que el kardex evita con el lock sobre el producto.
      if (project.maxCandidates !== null) {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} AND "companyId" = ${project.companyId} FOR UPDATE`;
        const receivedNow = await tx.candidate.count({
          where: { companyId: project.companyId, projectId: project.id, status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
        });
        if (receivedNow >= project.maxCandidates) {
          throw new RegistrationFullError('Esta convocatoria ya alcanzó su cupo máximo de postulaciones.');
        }
      }

      const year = new Date().getFullYear();
      const seq = await tx.internalDocumentSequence.upsert({
        where: { companyId_kind: { companyId: project.companyId, kind: 'CANDIDATE_APPLICATION' } },
        update: { currentFolio: { increment: 1 } },
        create: { companyId: project.companyId, kind: 'CANDIDATE_APPLICATION', currentFolio: 1 },
      });
      const folio = buildFolio(project.code, year, seq.currentFolio);

      const created = await tx.candidate.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          rut: formatRut(rutClean),
          rutClean,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          declaredAge: data.age,
          guardianName: data.guardianName || undefined,
          guardianRut: data.guardianRut ? formatRut(cleanRut(data.guardianRut)) : undefined,
          status: 'APPLICANT',
          folio,
          comuna: data.comuna,
          instagram: data.instagram,
          motivacion: data.motivacion,
          ipOrigen: meta.ipOrigen || undefined,
          userAgent: meta.userAgent || undefined,
        },
      });

      // `postulacion_historial` (bitácora de auditoría) = `AuditLog` genérico,
      // filtrado por `entity = 'Candidate'` — ver nota de arquitectura arriba.
      // Nunca se guardan aquí datos personales de la postulante (Sección 7:
      // "nunca escribas datos de la candidata en logs"), solo el folio y el
      // conteo de fotos adjuntas.
      await tx.auditLog.create({
        data: {
          companyId: project.companyId,
          userEmail: 'sistema (auto-inscripción pública)',
          action: 'CREATE',
          entity: 'Candidate',
          entityId: created.id,
          metadata: { folio, projectId: project.id, source: 'public-registration' },
          ipAddress: meta.ipOrigen,
        },
      });

      return { candidate: created, folio };
    }, LOCKING_TX_OPTIONS);

    return { candidate, folio };
  } catch (error) {
    if (error instanceof RegistrationFullError) throw error;
    // Solo la unicidad del RUT es "ya postulaste"; un choque de folio (u otra
    // unicidad) es una carrera interna y debe verse como error reintentable.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && !constraintInvolves(error, 'folio')) {
      throw new DuplicateApplicationError('Ya existe una inscripción con este RUT para este certamen. Si crees que es un error, contacta a la organización.');
    }
    throw error;
  }
}
