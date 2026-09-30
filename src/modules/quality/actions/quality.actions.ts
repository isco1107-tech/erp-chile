'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { inspectionSchema, procedureSchema, supplierProfileSchema, templateSchema } from '../schema';
import * as service from '../services/quality.service';
import type { InspectionRow, ProcedureRow, QualityOverview, SupplierRow, TemplateRow } from '../services/quality.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.QualityError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'calidad', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

const firstIssue = (issues: Array<{ message: string }>) => issues[0]?.message ?? 'Datos inválidos';

function revalidate(): void {
  revalidatePath('/dashboard/quality');
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export async function getQualityOverviewAction(): Promise<ActionResult<QualityOverview>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    return { success: true, data: await service.getOverview(session.companyId, session.id, session.permissions.includes('quality:manage')) };
  } catch (error) {
    return fail(error);
  }
}

export async function listProceduresAction(): Promise<ActionResult<ProcedureRow[]>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    return { success: true, data: await service.listProcedures(session.companyId, session.id, session.permissions.includes('quality:manage')) };
  } catch (error) {
    return fail(error);
  }
}

export async function getProcedureAction(id: string): Promise<ActionResult<{ id: string; title: string; category: string; summary: string | null; content: string; version: number; status: string; reviewEveryDays: number | null }>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    const procedure = await service.getProcedure(session.companyId, String(id));
    if (!procedure) return { success: false, error: 'Procedimiento no encontrado' };
    // Un borrador solo lo ven quienes pueden gestionarlos.
    if (procedure.status === 'DRAFT' && !session.permissions.includes('quality:manage')) return { success: false, error: 'Procedimiento no encontrado' };
    const { id: pid, title, category, summary, content, version, status, reviewEveryDays } = procedure;
    return { success: true, data: { id: pid, title, category, summary, content, version, status, reviewEveryDays } };
  } catch (error) {
    return fail(error);
  }
}

export async function listTemplatesAction(): Promise<ActionResult<TemplateRow[]>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    return { success: true, data: await service.listTemplates(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function listInspectionsAction(status?: string): Promise<ActionResult<InspectionRow[]>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    const safe = status === 'PASSED' || status === 'FAILED' ? status : undefined;
    return { success: true, data: await service.listInspections(session.companyId, { status: safe }) };
  } catch (error) {
    return fail(error);
  }
}

export async function listSuppliersAction(): Promise<ActionResult<SupplierRow[]>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    return { success: true, data: await service.listSuppliers(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

// ── Procedimientos ───────────────────────────────────────────────────────────

export async function saveProcedureAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:manage');
    companyId = session.companyId;
    const parsed = procedureSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    if (id) {
      const { version } = await service.updateProcedure(session.companyId, id, parsed.data);
      await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Procedure', entityId: id, metadata: { version } });
      revalidate();
      return { success: true, data: { id }, message: `Procedimiento guardado (versión ${version})` };
    }
    const created = await service.createProcedure(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'Procedure', entityId: created.id, metadata: { title: parsed.data.title } });
    revalidate();
    return { success: true, data: created, message: 'Procedimiento creado como borrador' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveProcedure' });
  }
}

export async function setProcedureStatusAction(id: string, status: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:manage');
    companyId = session.companyId;
    if (status !== 'ACTIVE' && status !== 'ARCHIVED') return { success: false, error: 'Estado inválido' };
    await service.setProcedureStatus(session.companyId, String(id), status);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Procedure', entityId: String(id), metadata: { status } });
    revalidate();
    return { success: true, data: null, message: status === 'ACTIVE' ? 'Procedimiento publicado: el equipo ya puede leerlo' : 'Procedimiento archivado' };
  } catch (error) {
    return fail(error, companyId, { action: 'setProcedureStatus' });
  }
}

export async function markProcedureReviewedAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('quality:manage');
    await service.markProcedureReviewed(session.companyId, String(id));
    revalidate();
    return { success: true, data: null, message: 'Revisión registrada' };
  } catch (error) {
    return fail(error);
  }
}

export async function acknowledgeProcedureAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('quality:read');
    await service.acknowledgeProcedure(session.companyId, session.id, String(id));
    revalidate();
    return { success: true, data: null, message: 'Registrado: leíste y entendiste este procedimiento' };
  } catch (error) {
    return fail(error);
  }
}

export async function installStarterPackAction(): Promise<ActionResult<{ procedures: number; templates: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:manage');
    companyId = session.companyId;
    const result = await service.installStarterPack(session.companyId, session.id);
    if (result.procedures + result.templates > 0) {
      await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'Procedure', entityId: 'starter-pack', metadata: result });
    }
    revalidate();
    return {
      success: true,
      data: result,
      message: result.procedures + result.templates === 0 ? 'El paquete inicial ya estaba cargado' : `Se cargaron ${result.procedures} procedimientos (en borrador) y ${result.templates} plantillas`,
    };
  } catch (error) {
    return fail(error, companyId, { action: 'installStarterPack' });
  }
}

// ── Plantillas e inspecciones ────────────────────────────────────────────────

export async function saveTemplateAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:manage');
    companyId = session.companyId;
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const saved = await service.saveTemplate(session.companyId, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: id ? 'UPDATE' : 'CREATE', entity: 'QualityTemplate', entityId: saved.id, metadata: { name: parsed.data.name } });
    revalidate();
    return { success: true, data: saved, message: 'Plantilla guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveTemplate' });
  }
}

export async function createInspectionAction(input: unknown): Promise<ActionResult<{ id: string; status: 'PASSED' | 'FAILED'; failed: string[] }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:write');
    companyId = session.companyId;
    const parsed = inspectionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const created = await service.createInspection(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'QualityInspection', entityId: created.id, metadata: { template: created.templateName, status: created.status, lot: created.lotNumber } });
    if (created.status === 'FAILED') {
      // Fuera del guardado: un aviso es I/O externo y no debe poder deshacer la inspección.
      try {
        await notifyCompany(session.companyId, {
          severity: 'WARNING',
          title: 'Inspección de calidad no aprobada',
          message: `${created.templateName}${created.lotNumber ? ` · lote ${created.lotNumber}` : ''}: no cumple ${created.failed.join(', ')}.`,
          href: '/dashboard/quality',
        });
      } catch (notifyError) {
        captureException(notifyError, { module: 'calidad', companyId: session.companyId, extra: { step: 'notify' } });
      }
    }
    revalidate();
    return {
      success: true,
      data: { id: created.id, status: created.status, failed: created.failed },
      message: created.status === 'PASSED' ? 'Inspección aprobada' : `Inspección NO aprobada: ${created.failed.join(', ')}`,
    };
  } catch (error) {
    return fail(error, companyId, { action: 'createInspection' });
  }
}

export async function saveSupplierProfileAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('quality:write');
    companyId = session.companyId;
    const parsed = supplierProfileSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    await service.saveSupplierProfile(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'SupplierProfile', entityId: parsed.data.contactId, metadata: { type: parsed.data.supplierType } });
    revalidate();
    return { success: true, data: null, message: 'Ficha guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveSupplierProfile' });
  }
}
