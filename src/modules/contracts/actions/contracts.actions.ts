'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { contractStatusSchema, serviceContractSchema } from '../schema';
import * as contractsService from '../services/contracts.service';
import { billContractPeriod } from '../services/billing.service';
import type { ContractDetail, ContractListRow, ContractLookups } from '../services/contracts.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function revalidateContracts(id?: string) {
  revalidatePath('/dashboard/contracts');
  if (id) revalidatePath(`/dashboard/contracts/${id}`);
}

export async function listContractsAction(): Promise<ActionResult<ContractListRow[]>> {
  try {
    const session = await requireAuthWithPermission('contracts:read');
    return { success: true, data: await contractsService.listContracts(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getContractAction(id: string): Promise<ActionResult<ContractDetail>> {
  try {
    const session = await requireAuthWithPermission('contracts:read');
    const data = await contractsService.getContract(session.companyId, id);
    if (!data) return { success: false, error: 'El contrato no existe' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getContractLookupsAction(): Promise<ActionResult<ContractLookups>> {
  try {
    const session = await requireAuthWithPermission('contracts:write');
    return { success: true, data: await contractsService.getContractLookups(session.companyId, session.features.hasEventProjects) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveContractAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('contracts:write');
    const parsed = serviceContractSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    // Con emisión automática el cron emite documentos tributarios (folio,
    // stock, asiento) sin que nadie más intervenga: configurarla exige poder
    // emitir ventas, no solo administrar contratos.
    if (parsed.data.autoIssue && !can(session, 'sales:write')) {
      return { success: false, error: 'Para activar la emisión automática necesitas permiso para crear ventas; guárdalo en modo borrador' };
    }
    const contract = id
      ? await contractsService.updateContract(session.companyId, id, parsed.data)
      : await contractsService.createContract(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'ServiceContract',
      entityId: contract.id,
      metadata: { name: contract.name, frequency: contract.frequency, dteType: contract.dteType, autoIssue: contract.autoIssue },
    });
    revalidateContracts(contract.id);
    return { success: true, data: { id: contract.id }, message: id ? 'Contrato actualizado' : 'Contrato creado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function setContractStatusAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('contracts:write');
    const parsed = contractStatusSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Estado inválido' };
    // Reactivar un contrato con emisión automática vuelve a emitir documentos: mismo requisito que activarla.
    if (parsed.data.status === 'ACTIVE' && !can(session, 'sales:write') && (await contractsService.isAutoIssue(session.companyId, id))) {
      return { success: false, error: 'Este contrato emite automáticamente: para reactivarlo necesitas permiso para crear ventas' };
    }
    await contractsService.setContractStatus(session.companyId, id, parsed.data.status);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ServiceContract', entityId: id, metadata: { status: parsed.data.status } });
    revalidateContracts(id);
    const messages = { ACTIVE: 'Contrato reactivado', PAUSED: 'Contrato en pausa: no se facturará hasta reactivarlo', ENDED: 'Contrato terminado' } as const;
    return { success: true, data: null, message: messages[parsed.data.status] };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteContractAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('contracts:write');
    await contractsService.deleteContract(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'ServiceContract', entityId: id });
    revalidateContracts();
    return { success: true, data: null, message: 'Contrato eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Factura ya el próximo período del contrato. Genera un documento de venta,
 * así que además de `contracts:write` exige poder crear ventas.
 */
export async function billContractNowAction(id: string): Promise<ActionResult<{ salesDocumentId: string | null }>> {
  try {
    const session = await requireAuthWithPermission('contracts:write');
    if (!can(session, 'sales:write')) return { success: false, error: 'Necesitas permiso para crear ventas para facturar un contrato' };
    const outcome = await billContractPeriod(session.companyId, id, { force: true });
    revalidateContracts(id);
    revalidatePath('/dashboard/sales');
    if (outcome.kind === 'failed') return { success: false, error: `No se pudo facturar el período ${outcome.periodKey}: ${outcome.error}` };
    if (outcome.kind === 'ended') return { success: true, data: { salesDocumentId: null }, message: 'El contrato llegó a su fecha de término' };
    if (outcome.kind === 'not_due') return { success: true, data: { salesDocumentId: null }, message: 'No hay período por facturar' };
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ServiceContractBilling',
      entityId: id,
      metadata: { periodKey: outcome.periodKey, salesDocumentId: outcome.salesDocumentId, issued: outcome.issued },
    });
    return {
      success: true,
      data: { salesDocumentId: outcome.salesDocumentId },
      message: outcome.issued ? `Período ${outcome.periodKey} facturado y emitido` : `Período ${outcome.periodKey} facturado como borrador: revísalo y emítelo`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
