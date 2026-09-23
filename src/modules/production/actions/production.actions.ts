'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma, type BadgeTemplate, type StaffAccreditation, type StageTimelineItem, type WardrobeItem } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { sendEmail, getAppUrl, type EmailResult } from '@/lib/email/mailer';
import { buildAccreditationEmail } from '@/lib/email/templates';
import {
  staffAccreditationCreateSchema,
  stageTimelineItemCreateSchema,
  stageTimelineItemUpdateSchema,
  wardrobeItemCreateSchema,
  wardrobeItemUpdateSchema,
  badgeTemplateCreateSchema,
  badgeTemplateUpdateSchema,
  ACCREDITATION_LEVEL_LABELS,
  STAGE_LIVE_ACTIONS,
  chainScheduleSchema,
} from '../schema';
import * as productionService from '../services/production.service';
import type {
  ProductionCandidateOption,
  ProductionProjectOption,
  StageTimelineItemWithCandidate,
  WardrobeItemWithRelations,
} from '../services/production.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un registro con ese identificador en este proyecto';
  }
  return toFriendlyErrorMessage(error);
}

function revalidateProduction() {
  revalidatePath('/dashboard/production');
  revalidatePath('/dashboard/production/accreditation');
  revalidatePath('/dashboard/production/timeline');
  revalidatePath('/dashboard/production/wardrobe');
}

// ---------------------------------------------------------------------------
// Escaleta
// ---------------------------------------------------------------------------

export async function listStageItemsAction(projectId: string): Promise<ActionResult<StageTimelineItemWithCandidate[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listStageItems(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createStageItemAction(input: unknown): Promise<ActionResult<StageTimelineItem>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = stageTimelineItemCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.createStageItem(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'StageTimelineItem',
      entityId: data.id,
      metadata: { projectId: data.projectId, title: data.title },
    });
    revalidateProduction();
    return { success: true, data, message: 'Bloque agregado a la escaleta' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateStageItemAction(id: string, input: unknown): Promise<ActionResult<StageTimelineItem>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = stageTimelineItemUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.updateStageItem(session.companyId, id, parsed.data);
    revalidateProduction();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function moveStageItemAction(id: string, projectId: string, direction: 'up' | 'down'): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    await productionService.moveStageItem(session.companyId, projectId, id, direction);
    revalidateProduction();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteStageItemAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    await productionService.deleteStageItem(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'StageTimelineItem',
      entityId: id,
      metadata: {},
    });
    revalidateProduction();
    return { success: true, data: null, message: 'Bloque eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function duplicateStageItemAction(id: string): Promise<ActionResult<StageTimelineItem>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const data = await productionService.duplicateStageItem(session.companyId, id);
    revalidateProduction();
    return { success: true, data, message: 'Bloque duplicado al final de la escaleta' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Modo show: al aire / terminar / omitir / volver a pendiente un bloque puntual. */
export async function stageLiveAction(id: string, action: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = z.enum(STAGE_LIVE_ACTIONS).safeParse(action);
    if (!parsed.success) return { success: false, error: 'Acción inválida' };
    await productionService.applyStageLiveAction(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'StageTimelineItem',
      entityId: id,
      metadata: { live: parsed.data },
    });
    revalidateProduction();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** "Siguiente bloque" del modo show. */
export async function advanceShowAction(projectId: string): Promise<ActionResult<{ currentId: string | null }>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const currentId = await productionService.advanceShow(session.companyId, projectId);
    revalidateProduction();
    return { success: true, data: { currentId }, message: currentId ? undefined : 'Fin del show: no quedan bloques pendientes' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function chainStageScheduleAction(input: unknown): Promise<ActionResult<{ changed: number }>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = chainScheduleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const changed = await productionService.chainStageSchedule(session.companyId, parsed.data.projectId, parsed.data.firstStart);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'StageTimelineItem',
      entityId: parsed.data.projectId,
      metadata: { chainedFrom: parsed.data.firstStart.toISOString(), changed },
    });
    revalidateProduction();
    return { success: true, data: { changed }, message: changed === 0 ? 'Los horarios ya estaban encadenados' : `${changed} bloque(s) reprogramado(s)` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function generateWardrobePlanAction(projectId: string): Promise<ActionResult<{ created: number }>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const created = await productionService.generateWardrobePlan(session.companyId, projectId);
    if (created > 0) {
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'CREATE',
        entity: 'WardrobeItem',
        entityId: projectId,
        metadata: { generatedPlan: created },
      });
    }
    revalidateProduction();
    return {
      success: true,
      data: { created },
      message: created === 0 ? 'El plan de looks ya estaba completo' : `${created} look(s) pendiente(s) creados`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Vestuario
// ---------------------------------------------------------------------------

export async function listWardrobeItemsAction(projectId: string): Promise<ActionResult<WardrobeItemWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listWardrobeItems(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createWardrobeItemAction(input: unknown): Promise<ActionResult<WardrobeItem>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = wardrobeItemCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.createWardrobeItem(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'WardrobeItem',
      entityId: data.id,
      metadata: { projectId: data.projectId, name: data.name },
    });
    revalidateProduction();
    return { success: true, data, message: 'Prenda asignada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateWardrobeItemAction(id: string, input: unknown): Promise<ActionResult<WardrobeItem>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = wardrobeItemUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.updateWardrobeItem(session.companyId, id, parsed.data);
    revalidateProduction();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteWardrobeItemAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    await productionService.deleteWardrobeItem(session.companyId, id);
    revalidateProduction();
    return { success: true, data: null, message: 'Prenda eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Acreditación
// ---------------------------------------------------------------------------

export async function listStaffAccreditationsAction(projectId: string): Promise<ActionResult<StaffAccreditation[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listStaffAccreditations(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Envía la credencial por correo con un QR enlazado a la URL pública de
 * verificación (no los datos en texto plano). El QR se referencia como
 * `<img src>` normal contra `/api/verify/accreditation/[token]/qr` — NO como
 * `data:` URI: Gmail y otros clientes lo descartan en silencio, y la API
 * transaccional de Brevo tampoco soporta adjuntos inline por `cid`. Nunca
 * lanza: la acreditación ya quedó guardada y un fallo del proveedor de correo
 * no debe deshacerla — se puede reenviar después con `resendAccreditationQrAction`.
 */
async function deliverAccreditationEmail(
  record: StaffAccreditation & { project: { name: string }; template: BadgeTemplate | null },
  companyName: string
): Promise<EmailResult> {
  const verifyUrl = `${getAppUrl()}/verify/accreditation/${record.qrToken}`;
  const email = buildAccreditationEmail({
    companyName,
    projectName: record.project.name,
    fullName: record.fullName,
    role: record.role,
    organization: record.organization,
    accessLevelLabel: ACCREDITATION_LEVEL_LABELS[record.accessLevel],
    badgeCode: record.badgeCode,
    qrImageUrl: `${getAppUrl()}/api/verify/accreditation/${record.qrToken}/qr`,
    verifyUrl,
    accentColor: record.template?.accentColor,
  });
  return sendEmail({ to: record.email!, ...email });
}

function accreditationEmailMessage(status: EmailResult['status'], email: string, context: 'created' | 'resent'): string {
  const prefix = context === 'created' ? 'Acreditación creada. ' : '';
  if (status === 'sent') return `${prefix}QR enviado a ${email}.`;
  if (status === 'logged') return `${prefix}El envío de correo no está configurado: revisa el log del servidor para el enlace del QR.`;
  return `${prefix}El correo a ${email} no pudo enviarse. ${context === 'created' ? 'Puedes reenviarlo desde la lista.' : 'Intenta nuevamente más tarde.'}`;
}

export async function createStaffAccreditationAction(input: unknown): Promise<ActionResult<StaffAccreditation>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const parsed = staffAccreditationCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.createStaffAccreditation(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'StaffAccreditation',
      entityId: data.id,
      metadata: { projectId: data.projectId, fullName: data.fullName, accessLevel: data.accessLevel },
    });
    revalidateProduction();

    if (!data.email) {
      return { success: true, data, message: 'Acreditación creada' };
    }

    // La acreditación ya está guardada: un error al generar el QR o enviar el
    // correo (a diferencia de un `EmailResult.status === 'failed'`, que ya
    // maneja `sendEmail` sin lanzar) no debe convertir esta respuesta en un
    // error — el usuario vería "falló" sobre un registro que sí existe.
    try {
      const full = await productionService.getStaffAccreditationById(session.companyId, data.id);
      const result = await deliverAccreditationEmail(full, session.companyName);
      if (result.status === 'sent') await productionService.markAccreditationQrEmailSent(session.companyId, data.id);
      return { success: true, data, message: accreditationEmailMessage(result.status, data.email, 'created') };
    } catch {
      return { success: true, data, message: 'Acreditación creada, pero el correo con el QR no pudo enviarse. Puedes reenviarlo desde la lista.' };
    }
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function resendAccreditationQrAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const record = await productionService.getStaffAccreditationById(session.companyId, id);
    if (!record.email) return { success: false, error: 'Esta acreditación no tiene correo asociado' };
    const result = await deliverAccreditationEmail(record, session.companyName);
    if (result.status === 'sent') await productionService.markAccreditationQrEmailSent(session.companyId, id);
    if (result.status === 'failed') return { success: false, error: accreditationEmailMessage(result.status, record.email, 'resent') };
    return { success: true, data: null, message: accreditationEmailMessage(result.status, record.email, 'resent') };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function checkInStaffAction(id: string): Promise<ActionResult<StaffAccreditation>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    const data = await productionService.checkInStaff(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'StaffAccreditation',
      entityId: id,
      metadata: { checkedIn: true },
    });
    revalidateProduction();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteStaffAccreditationAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:write');
    await productionService.deleteStaffAccreditation(session.companyId, id);
    revalidateProduction();
    return { success: true, data: null, message: 'Acreditación eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

export async function listProductionProjectOptionsAction(): Promise<ActionResult<ProductionProjectOption[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listProjectOptions(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listProductionCandidateOptionsAction(projectId: string): Promise<ActionResult<ProductionCandidateOption[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listCandidateOptions(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Diseño de credencial (BadgeTemplate)
// ---------------------------------------------------------------------------

export async function listBadgeTemplatesAction(projectId: string): Promise<ActionResult<BadgeTemplate[]>> {
  try {
    const session = await requireAuthWithPermission('production:read');
    const data = await productionService.listBadgeTemplates(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createBadgeTemplateAction(input: unknown): Promise<ActionResult<BadgeTemplate>> {
  try {
    const session = await requireAuthWithPermission('production:design');
    const parsed = badgeTemplateCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.createBadgeTemplate(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'BadgeTemplate',
      entityId: data.id,
      metadata: { projectId: data.projectId, name: data.name },
    });
    revalidateProduction();
    return { success: true, data, message: 'Plantilla de diseño creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateBadgeTemplateAction(id: string, input: unknown): Promise<ActionResult<BadgeTemplate>> {
  try {
    const session = await requireAuthWithPermission('production:design');
    const parsed = badgeTemplateUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await productionService.updateBadgeTemplate(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'BadgeTemplate',
      entityId: id,
      metadata: {},
    });
    revalidateProduction();
    return { success: true, data, message: 'Plantilla de diseño actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteBadgeTemplateAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('production:design');
    await productionService.deleteBadgeTemplate(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'BadgeTemplate',
      entityId: id,
      metadata: {},
    });
    revalidateProduction();
    return { success: true, data: null, message: 'Plantilla eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
