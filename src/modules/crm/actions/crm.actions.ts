'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import {
  activityCreateSchema,
  activityRescheduleSchema,
  convertToSponsorshipSchema,
  moveStageSchema,
  opportunityCreateSchema,
  opportunityUpdateSchema,
  personCreateSchema,
  personUpdateSchema,
  pipelineFiltersSchema,
  STAGE_LABELS,
} from '../schema';
import * as crmService from '../services/crm.service';
import type {
  CrmPackageOption,
  CrmPersonDetail,
  CrmPersonRow,
  CrmProjectOption,
  CrmReport,
  CrmTask,
  OpportunityCard,
  OpportunityDetail,
  PersonOption,
  PipelineSummary,
} from '../services/crm.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

function revalidateCrm() {
  revalidatePath('/dashboard/crm', 'layout');
}

export interface CrmLookups {
  users: Array<{ id: string; name: string }>;
  projects: CrmProjectOption[];
  packages: CrmPackageOption[];
  tags: string[];
  currentUserId: string;
  /** Puede convertir negocios ganados en contratos (CRM + Auspicios contratados y permiso de escritura en ambos). */
  canConvert: boolean;
}

async function loadLookups(companyId: string, userId: string, canConvert: boolean): Promise<CrmLookups> {
  const [users, projects, packages, tags] = await Promise.all([
    crmService.listAssignableUsers(companyId),
    crmService.listProjectOptions(companyId),
    crmService.listPackageOptions(companyId),
    crmService.listTagsInUse(companyId),
  ]);
  return { users, projects, packages, tags, currentUserId: userId, canConvert };
}

export interface PipelineBoard extends CrmLookups {
  opportunities: OpportunityCard[];
  summary: PipelineSummary;
}

export async function getPipelineBoardAction(input: unknown = {}): Promise<ActionResult<PipelineBoard>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const parsed = pipelineFiltersSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const filters = { ...parsed.data, ownerUserId: parsed.data.mine ? session.id : undefined };
    const [opportunities, summary, lookups] = await Promise.all([
      crmService.listOpportunities(session.companyId, filters),
      crmService.getPipelineSummary(session.companyId, filters),
      loadLookups(session.companyId, session.id, can(session, 'crm:write') && can(session, 'sponsorships:write')),
    ]);
    return { success: true, data: { opportunities, summary, ...lookups } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export interface OpportunityList extends CrmLookups {
  opportunities: OpportunityCard[];
}

/** Vista de lista: incluye cerrados sin la ventana de 90 días del tablero. */
export async function listOpportunitiesAction(input: unknown = {}): Promise<ActionResult<OpportunityList>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const parsed = pipelineFiltersSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const filters = { ...parsed.data, ownerUserId: parsed.data.mine ? session.id : undefined };
    const [opportunities, lookups] = await Promise.all([
      crmService.listAllOpportunities(session.companyId, filters),
      loadLookups(session.companyId, session.id, can(session, 'crm:write') && can(session, 'sponsorships:write')),
    ]);
    return { success: true, data: { opportunities, ...lookups } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCrmLookupsAction(): Promise<ActionResult<CrmLookups>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    return { success: true, data: await loadLookups(session.companyId, session.id, can(session, 'crm:write') && can(session, 'sponsorships:write')) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getOpportunityAction(id: string): Promise<ActionResult<OpportunityDetail>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const data = await crmService.getOpportunity(session.companyId, id);
    if (!data) return { success: false, error: 'La oportunidad no existe o fue eliminada' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createOpportunityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = opportunityCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const created = await crmService.createOpportunity(session.companyId, {
      ...parsed.data,
      // Sin responsable explícito, queda a cargo de quien la crea.
      ownerUserId: parsed.data.ownerUserId ?? session.id,
    });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Opportunity',
      entityId: created.id,
      metadata: { title: created.title, amount: created.amount, stage: created.stage, dealType: created.dealType },
    });
    revalidateCrm();
    return { success: true, data: { id: created.id }, message: 'Oportunidad creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateOpportunityAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = opportunityUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const updated = await crmService.updateOpportunity(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Opportunity',
      entityId: updated.id,
      metadata: { title: updated.title, amount: updated.amount, dealType: updated.dealType },
    });
    revalidateCrm();
    return { success: true, data: { id: updated.id }, message: 'Oportunidad actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function moveOpportunityStageAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = moveStageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const { before, after } = await crmService.moveOpportunityStage(session.companyId, id, parsed.data);
    if (before.stage !== after.stage) {
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'UPDATE',
        entity: 'Opportunity',
        entityId: id,
        metadata: { from: before.stage, to: after.stage, lostReason: after.lostReason },
      });
      // Después de confirmar el cambio, nunca dentro de una transacción (ver
      // CLAUDE.md, motor de automatizaciones).
      if (after.stage === 'WON') {
        const detail = await crmService.getOpportunity(session.companyId, id);
        void emitWorkflowEvent(session.companyId, 'OPPORTUNITY_WON', {
          opportunityId: id,
          title: after.title,
          clientName: detail?.contact?.razonSocial ?? after.prospectName ?? '',
          amount: after.amount,
          ownerName: detail?.owner?.name ?? '',
        });
      }
    }
    revalidateCrm();
    return { success: true, data: { id }, message: `Movida a ${STAGE_LABELS[parsed.data.stage]}` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteOpportunityAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    await crmService.deleteOpportunity(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Opportunity',
      entityId: id,
    });
    revalidateCrm();
    return { success: true, data: null, message: 'Oportunidad eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Negocio de auspicio ganado → contrato en el módulo Auspicios. Exige ambos
 * permisos de escritura: crear un contrato es una acción del módulo de
 * Auspicios aunque se dispare desde el CRM.
 */
export async function convertToSponsorshipAction(id: string, input: unknown): Promise<ActionResult<{ contractId: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    await requireAuthWithPermission('sponsorships:write');
    const parsed = convertToSponsorshipSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const { contract, opportunity } = await crmService.convertToSponsorship(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipContract',
      entityId: contract.id,
      metadata: { fromOpportunity: opportunity.id, title: opportunity.title, tier: contract.tier, cashAmount: contract.cashAmount },
    });
    revalidateCrm();
    revalidatePath('/dashboard/sponsorships');
    return { success: true, data: { contractId: contract.id }, message: 'Contrato de auspicio creado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addActivityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = activityCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const activity = await crmService.addActivity(session.companyId, session.id, parsed.data);
    revalidateCrm();
    return { success: true, data: { id: activity.id }, message: parsed.data.completed ? 'Actividad registrada' : 'Actividad agendada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function setActivityCompletedAction(activityId: string, completed: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    await crmService.setActivityCompleted(session.companyId, activityId, completed);
    revalidateCrm();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function rescheduleActivityAction(activityId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = activityRescheduleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await crmService.rescheduleActivity(session.companyId, activityId, parsed.data.dueAt);
    revalidateCrm();
    return { success: true, data: null, message: 'Actividad reprogramada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteActivityAction(activityId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    await crmService.deleteActivity(session.companyId, activityId);
    revalidateCrm();
    return { success: true, data: null, message: 'Actividad eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export interface CrmAgenda {
  tasks: CrmTask[];
  currentUserId: string;
}

export async function listTasksAction(filters: { mine?: boolean } = {}): Promise<ActionResult<CrmAgenda>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const tasks = await crmService.listTasks(session.companyId, { ownerUserId: filters.mine ? session.id : undefined });
    return { success: true, data: { tasks, currentUserId: session.id } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Personas de contacto
// ---------------------------------------------------------------------------

export async function listPeopleAction(search?: string): Promise<ActionResult<CrmPersonRow[]>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    return { success: true, data: await crmService.listPeople(session.companyId, typeof search === 'string' ? search.slice(0, 100) : undefined) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function searchPeopleAction(query: string): Promise<ActionResult<PersonOption[]>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    return { success: true, data: await crmService.searchPeople(session.companyId, String(query).slice(0, 100)) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPersonAction(id: string): Promise<ActionResult<CrmPersonDetail>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const person = await crmService.getPerson(session.companyId, id);
    if (!person) return { success: false, error: 'La persona no existe o fue eliminada' };
    return { success: true, data: person };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPersonAction(input: unknown): Promise<ActionResult<PersonOption>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = personCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const person = await crmService.createPerson(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CrmPerson',
      entityId: person.id,
      metadata: { fullName: person.fullName },
    });
    revalidateCrm();
    return {
      success: true,
      data: { id: person.id, fullName: person.fullName, jobTitle: person.jobTitle, organization: person.organizationName },
      message: 'Contacto creado',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePersonAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    const parsed = personUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const person = await crmService.updatePerson(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CrmPerson',
      entityId: person.id,
      metadata: { fullName: person.fullName },
    });
    revalidateCrm();
    return { success: true, data: { id: person.id }, message: 'Contacto actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deletePersonAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('crm:write');
    await crmService.deletePerson(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'CrmPerson',
      entityId: id,
    });
    revalidateCrm();
    return { success: true, data: null, message: 'Contacto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------

export async function getCrmReportAction(filters: { mine?: boolean } = {}): Promise<ActionResult<CrmReport>> {
  try {
    const session = await requireAuthWithPermission('crm:read');
    return { success: true, data: await crmService.getCrmReport(session.companyId, { ownerUserId: filters.mine ? session.id : undefined }) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
