'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthContext, AuthError } from '@/lib/auth/guards';
import { createSessionToken, setSessionCookieServer } from '@/lib/auth/session';
import { toFeatureFlags } from '@/lib/auth/modules';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import { listAccessibleCompanies } from '@/lib/auth/accessible-companies';
import { createAuditLog } from '@/lib/auth/audit';
import { recordSession, revokeSessionByToken } from '@/lib/auth/sessions';
import { captureException } from '@/lib/observability';
import { checkIpAllowlist } from '@/lib/auth/ip-allowlist-guard';
import { getClientIp } from '@/lib/security/cloudflare';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/** Empresa que este usuario puede activar: la hogar, o cualquiera con una `CompanyMembership` vigente. */
export interface SwitchableCompany {
  id: string;
  name: string;
  isHome: boolean;
  /** Es la empresa en la que está trabajando ahora. */
  isActive: boolean;
  /** `false` si está suspendida o cancelada: se muestra, pero no se puede elegir. */
  available: boolean;
}

/**
 * Lista para el selector de empresa (barra lateral y `/seleccionar-empresa`)
 * — separado de `getAuthContext()` a propósito: esa función ya resuelve la
 * empresa ACTIVA (para el resto del sistema), esta resuelve TODAS las que el
 * usuario podría activar (`listAccessibleCompanies`, misma regla que guards).
 */
export async function listSwitchableCompaniesAction(): Promise<ActionResult<SwitchableCompany[]>> {
  try {
    const session = await getAuthContext();
    const companies = await listAccessibleCompanies(session.id);
    if (companies.length === 0) return { success: false, error: 'Sesión sin empresa asociada' };
    return {
      success: true,
      data: companies.map((company) => ({
        id: company.id,
        name: company.name,
        isHome: company.isHome,
        isActive: company.id === session.companyId,
        available: company.operational,
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof AuthError ? error.message : 'No se pudo cargar la lista de empresas' };
  }
}

/**
 * Cambia la empresa activa de la sesión sin pedir contraseña de nuevo.
 * Reemite el JWT (mismo mecanismo que el login, `createSessionToken`) con
 * `activeCompanyId` apuntando a la empresa destino — nunca confía en el rol
 * actual del cliente: valida de nuevo contra la base que el destino sea la
 * empresa hogar o una `CompanyMembership` vigente con `hasMultiCompany`
 * activo antes de emitir la cookie nueva.
 *
 * Devuelve `ActionResult<null>` en el camino de error (Sección 4 del
 * CLAUDE.md) — `redirect()` de Next.js lanza internamente para cortar el
 * render, así que va DESPUÉS del `try/catch`, nunca dentro: atraparlo ahí
 * lo convertiría en un error genérico y el redirect nunca ocurriría.
 */
export async function switchActiveCompanyAction(targetCompanyId: string): Promise<ActionResult<null>> {
  const session = await getAuthContext();

  // Ya está trabajando en esa empresa (p. ej. la eligió en el selector del
  // login y era la hogar): no hace falta reemitir la sesión ni auditar un cambio.
  if (targetCompanyId === session.companyId) redirect('/dashboard');

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      role: true,
      email: true,
      companyId: true,
      isSuperAdmin: true,
      sessionVersion: true,
      company: { select: { businessName: true, status: true } },
    },
  });
  if (!user) return { success: false, error: 'Sesión inválida o expirada' };

  let targetCompanyName: string | undefined;
  let targetStatus = user.company?.status;
  let allowed = targetCompanyId === user.companyId;
  if (allowed) {
    targetCompanyName = user.company?.businessName;
  } else {
    const membership = await prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: targetCompanyId } },
      include: { company: { select: { businessName: true, status: true, features: true } } },
    });
    allowed = !!membership && toFeatureFlags(membership.company.features).hasMultiCompany;
    targetCompanyName = membership?.company.businessName;
    targetStatus = membership?.company.status;
  }
  if (!allowed) return { success: false, error: 'No tienes acceso a esa empresa' };
  // Una empresa suspendida no se puede activar: la sesión quedaría apuntando
  // a ella y cada pantalla mandaría a /suspended.
  if (!targetStatus || !isOperationalTenant(targetStatus)) {
    return { success: false, error: 'Esa empresa no está activa. Contacta a soporte' };
  }

  // SEG-07: la lista de IP se valida contra la empresa DESTINO antes de
  // emitir el token nuevo — cambiar de empresa no debe saltarse una política
  // más estricta que la de la empresa hogar.
  const headerList = await headers();
  const clientIp = getClientIp(headerList);
  const ipError = await checkIpAllowlist(targetCompanyId, user.isSuperAdmin, clientIp);
  if (ipError) return { success: false, error: ipError };

  const previousToken = (await cookies()).get('session')?.value;
  const token = await createSessionToken({
    id: user.id,
    role: user.role,
    email: user.email,
    companyId: user.companyId ?? undefined,
    activeCompanyId: targetCompanyId,
    isSuperAdmin: user.isSuperAdmin,
    sessionVersion: user.sessionVersion,
  });
  await setSessionCookieServer(token);

  // El JWT nuevo necesita su fila en `UserSession`: sin ella, "Dispositivos
  // activos" no lo muestra ni puede revocarlo, y seguía válido hasta expirar
  // (SEG-05). La sesión anterior se revoca para no dejar dos tokens vivos.
  await recordSession({
    userId: user.id,
    companyId: targetCompanyId,
    token,
    userAgent: headerList.get('user-agent'),
    ipAddress: getClientIp(headerList),
  });
  if (previousToken) {
    await revokeSessionByToken(previousToken).catch((error: unknown) =>
      captureException(error, { module: 'auth', userId: user.id, extra: { reason: 'switch-company-revoke-previous' } })
    );
  }

  // Auditado en la empresa DESTINO (no en la de origen): es donde alguien
  // revisando "quién entró a mi empresa" va a buscarlo.
  await createAuditLog({
    companyId: targetCompanyId,
    userId: user.id,
    userEmail: user.email,
    action: 'UPDATE',
    entity: 'CompanyMembership',
    entityId: user.id,
    metadata: { reason: 'active_company_switch', targetCompanyName },
  });

  redirect('/dashboard');
}
