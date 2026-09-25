'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { Prisma, type Company, type CompanySettings } from '@prisma/client';
import type { CompanySettingsView } from '@/lib/services/company.service';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import * as companyService from '@/lib/services/company.service';
import { getClientIp } from '@/lib/security/cloudflare';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const companyProfileSchema = z.object({
  rut: z.string().min(1, 'El RUT es obligatorio'),
  businessName: z.string().min(1, 'La razón social es obligatoria'),
  giro: z.string().optional(),
  address: z.string().optional(),
  comuna: z.string().optional(),
  ciudad: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  backgroundUrl: z.string().nullable().optional(),
  actividadEconomicaCodigo: z.string().optional(),
});

const companySettingsSchema = z.object({
  industryType: z.enum(['SERVICES', 'COMMERCE', 'DISTRIBUTION', 'RETAIL', 'LIGHT_MANUFACTURING']),
  allowNegativeStock: z.boolean(),
  ppmRateBasisPoints: z.number().int().min(0).max(10000),
  honorariumRetentionBps: z.number().int().min(0).max(10000),
  fiscalYear: z.number().int().min(2020).max(2100),
  purchaseApprovalThreshold: z.number().int().nonnegative().nullable(),
  siiApiEnabled: z.boolean().optional(),
  siiApiBaseUrl: z.string().trim().max(2048).nullable().optional(),
  siiApiKey: z.string().trim().max(2048).nullable().optional(),
  siiApiSecret: z.string().trim().max(2048).nullable().optional(),
});

const ipAllowlistSchema = z.object({
  enabled: z.boolean(),
  entries: z.array(z.string()),
});

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe otra empresa registrada con ese RUT';
  }
  return toFriendlyErrorMessage(error);
}

export async function getCompanyProfileAction(): Promise<ActionResult<Company>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const company = await companyService.getCompanyProfile(session.companyId);
    if (!company) return { success: false, error: 'Empresa no encontrada' };
    return { success: true, data: company };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateCompanyProfileAction(input: unknown): Promise<ActionResult<Company>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const parsed = companyProfileSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await companyService.updateCompanyProfile(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Company',
      entityId: session.companyId,
      metadata: { changes: parsed.data },
    });
    revalidatePath('/dashboard/settings/company');
    revalidatePath('/dashboard');
    return { success: true, data, message: 'Perfil de empresa actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCompanySettingsAction(): Promise<ActionResult<CompanySettingsView>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    return { success: true, data: await companyService.getCompanySettings(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateCompanySettingsAction(input: unknown): Promise<ActionResult<CompanySettingsView>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const parsed = companySettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await companyService.updateCompanySettings(session.companyId, parsed.data);
    // Nunca la credencial en claro al log de auditoría: solo si cambió.
    const { siiApiKey, siiApiSecret, ...safeChanges } = parsed.data;
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: data.id,
      metadata: {
        changes: {
          ...safeChanges,
          ...(siiApiKey !== undefined ? { siiApiKey: siiApiKey ? '[definida]' : null } : {}),
          ...(siiApiSecret !== undefined ? { siiApiSecret: siiApiSecret ? '[definida]' : null } : {}),
        },
      },
    });
    revalidatePath('/dashboard/settings/company');
    revalidatePath('/dashboard');
    return { success: true, data, message: 'Configuración tributaria y operativa actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Para el botón "agregar mi IP actual" del formulario — evita que alguien active la lista sin haberse agregado a sí mismo. */
export async function getMyCurrentIpAction(): Promise<ActionResult<string | null>> {
  try {
    await requireAuthWithPermission('settings:company');
    const headerList = await headers();
    const ip = getClientIp(headerList);
    return { success: true, data: ip };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateIpAllowlistAction(input: unknown): Promise<ActionResult<CompanySettings>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const parsed = ipAllowlistSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await companyService.updateIpAllowlist(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: data.id,
      metadata: { reason: 'ip_allowlist_updated', enabled: parsed.data.enabled, entryCount: parsed.data.entries.length },
    });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data, message: parsed.data.enabled ? 'Restricción por IP activada' : 'Restricción por IP desactivada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
