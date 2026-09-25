'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Company, type Role, type TenantStatus } from '@prisma/client';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  companyCreateSchema,
  companyPlanUpdateSchema,
  companyStatusSchema,
} from '../schema';
import * as platformService from '../services/platform.service';
import type { PlatformMetrics, TenantDetail, TenantListItem, TenantMembership } from '../services/platform.service';

export type { TenantMembership };

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'Ya existe un registro con ese identificador único';
  }
  return toFriendlyErrorMessage(error);
}

export async function getPlatformMetricsAction(): Promise<ActionResult<PlatformMetrics>> {
  try {
    await requireSuperAdmin();
    return { success: true, data: await platformService.getPlatformMetrics() };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listTenantsAction(query?: string): Promise<ActionResult<TenantListItem[]>> {
  try {
    await requireSuperAdmin();
    return { success: true, data: await platformService.listTenants(query) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getTenantAction(companyId: string): Promise<ActionResult<TenantDetail>> {
  try {
    await requireSuperAdmin();
    const tenant = await platformService.getTenant(companyId);
    if (!tenant) return { success: false, error: 'Empresa no encontrada' };
    return { success: true, data: tenant };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createTenantAction(input: unknown): Promise<ActionResult<Company>> {
  try {
    const session = await requireSuperAdmin();
    const parsed = companyCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const company = await platformService.createTenant(parsed.data);

    // La bitácora vive dentro del tenant creado: es donde su propio auditor la buscará.
    await createAuditLog({
      companyId: company.id,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Company',
      entityId: company.id,
      metadata: {
        plan: parsed.data.planName,
        adminEmail: parsed.data.adminEmail,
        creadaPor: 'superadmin',
      },
    });

    revalidatePath('/superadmin/companies');
    revalidatePath('/superadmin');
    return { success: true, data: company, message: `Empresa ${company.businessName} creada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateTenantPlanAction(companyId: string, input: unknown): Promise<ActionResult<Company>> {
  try {
    const session = await requireSuperAdmin();
    const parsed = companyPlanUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const company = await platformService.updateTenantPlan(companyId, parsed.data);

    await createAuditLog({
      companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanyFeatures',
      entityId: companyId,
      metadata: { plan: parsed.data.planName, features: parsed.data.features, disabledNavItems: parsed.data.disabledNavItems ?? null },
    });

    revalidatePath(`/superadmin/companies/${companyId}`);
    revalidatePath('/superadmin/companies');
    // El sidebar del cliente se arma desde estos flags: sin esto seguiría
    // mostrando los módulos recién revocados hasta el próximo hard refresh.
    revalidatePath('/dashboard', 'layout');
    return { success: true, data: company, message: 'Plan y módulos actualizados' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Válvula de emergencia si un cliente activó la lista de IPs y quedó bloqueado por completo. */
export async function disableTenantIpAllowlistAction(companyId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();
    await platformService.disableTenantIpAllowlist(companyId);

    await createAuditLog({
      companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: companyId,
      metadata: { reason: 'ip_allowlist_disabled_by_superadmin' },
    });

    revalidatePath(`/superadmin/companies/${companyId}`);
    return { success: true, data: null, message: 'Restricción por IP desactivada para esta empresa' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function setTenantStatusAction(companyId: string, input: unknown): Promise<ActionResult<Company>> {
  try {
    const session = await requireSuperAdmin();
    const parsed = companyStatusSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Estado inválido' };

    const company = await platformService.setTenantStatus(companyId, parsed.data.status as TenantStatus);

    await createAuditLog({
      companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Company',
      entityId: companyId,
      metadata: { status: parsed.data.status },
    });

    revalidatePath('/superadmin/companies');
    revalidatePath(`/superadmin/companies/${companyId}`);
    revalidatePath('/dashboard', 'layout');
    return { success: true, data: company, message: `Empresa ${company.businessName} actualizada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listTenantMembershipsAction(companyId: string): Promise<ActionResult<TenantMembership[]>> {
  try {
    await requireSuperAdmin();
    return { success: true, data: await platformService.listTenantMemberships(companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function grantCompanyMembershipAction(companyId: string, userEmail: string, role: Role): Promise<ActionResult<TenantMembership>> {
  try {
    const session = await requireSuperAdmin();
    const membership = await platformService.grantCompanyMembership(companyId, userEmail.trim().toLowerCase(), role);

    await createAuditLog({
      companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CompanyMembership',
      entityId: membership.id,
      metadata: { reason: 'multi_company_membership_granted', memberEmail: membership.userEmail, role },
    });

    revalidatePath(`/superadmin/companies/${companyId}`);
    return { success: true, data: membership, message: `${membership.userEmail} ahora puede administrar esta empresa` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeCompanyMembershipAction(companyId: string, membershipId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();
    await platformService.revokeCompanyMembership(companyId, membershipId);

    await createAuditLog({
      companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'CompanyMembership',
      entityId: membershipId,
      metadata: { reason: 'multi_company_membership_revoked' },
    });

    revalidatePath(`/superadmin/companies/${companyId}`);
    return { success: true, data: null, message: 'Acceso revocado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
