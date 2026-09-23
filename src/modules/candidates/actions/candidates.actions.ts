'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type CandidateAttendance, type CandidateDocument } from '@prisma/client';
import { can, requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { sendEmail } from '@/lib/email/mailer';
import { lookupCompaniesByName, type CompanyLookupCandidate } from '@/modules/contacts/services/company-lookup.service';
import { buildCandidateStatusChangeEmail } from '@/lib/email/templates';
import {
  attendanceCreateSchema,
  candidateCreateSchema,
  candidateStatusChangeSchema,
  candidateUpdateSchema,
  documentCreateSchema,
  documentUpdateSchema,
  registrationSettingsSchema,
} from '../schema';
import * as candidatesService from '../services/candidates.service';
import * as attendanceService from '../services/attendance.service';
import * as documentsService from '../services/documents.service';
import type {
  CandidateComplianceRow,
  CandidateHistoryEntry,
  CandidateListFilters,
  CandidateListResult,
  CandidateProjectOption,
  CandidateWithProject,
  RegistrationSettings,
} from '../services/candidates.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe una candidata con ese RUT en este proyecto';
  }
  return toFriendlyErrorMessage(error);
}

/**
 * Campos de contacto/identificación de una postulación (Sección 6: "el
 * acceso a datos de contacto y fotografías debe requerir un permiso
 * distinto del de solo lectura del listado"). Se ocultan del payload cuando
 * la sesión tiene `candidates:read` pero no `candidates:sensitive` — un
 * CustomRole puede así ver nombre/estado/comuna de las postulantes sin ver
 * su RUT, dirección o datos de contacto.
 */
function redactSensitiveFields(candidate: CandidateWithProject, canSeeSensitive: boolean): CandidateWithProject {
  if (canSeeSensitive) return candidate;
  return {
    ...candidate,
    rut: '••••••••',
    email: null,
    phone: null,
    direccion: null,
    instagram: null,
    guardianName: null,
    guardianRut: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    ipOrigen: null,
    userAgent: null,
    photoUrl: null,
    employerName: null,
    employerRut: null,
    employerAddress: null,
    condicionesMedicas: null,
  };
}

/** Reusa el buscador web de empresas de `contacts` (DuckDuckGo + regex de RUT) para completar los datos del empleador de una candidata — no duplica esa lógica de scraping. */
export async function lookupEmployerAction(query: string): Promise<ActionResult<CompanyLookupCandidate[]>> {
  try {
    await requireAuthWithPermission('candidates:write');
    const data = await lookupCompaniesByName(query);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCandidateAction(input: unknown): Promise<ActionResult<CandidateWithProject>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = candidateCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const data = await candidatesService.createCandidate(session.companyId, parsed.data);
    // Se evita registrar el RUT completo en texto plano en la bitácora de
    // auditoría, dato sensible junto a fecha de nacimiento y contacto de
    // emergencia: el `entityId` ya identifica el registro sin necesidad de
    // repetirlo en `metadata`.
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Candidate',
      entityId: data.id,
      metadata: { projectId: data.projectId, fullName: data.fullName, status: data.status },
    });
    revalidatePath('/dashboard/candidates');
    return { success: true, data: redactSensitiveFields(data, can(session, 'candidates:sensitive')), message: 'Candidata creada correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateCandidateAction(id: string, input: unknown): Promise<ActionResult<CandidateWithProject>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = candidateUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const data = await candidatesService.updateCandidate(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: data.id,
      metadata: { projectId: data.projectId, fullName: data.fullName, status: data.status },
    });
    revalidatePath('/dashboard/candidates');
    revalidatePath(`/dashboard/candidates/${id}`);
    return { success: true, data: redactSensitiveFields(data, can(session, 'candidates:sensitive')), message: 'Candidata actualizada correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Cambio de estado (Sección 6: "cambio de estado con motivo obligatorio al
 * descartar. Cada cambio queda registrado con el usuario que lo hizo"). */
export async function updateCandidateStatusAction(id: string, input: unknown): Promise<ActionResult<CandidateWithProject>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = candidateStatusChangeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const previous = await candidatesService.getCandidate(session.companyId, id);
    const data = await candidatesService.updateCandidateStatus(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: data.id,
      metadata: { statusChangedTo: data.status, motivoDescarte: data.motivoDescarte },
    });
    revalidatePath('/dashboard/candidates');
    revalidatePath(`/dashboard/candidates/${id}`);
    // Fuera del flujo principal a propósito, mismo criterio que
    // `sendConfirmationEmails` en el endpoint público de postulación: un
    // fallo de SMTP nunca debe hacer fallar el cambio de estado, que ya
    // quedó guardado y auditado.
    if (previous && previous.status !== data.status) {
      await notifyCandidateStatusChange(session.companyId, data).catch((error) =>
        captureException(error, { module: 'candidates', companyId: session.companyId, extra: { reason: 'status-change-notice' } })
      );
    }
    return { success: true, data: redactSensitiveFields(data, can(session, 'candidates:sensitive')), message: 'Estado actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Aviso a la propia candidata de un cambio de estado (felicitaciones al
 * avanzar de ronda o ser seleccionada, agradecimiento al ser descartada) —
 * ver `buildCandidateStatusChangeEmail`, que decide si el estado nuevo
 * amerita algún correo. Sin destinatario (postulación cargada a mano sin
 * email, o creada antes de exigirlo) simplemente no hace nada. */
async function notifyCandidateStatusChange(companyId: string, candidate: CandidateWithProject): Promise<void> {
  if (!candidate.email) return;
  const email = buildCandidateStatusChangeEmail({
    fullName: candidate.fullName,
    projectName: candidate.project.name,
    companyName: await candidatesService.getCompanyBusinessName(companyId),
    status: candidate.status,
  });
  if (!email) return;
  await sendEmail({ to: candidate.email, ...email });
}

export async function listCandidatesAction(filters: CandidateListFilters = {}): Promise<ActionResult<CandidateListResult>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const result = await candidatesService.listCandidates(session.companyId, filters);
    const canSeeSensitive = can(session, 'candidates:sensitive');
    return { success: true, data: { ...result, items: result.items.map((c) => redactSensitiveFields(c, canSeeSensitive)) } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCandidateAction(id: string): Promise<ActionResult<CandidateWithProject>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await candidatesService.getCandidate(session.companyId, id);
    if (!data) return { success: false, error: 'Candidata no encontrada' };
    return { success: true, data: redactSensitiveFields(data, can(session, 'candidates:sensitive')) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Eliminación definitiva (Sección 7: "acción de eliminación que borre la
 * postulación y sus archivos físicos, para responder a una solicitud de la
 * titular"). El mismo botón sirve tanto para corregir un error de carga
 * interna como para atender una solicitud Ley 19.628/21.719 — `reason` solo
 * cambia lo que queda anotado en la bitácora, no el comportamiento. */
export async function deleteCandidateAction(id: string, reason?: 'data_subject_request'): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    await candidatesService.deleteCandidate(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Candidate',
      entityId: id,
      metadata: reason ? { reason } : {},
    });
    revalidatePath('/dashboard/candidates');
    return { success: true, data: null, message: 'Candidata eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Historial de la ficha (Sección 6: "ficha individual con... el historial de
 * cambios"). Requiere `candidates:sensitive`: la bitácora expone quién vio o
 * descargó los archivos de la postulante, en sí mismo un dato de acceso
 * sensible sobre esa persona. */
export async function getCandidateHistoryAction(candidateId: string): Promise<ActionResult<CandidateHistoryEntry[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:sensitive');
    const data = await candidatesService.getCandidateHistory(session.companyId, candidateId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCandidateComplianceBoardAction(projectId?: string): Promise<ActionResult<CandidateComplianceRow[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await candidatesService.getCandidateComplianceBoard(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listCandidateProjectOptionsAction(): Promise<ActionResult<CandidateProjectOption[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await candidatesService.listProjectOptions(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Link de auto-inscripción y configuración de la convocatoria (un link/una
// ventana de postulación por certamen)
// ---------------------------------------------------------------------------

export async function getOrCreateRegistrationLinkAction(projectId: string): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const token = await candidatesService.getOrCreateRegistrationToken(session.companyId, projectId);
    return { success: true, data: { token } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regenerateRegistrationLinkAction(projectId: string): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const token = await candidatesService.regenerateRegistrationToken(session.companyId, projectId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { candidateRegistrationTokenRegenerated: true },
    });
    return { success: true, data: { token }, message: 'Link regenerado — el anterior dejó de funcionar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getRegistrationSettingsAction(projectId: string): Promise<ActionResult<RegistrationSettings>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await candidatesService.getRegistrationSettings(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateRegistrationSettingsAction(projectId: string, input: unknown): Promise<ActionResult<RegistrationSettings>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = registrationSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await candidatesService.updateRegistrationSettings(session.companyId, projectId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { registrationStatus: data.registrationStatus },
    });
    revalidatePath('/dashboard/candidates');
    return { success: true, data, message: 'Configuración de la convocatoria actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Asistencia (talleres/pasarela/oratoria)
// ---------------------------------------------------------------------------

export async function listAttendanceAction(candidateId: string): Promise<ActionResult<CandidateAttendance[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await attendanceService.listAttendance(session.companyId, candidateId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addAttendanceAction(candidateId: string, input: unknown): Promise<ActionResult<CandidateAttendance>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = attendanceCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await attendanceService.addAttendance(session.companyId, candidateId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CandidateAttendance',
      entityId: data.id,
      metadata: { candidateId, activityType: data.activityType, attended: data.attended },
    });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true, data, message: 'Asistencia registrada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteAttendanceAction(attendanceId: string, candidateId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    await attendanceService.deleteAttendance(session.companyId, attendanceId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'CandidateAttendance',
      entityId: attendanceId,
      metadata: { candidateId },
    });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true, data: null, message: 'Registro eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Documentos (contratos de imagen, fotografías de postulación y otros)
// ---------------------------------------------------------------------------

const SENSITIVE_DOCUMENT_TYPES: ReadonlySet<CandidateDocument['documentType']> = new Set([
  'PHOTO_FACE',
  'PHOTO_FULL_BODY',
  'MEDICAL_CERTIFICATE',
]);

/**
 * `fileUrl` es la URL PÚBLICA real del blob (`access: 'public'` en Vercel
 * Blob) — nunca debe llegar al navegador para una fotografía o certificado
 * médico de postulación, o la ruta autenticada de descarga
 * (`.../documents/[id]/file`) deja de significar algo: cualquiera con
 * `candidates:read`/`candidates:write` (sin `candidates:sensitive`) podría
 * copiarla del panel y acceder al archivo para siempre, sin sesión y sin
 * quedar en la bitácora. Para `CONTRACT_IMAGE`/`OTHER` sí se conserva — son
 * documentos internos preexistentes que el panel ya enlazaba directo antes
 * de este módulo.
 */
function stripSensitiveFileUrl(doc: CandidateDocument): CandidateDocument {
  if (!SENSITIVE_DOCUMENT_TYPES.has(doc.documentType)) return doc;
  return { ...doc, fileUrl: '' };
}

/**
 * Misma base de permiso que antes (`candidates:read`) para no romper el flujo
 * ya existente de contratos de imagen (`CONTRACT_IMAGE`), que ADMIN ya podía
 * gestionar. Las fotografías de la postulación pública (`PHOTO_FACE`/
 * `PHOTO_FULL_BODY`) se filtran del listado sin `candidates:sensitive`, y su
 * `fileUrl` se limpia siempre (ver `stripSensitiveFileUrl`) — el panel las
 * muestra por `id` a través de la ruta autenticada, nunca por URL directa.
 */
export async function listDocumentsAction(candidateId: string): Promise<ActionResult<CandidateDocument[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await documentsService.listDocuments(session.companyId, candidateId);
    const canSeeSensitive = can(session, 'candidates:sensitive');
    const visible = canSeeSensitive ? data : data.filter((d) => !SENSITIVE_DOCUMENT_TYPES.has(d.documentType));
    return { success: true, data: visible.map(stripSensitiveFileUrl) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addDocumentAction(candidateId: string, input: unknown): Promise<ActionResult<CandidateDocument>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = documentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await documentsService.addDocument(session.companyId, candidateId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CandidateDocument',
      entityId: data.id,
      metadata: { candidateId, title: data.title },
    });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true, data: stripSensitiveFileUrl(data), message: 'Documento agregado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateDocumentAction(documentId: string, candidateId: string, input: unknown): Promise<ActionResult<CandidateDocument>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = documentUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await documentsService.updateDocument(session.companyId, documentId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CandidateDocument',
      entityId: data.id,
      metadata: { candidateId, status: data.status },
    });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true, data: stripSensitiveFileUrl(data), message: 'Documento actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteDocumentAction(documentId: string, candidateId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    await documentsService.deleteDocument(session.companyId, documentId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'CandidateDocument',
      entityId: documentId,
      metadata: { candidateId },
    });
    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { success: true, data: null, message: 'Documento eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
