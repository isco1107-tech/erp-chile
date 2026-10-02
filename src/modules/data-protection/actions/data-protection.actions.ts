'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { getAppUrl } from '@/lib/email/mailer';
import { captureException } from '@/lib/observability';
import {
  extendDataSubjectRequestSchema,
  manualDataSubjectRequestSchema,
  personQuerySchema,
  privacyIncidentSchema,
  updateDataSubjectRequestSchema,
  updatePrivacyIncidentSchema,
} from '@/lib/privacy/schema';
import { prisma } from '@/lib/prisma';
import * as requests from '../services/requests.service';
import { buildPersonalDataExport, findPersonalData, type PersonalDataResult } from '../services/personal-data.service';

/**
 * Protección de datos personales (Ley 21.719). Todo con `settings:company`
 * (dueño y administradores): decidir qué se entrega, corrige o elimina de una
 * persona es una decisión de la responsable del tratamiento. Nunca se audita
 * el contenido de lo consultado, solo que se consultó y cuántos registros.
 */

type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

const PATH = '/dashboard/settings/privacy';

function failure(error: unknown, fallback: string, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof requests.DataProtectionError) return { success: false, error: error.message };
  captureException(error, { module: 'proteccion-datos', companyId });
  return { success: false, error: fallback };
}

const portalUrl = (token: string) => `${getAppUrl()}/derechos/${token}`;

export async function sharePrivacyPortalAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true, data: portalUrl(await requests.getOrCreatePrivacyPortalToken(session.companyId)) };
  } catch (error) {
    return failure(error, 'No se pudo generar el enlace del formulario', companyId);
  }
}

export async function regeneratePrivacyPortalAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const token = await requests.regeneratePrivacyPortalToken(session.companyId);
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'UPDATE', entity: 'CompanySettings', entityId: session.companyId, metadata: { change: 'privacy-portal-link-regenerado' },
    });
    revalidatePath(PATH);
    return { success: true, data: portalUrl(token), message: 'Enlace regenerado. El anterior dejó de funcionar.' };
  } catch (error) {
    return failure(error, 'No se pudo regenerar el enlace', companyId);
  }
}

export async function getPrivacyPortalUrlAction(): Promise<ActionResult<string | null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const token = await requests.getPrivacyPortalToken(session.companyId);
    return { success: true, data: token ? portalUrl(token) : null };
  } catch (error) {
    return failure(error, 'No se pudo cargar el enlace del formulario', companyId);
  }
}

export async function listDataSubjectRequestsAction() {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const [list, summary] = await Promise.all([requests.listDataSubjectRequests(session.companyId), requests.getRequestsSummary(session.companyId)]);
    return { success: true as const, data: { requests: list, summary } };
  } catch (error) {
    return failure(error, 'No se pudieron cargar las solicitudes', companyId);
  }
}

export async function createManualRequestAction(input: unknown) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = manualDataSubjectRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const request = await requests.createDataSubjectRequest(session.companyId, parsed.data, 'MANUAL');
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'CREATE', entity: 'DataSubjectRequest', entityId: request.id, metadata: { type: request.type, source: 'MANUAL' },
    });
    revalidatePath(PATH);
    return { success: true as const, data: request, message: 'Solicitud registrada' };
  } catch (error) {
    return failure(error, 'No se pudo registrar la solicitud', companyId);
  }
}

export async function updateDataSubjectRequestAction(id: string, input: unknown) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = updateDataSubjectRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const request = await requests.updateDataSubjectRequest(session.companyId, id, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'UPDATE', entity: 'DataSubjectRequest', entityId: id, metadata: { status: request.status, identityVerified: Boolean(request.identityVerifiedAt) },
    });
    revalidatePath(PATH);
    return { success: true as const, data: request, message: 'Solicitud actualizada' };
  } catch (error) {
    return failure(error, 'No se pudo actualizar la solicitud', companyId);
  }
}

export async function extendDataSubjectRequestAction(id: string, input: unknown) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = extendDataSubjectRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const request = await requests.extendDataSubjectRequest(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'UPDATE', entity: 'DataSubjectRequest', entityId: id, metadata: { change: 'plazo-prorrogado' },
    });
    revalidatePath(PATH);
    return { success: true as const, data: request, message: 'Plazo prorrogado' };
  } catch (error) {
    return failure(error, 'No se pudo prorrogar el plazo', companyId);
  }
}

/** Huella del identificador consultado: permite responder "¿quién consultó los datos de X?" sin guardar el dato en la auditoría. */
const fingerprint = (value: string) => crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);

function accessOf(session: Parameters<typeof can>[0]) {
  return { candidatesSensitive: can(session, 'candidates:sensitive'), payroll: can(session, 'payroll:read') };
}

/** Qué guarda la empresa de una persona (por correo y/o RUT). Solo lectura, y acotada a los permisos de quien consulta. */
export async function searchPersonalDataAction(input: unknown, requestId?: string): Promise<ActionResult<PersonalDataResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = personQuerySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await findPersonalData(session.companyId, { email: parsed.data.email, rut: parsed.data.rut }, accessOf(session));
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      // No hay una acción READ en `AuditAction`: se registra como EXPORT con `kind` para distinguir consulta de descarga.
      action: 'EXPORT', entity: 'PersonalDataSearch', entityId: session.companyId,
      metadata: {
        kind: 'search',
        records: result.totalRecords,
        ...(requestId ? { requestId } : {}),
        ...(result.query.email ? { emailRef: fingerprint(result.query.email) } : {}),
        ...(result.query.rutClean ? { rutRef: fingerprint(result.query.rutClean) } : {}),
      },
    });
    return { success: true, data: result };
  } catch (error) {
    return failure(error, 'No se pudo buscar a la persona', companyId);
  }
}

/**
 * Copia de los datos de quien hizo una solicitud, para entregársela (acceso y
 * portabilidad). Solo sale de una solicitud con la identidad YA verificada y
 * se arma con el correo y RUT de esa solicitud: nunca con texto libre, para
 * que nadie pida "los datos de otra persona" y se los lleve.
 */
export async function exportPersonalDataAction(requestId: string): Promise<ActionResult<{ filename: string; json: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    if (!can(session, 'company:export')) return { success: false, error: 'No tienes permiso para descargar datos de personas' };

    const request = await requests.getDataSubjectRequest(session.companyId, requestId);
    if (!request) return { success: false, error: 'Solicitud no encontrada' };
    if (!request.identityVerifiedAt) return { success: false, error: 'Antes de descargar los datos, verifica la identidad de quien hizo la solicitud' };
    if (request.type !== 'ACCESS' && request.type !== 'PORTABILITY') return { success: false, error: 'La copia solo se entrega en solicitudes de acceso o portabilidad' };

    const [result, company] = await Promise.all([
      findPersonalData(session.companyId, { email: request.requesterEmail, rut: request.requesterRutClean ?? undefined }, accessOf(session)),
      prisma.company.findUnique({ where: { id: session.companyId }, select: { businessName: true } }),
    ]);
    const payload = buildPersonalDataExport(result, { companyName: company?.businessName ?? '', generatedAt: new Date() });
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'EXPORT', entity: 'PersonalDataSearch', entityId: requestId,
      metadata: { kind: 'export', requestId, records: result.totalRecords, emailRef: fingerprint(request.requesterEmail) },
    });
    return { success: true, data: { filename: `datos-personales-${new Date().toISOString().slice(0, 10)}.json`, json: JSON.stringify(payload, null, 2) } };
  } catch (error) {
    return failure(error, 'No se pudo preparar la copia de los datos', companyId);
  }
}

export async function listPrivacyIncidentsAction() {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true as const, data: await requests.listPrivacyIncidents(session.companyId) };
  } catch (error) {
    return failure(error, 'No se pudieron cargar los incidentes', companyId);
  }
}

export async function createPrivacyIncidentAction(input: unknown) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = privacyIncidentSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const incident = await requests.createPrivacyIncident(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'CREATE', entity: 'PrivacyIncident', entityId: incident.id, metadata: {},
    });
    revalidatePath(PATH);
    return { success: true as const, data: incident, message: 'Incidente registrado' };
  } catch (error) {
    return failure(error, 'No se pudo registrar el incidente', companyId);
  }
}

export async function updatePrivacyIncidentAction(id: string, input: unknown) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = updatePrivacyIncidentSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const incident = await requests.updatePrivacyIncident(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId, userId: session.id, userEmail: session.email,
      action: 'UPDATE', entity: 'PrivacyIncident', entityId: id, metadata: { status: incident.status },
    });
    revalidatePath(PATH);
    return { success: true as const, data: incident, message: 'Incidente actualizado' };
  } catch (error) {
    return failure(error, 'No se pudo actualizar el incidente', companyId);
  }
}
