import 'server-only';

import crypto from 'crypto';
import type { DataSubjectRequest, DataSubjectRequestStatus, DataSubjectRequestType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computeDueDate, deadlineState, extensionProblem, type DeadlineState } from '@/lib/privacy/deadlines';

/**
 * Solicitudes de derechos del titular de datos personales (Ley 21.719). La
 * empresa es la responsable: recibe la solicitud por el portal público o la
 * registra a mano, la verifica, la resuelve y deja constancia. El plazo lo
 * calcula SIEMPRE este servicio (`computeDueDate`), nunca el cliente.
 */

export class DataProtectionError extends Error {}

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// Portal público
// ---------------------------------------------------------------------------

export async function getPrivacyPortalToken(companyId: string): Promise<string | null> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { privacyPortalToken: true } });
  return settings?.privacyPortalToken ?? null;
}

/** Idempotente: pedirlo varias veces no invalida el enlace que ya circula. */
export async function getOrCreatePrivacyPortalToken(companyId: string): Promise<string> {
  return (await getPrivacyPortalToken(companyId)) ?? regeneratePrivacyPortalToken(companyId);
}

export async function regeneratePrivacyPortalToken(companyId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { privacyPortalToken: token },
    create: { companyId, privacyPortalToken: token },
  });
  return token;
}

export interface PrivacyPortal {
  companyId: string;
  companyName: string;
  contactEmail: string | null;
}

/**
 * Resuelve la empresa SOLO a partir del token. Una empresa suspendida o
 * cancelada se comporta como un enlace inexistente.
 */
export async function resolvePrivacyPortal(token: string): Promise<PrivacyPortal | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const settings = await prisma.companySettings.findUnique({
    where: { privacyPortalToken: token },
    select: { companyId: true, company: { select: { businessName: true, email: true, status: true } } },
  });
  if (!settings) return null;
  const { company } = settings;
  if (company.status !== 'ACTIVE' && company.status !== 'TRIAL') return null;
  return { companyId: settings.companyId, companyName: company.businessName, contactEmail: company.email };
}

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

export interface NewRequestInput {
  type: DataSubjectRequestType;
  requesterName: string;
  requesterEmail: string;
  requesterRut?: string;
  details?: string;
  receivedAt?: Date;
}

export async function createDataSubjectRequest(
  companyId: string,
  input: NewRequestInput,
  source: 'PUBLIC_FORM' | 'MANUAL'
): Promise<DataSubjectRequest> {
  // Una solicitud registrada a mano puede haber llegado antes (por correo): el plazo corre desde ahí, pero no desde el futuro.
  const now = new Date();
  const receivedAt = input.receivedAt && input.receivedAt.getTime() <= now.getTime() ? input.receivedAt : now;
  return prisma.dataSubjectRequest.create({
    data: {
      companyId,
      type: input.type,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      requesterRutClean: input.requesterRut ?? null,
      details: input.details || null,
      source,
      receivedAt,
      dueAt: computeDueDate(receivedAt),
    },
  });
}

export interface RequestView extends DataSubjectRequest {
  deadline: DeadlineState;
}

function withDeadline(request: DataSubjectRequest, now: Date): RequestView {
  return { ...request, deadline: deadlineState(request, now) };
}

export async function listDataSubjectRequests(companyId: string, filter: { status?: DataSubjectRequestStatus } = {}): Promise<RequestView[]> {
  const where: Prisma.DataSubjectRequestWhereInput = { companyId, ...(filter.status ? { status: filter.status } : {}) };
  const requests = await prisma.dataSubjectRequest.findMany({ where, orderBy: [{ receivedAt: 'desc' }], take: 500 });
  const now = new Date();
  return requests.map((r) => withDeadline(r, now));
}

export async function getDataSubjectRequest(companyId: string, id: string): Promise<RequestView | null> {
  const request = await prisma.dataSubjectRequest.findFirst({ where: { id, companyId } });
  return request ? withDeadline(request, new Date()) : null;
}

export interface UpdateRequestInput {
  status: DataSubjectRequestStatus;
  identityVerified?: boolean;
  resolutionNote?: string;
}

export async function updateDataSubjectRequest(companyId: string, id: string, userId: string, input: UpdateRequestInput): Promise<RequestView> {
  const current = await prisma.dataSubjectRequest.findFirst({ where: { id, companyId } });
  if (!current) throw new DataProtectionError('Solicitud no encontrada');

  const closing = input.status === 'RESOLVED' || input.status === 'REJECTED';
  // Responder sin haber verificado la identidad entregaría datos de una persona a quien podría no serlo.
  const verified = input.identityVerified ?? Boolean(current.identityVerifiedAt);
  if (input.status === 'RESOLVED' && !verified) {
    throw new DataProtectionError('Antes de resolverla, verifica la identidad de quien la pidió');
  }
  if (closing && !(input.resolutionNote ?? current.resolutionNote)?.trim()) {
    throw new DataProtectionError('Deja constancia de lo que se hizo (o del motivo del rechazo) para cerrar la solicitud');
  }

  const result = await prisma.dataSubjectRequest.updateMany({
    where: { id, companyId },
    data: {
      status: input.status,
      handledById: userId,
      ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote || null } : {}),
      ...(input.identityVerified === true && !current.identityVerifiedAt ? { identityVerifiedAt: new Date() } : {}),
      ...(input.identityVerified === false ? { identityVerifiedAt: null } : {}),
      resolvedAt: closing ? (current.resolvedAt ?? new Date()) : null,
    },
  });
  if (result.count === 0) throw new DataProtectionError('Solicitud no encontrada');
  const updated = await getDataSubjectRequest(companyId, id);
  if (!updated) throw new DataProtectionError('Solicitud no encontrada');
  return updated;
}

export async function extendDataSubjectRequest(companyId: string, id: string, input: { extendedUntil: Date; reason: string }): Promise<RequestView> {
  const current = await prisma.dataSubjectRequest.findFirst({ where: { id, companyId } });
  if (!current) throw new DataProtectionError('Solicitud no encontrada');
  if (current.status === 'RESOLVED' || current.status === 'REJECTED') throw new DataProtectionError('La solicitud ya está cerrada');
  const problem = extensionProblem({ receivedAt: current.receivedAt, dueAt: current.dueAt, requestedUntil: input.extendedUntil, reason: input.reason });
  if (problem) throw new DataProtectionError(problem);

  await prisma.dataSubjectRequest.updateMany({
    where: { id, companyId },
    data: { extendedUntil: input.extendedUntil, extensionReason: input.reason },
  });
  const updated = await getDataSubjectRequest(companyId, id);
  if (!updated) throw new DataProtectionError('Solicitud no encontrada');
  return updated;
}

export interface RequestsSummary {
  open: number;
  overdue: number;
  dueSoon: number;
}

export async function getRequestsSummary(companyId: string): Promise<RequestsSummary> {
  const open = await prisma.dataSubjectRequest.findMany({
    where: { companyId, status: { in: ['RECEIVED', 'IN_PROGRESS'] } },
    select: { status: true, receivedAt: true, dueAt: true, extendedUntil: true },
  });
  const now = new Date();
  let overdue = 0;
  let dueSoon = 0;
  for (const r of open) {
    const state = deadlineState(r, now);
    if (state.kind === 'OVERDUE') overdue++;
    else if (state.kind === 'DUE_SOON') dueSoon++;
  }
  return { open: open.length, overdue, dueSoon };
}

// ---------------------------------------------------------------------------
// Incidentes de seguridad
// ---------------------------------------------------------------------------

export async function listPrivacyIncidents(companyId: string) {
  return prisma.privacyIncident.findMany({ where: { companyId }, orderBy: { detectedAt: 'desc' }, take: 200 });
}

export async function createPrivacyIncident(
  companyId: string,
  userId: string,
  input: {
    title: string;
    description: string;
    detectedAt: Date;
    affectsSensitiveData: boolean;
    affectsMinors: boolean;
    affectsEconomicData: boolean;
    recordsAffected?: number;
    containmentActions?: string;
  }
) {
  return prisma.privacyIncident.create({
    data: { companyId, createdById: userId, ...input, recordsAffected: input.recordsAffected ?? null, containmentActions: input.containmentActions || null },
  });
}

export async function updatePrivacyIncident(
  companyId: string,
  id: string,
  input: { status?: 'OPEN' | 'CONTAINED' | 'CLOSED'; containmentActions?: string; agencyNotified?: boolean; subjectsNotified?: boolean }
) {
  const current = await prisma.privacyIncident.findFirst({ where: { id, companyId } });
  if (!current) throw new DataProtectionError('Incidente no encontrado');
  await prisma.privacyIncident.updateMany({
    where: { id, companyId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.containmentActions !== undefined ? { containmentActions: input.containmentActions || null } : {}),
      ...(input.agencyNotified === true && !current.agencyNotifiedAt ? { agencyNotifiedAt: new Date() } : {}),
      ...(input.agencyNotified === false ? { agencyNotifiedAt: null } : {}),
      ...(input.subjectsNotified === true && !current.subjectsNotifiedAt ? { subjectsNotifiedAt: new Date() } : {}),
      ...(input.subjectsNotified === false ? { subjectsNotifiedAt: null } : {}),
    },
  });
  const updated = await prisma.privacyIncident.findFirst({ where: { id, companyId } });
  if (!updated) throw new DataProtectionError('Incidente no encontrado');
  return updated;
}
