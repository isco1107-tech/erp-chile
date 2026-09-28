import 'server-only';

import type { CompanyFeatures, TenantStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toFeatureFlags } from '@/lib/auth/modules';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import { ROLE_LABELS } from '@/lib/auth/roles';

/**
 * Empresas en las que un mismo login puede trabajar: la hogar
 * (`User.companyId`) más cada `CompanyMembership` cuya empresa tenga el
 * módulo `hasMultiCompany`. Es la misma regla que aplica `loadContext()`
 * (guards.ts) al resolver la empresa activa, así que la lista del selector
 * (login y barra lateral) nunca ofrece una empresa que después no abriría.
 */
export interface AccessibleCompany {
  id: string;
  name: string;
  isHome: boolean;
  status: TenantStatus;
  /** `false` si está suspendida o cancelada: se muestra, pero no se puede elegir. */
  operational: boolean;
  /** Con qué rol trabaja en ESA empresa (puede ser distinto en cada una). */
  roleLabel: string | null;
}

interface CompanyRow {
  id: string;
  businessName: string;
  status: TenantStatus;
  features: CompanyFeatures | null;
  roleLabel?: string | null;
}

/** Parte pura (testeable): arma la lista a partir de la empresa hogar y las membresías. */
export function buildAccessibleCompanies(home: CompanyRow | null, memberships: CompanyRow[]): AccessibleCompany[] {
  const companies: AccessibleCompany[] = [];
  const seen = new Set<string>();
  const push = (company: CompanyRow, isHome: boolean) => {
    if (seen.has(company.id)) return;
    seen.add(company.id);
    companies.push({
      id: company.id,
      name: company.businessName,
      isHome,
      status: company.status,
      operational: isOperationalTenant(company.status),
      roleLabel: company.roleLabel ?? null,
    });
  };
  if (home) push(home, true);
  for (const company of memberships) {
    if (toFeatureFlags(company.features).hasMultiCompany) push(company, false);
  }
  return companies;
}

const companySelect = { id: true, businessName: true, status: true, features: true } as const;

export async function listAccessibleCompanies(userId: string): Promise<AccessibleCompany[]> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, customRole: { select: { name: true } }, company: { select: companySelect } },
    }),
    prisma.companyMembership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, customRole: { select: { name: true } }, company: { select: companySelect } },
    }),
  ]);
  const home = user?.company ? { ...user.company, roleLabel: user.customRole?.name ?? ROLE_LABELS[user.role] } : null;
  return buildAccessibleCompanies(
    home,
    memberships.map((membership) => ({ ...membership.company, roleLabel: membership.customRole?.name ?? ROLE_LABELS[membership.role] }))
  );
}

/** Cuántas empresas puede elegir de verdad (operativas): con 2 o más, el login pregunta en cuál trabajar. */
export function selectableCount(companies: AccessibleCompany[]): number {
  return companies.filter((company) => company.operational).length;
}
